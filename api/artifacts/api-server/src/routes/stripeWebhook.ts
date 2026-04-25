import { Router, type IRouter, Request, Response } from "express";
import Stripe from "stripe";
import { firestore } from "../lib/firebase.js";
import {
  stripe as liveStripe,
  webhookSecret,
  productIdToPlan,
} from "../lib/stripe.js";
import { STRIPE_TEST_SECRET_KEY } from "../lib/stripeTestClient.js";
import { syncOrgToEdgeConfigAsync } from "../lib/edgeConfig.js";
import { getOrgDoc, invalidateOrg } from "../lib/orgCache.js";
import { sendEvent } from "../lib/loops.js";
import { sendTelegramMessage } from "../lib/telegram.js";

const PLAN_CREDIT_LIMITS: Record<string, number> = {
  start: 1000,
  scale: 10000,
  pro: 3_000,
};

const PLAN_ADDITIONAL_CREDIT_RATES: Record<string, number> = {
  start: 0.1,
  scale: 0.05,
  pro: 0.25,
};

function computeCreditFields(
  plan: string,
  creditLimit: number,
  budgetCap: number,
): {
  additionalCreditRate: number;
  additionalCreditLimit: number;
  totalCreditLimit: number;
} {
  const additionalCreditRate = PLAN_ADDITIONAL_CREDIT_RATES[plan] ?? 1;
  const additionalCreditLimit = budgetCap > 0 && additionalCreditRate > 0
    ? budgetCap / additionalCreditRate
    : 0;
  const totalCreditLimit = creditLimit + additionalCreditLimit;
  return { additionalCreditRate, additionalCreditLimit, totalCreditLimit };
}

const router: IRouter = Router();

async function handleWebhookRequest(
  req: Request,
  res: Response,
  signingSecret: string,
  stripeClient: Stripe,
): Promise<void> {
  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;

  try {
    event = stripeClient.webhooks.constructEvent(req.body, sig, signingSecret);
  } catch (err) {
    req.log.warn({ err }, "Stripe webhook signature verification failed");
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  req.log.info({ type: event.type }, "Stripe webhook received");

  try {
    await firestore.collection("stripeEvents").doc(event.id).create({
      type: event.type,
      processedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const code = (err as { code?: string | number })?.code;
    if (code === "already-exists" || code === 6) {
      req.log.info({ eventId: event.id, type: event.type }, "Stripe webhook already processed, skipping");
      res.json({ received: true });
      return;
    }
    req.log.error({ err, eventId: event.id }, "Failed to record Stripe event idempotency key");
    res.status(500).json({ error: "Internal error handling webhook" });
    return;
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;

        if (sub.status === "trialing") {
          // Only update Firestore once the user has submitted a payment method.
          // Stripe fires subscription.created immediately on /checkout even though
          // the subscription is incomplete with no payment method yet.
          if (!sub.default_payment_method) break;

          const productId = sub.items.data[0]?.price?.product as string | undefined;
          const plan = productId ? productIdToPlan(productId) : null;
          if (!plan) break;
          const orgId = await orgIdFromCustomer(sub.customer as string, stripeClient);
          if (!orgId) break;
          const orgData = await getOrgDoc(orgId);
          const orgSub = (orgData?.subscription as Record<string, unknown> | undefined) ?? {};
          const budgetCap = (orgSub.budgetCap as number | undefined) ?? 0;
          const creditLimit = PLAN_CREDIT_LIMITS[plan] ?? 0;
          const creditFields = computeCreditFields(plan, creditLimit, budgetCap);
          const trialRenewalDate = new Date((sub.items.data[0]?.current_period_end ?? 0) * 1000).toISOString();
          await firestore.collection("orgs").doc(orgId).update({
            plan,
            isTrial: true,
            stripeSubscriptionId: sub.id,
            "subscription.renewalDate": trialRenewalDate,
            "subscription.creditLimit": creditLimit,
            "subscription.additionalCreditRate": creditFields.additionalCreditRate,
            "subscription.additionalCreditLimit": creditFields.additionalCreditLimit,
            "subscription.totalCreditLimit": creditFields.totalCreditLimit,
            creditAlertsSent: [],
          });
          invalidateOrg(orgId);
          syncOrgToEdgeConfigAsync(orgId);
          break;
        }

        if (sub.status !== "active") break;

        const productId = sub.items.data[0]?.price?.product as string | undefined;
        const plan = productId ? productIdToPlan(productId) : null;
        if (!plan) break;

        const orgId = await orgIdFromCustomer(sub.customer as string, stripeClient);
        if (!orgId) break;

        const orgData = await getOrgDoc(orgId);
        const orgSub = (orgData?.subscription as Record<string, unknown> | undefined) ?? {};
        const budgetCap = (orgSub.budgetCap as number | undefined) ?? 0;
        const creditLimit = PLAN_CREDIT_LIMITS[plan] ?? 0;
        const creditFields = computeCreditFields(plan, creditLimit, budgetCap);
        const renewalDate = new Date((sub.items.data[0]?.current_period_end ?? 0) * 1000).toISOString();
        const prevStatus = (
          event.data as Stripe.Event.Data & { previous_attributes?: { status?: string } }
        ).previous_attributes?.status;
        const trialEndedByCredits = orgData?.trialEndedByCredits === true;

        await firestore.collection("orgs").doc(orgId).update({
          plan,
          isTrial: false,
          "subscription.renewalDate": renewalDate,
          "subscription.creditLimit": creditLimit,
          "subscription.additionalCreditRate": creditFields.additionalCreditRate,
          "subscription.additionalCreditLimit": creditFields.additionalCreditLimit,
          "subscription.totalCreditLimit": creditFields.totalCreditLimit,
          creditAlertsSent: [],
        });
        invalidateOrg(orgId);
        syncOrgToEdgeConfigAsync(orgId);

        if (prevStatus === "trialing" && !trialEndedByCredits) {
          const usersSnapshot = await firestore
            .collection("users")
            .where("org", "==", orgId)
            .get();
          usersSnapshot.docs.forEach((userDoc) => {
            const email = userDoc.data().email as string | undefined;
            if (email) {
              sendEvent(email, "trialCompleted", { reason: "your 7 days free were completed" });
            }
          });
        }

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = await orgIdFromCustomer(sub.customer as string, stripeClient);
        if (!orgId) break;

        const orgData = await getOrgDoc(orgId);
        const activeSubId = orgData?.stripeSubscriptionId as string | undefined;

        // Ignore deletions for subscriptions that aren't the org's current one.
        // This happens when a user browses to a plan and backs out before completing
        // checkout — Stripe creates and then cleans up an incomplete subscription
        // that was never the real active one.
        if (activeSubId && activeSubId !== sub.id) break;

        await firestore.collection("orgs").doc(orgId).update({ plan: "cancelled", isTrial: false });
        invalidateOrg(orgId);
        syncOrgToEdgeConfigAsync(orgId);

        const usersSnapshot = await firestore
          .collection("users")
          .where("org", "==", orgId)
          .get();
        usersSnapshot.docs.forEach((userDoc) => {
          const email = userDoc.data().email as string | undefined;
          if (email) {
            sendEvent(email, "planCancelled");
          }
        });
        sendTelegramMessage(`Plan cancelled for org ${orgId}`);

        break;
      }

      default:
        break;
    }
  } catch (err) {
    req.log.error({ err, type: event.type }, "Error handling Stripe webhook event");
    res.status(500).json({ error: "Internal error handling webhook" });
    return;
  }

  res.json({ received: true });
}

async function orgIdFromCustomer(
  customerId: string,
  stripeClient: Stripe,
): Promise<string | null> {
  const orgsSnapshot = await firestore
    .collection("orgs")
    .where("stripeCustomerId", "==", customerId)
    .limit(1)
    .get();

  if (!orgsSnapshot.empty) {
    return orgsSnapshot.docs[0].id;
  }

  try {
    const customer = await stripeClient.customers.retrieve(customerId);
    if (customer.deleted) return null;
    const email = (customer as Stripe.Customer).email;
    if (!email) return null;

    const usersSnapshot = await firestore
      .collection("users")
      .where("email", "==", email)
      .limit(1)
      .get();

    if (usersSnapshot.empty) return null;
    return usersSnapshot.docs[0].data()?.org ?? null;
  } catch {
    return null;
  }
}

router.post(
  "/stripe",
  async (req: Request, res: Response): Promise<void> => {
    await handleWebhookRequest(req, res, webhookSecret.live, liveStripe);
  },
);

router.post(
  "/stripe-sandbox",
  async (req: Request, res: Response): Promise<void> => {
    const testStripe = new Stripe(STRIPE_TEST_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
    });
    await handleWebhookRequest(req, res, webhookSecret.test, testStripe);
  },
);

export default router;
