import { Router, type IRouter, Response } from "express";
import { firestore } from "../lib/firebase.js";
import { getStripeForRequest, isLocalhostRequest, productIdToPlan } from "../lib/stripe.js";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth.js";
import { syncOrgToEdgeConfigAsync } from "../lib/edgeConfig.js";
import { getOrgDoc, invalidateOrg } from "../lib/orgCache.js";
import { sendTelegramMessage } from "../lib/telegram.js";
import { sendEvent } from "../lib/loops.js";

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

const router: IRouter = Router();

router.post(
  "/subscribe",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { subscriptionId } = req.body as {
      subscriptionId?: string;
    };

    if (!subscriptionId) {
      res.status(400).json({ error: "subscriptionId is required" });
      return;
    }

    if (!req.userData) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const orgId = req.orgId;
    if (!orgId) {
      res.status(400).json({ error: "User has no associated org" });
      return;
    }
    const userEmail = req.userData.email as string | undefined;

    const stripeClient = getStripeForRequest(req);
    const useLive = !isLocalhostRequest(req) && process.env.STRIPE_ENV === "live";

    let subscription: import("stripe").Stripe.Subscription;
    try {
      subscription = await stripeClient.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price.product"],
      });
    } catch {
      res.status(400).json({ error: "Invalid or expired subscription ID" });
      return;
    }

    const { status } = subscription;
    if (status !== "active" && status !== "trialing") {
      res.status(402).json({ error: "Subscription is not active or trialing", status });
      return;
    }

    const priceData = subscription.items.data[0]?.price;
    const productId = (
      priceData?.product as import("stripe").Stripe.Product | null
    )?.id;

    const plan = productId ? productIdToPlan(productId, useLive) : null;

    if (!plan) {
      res.status(400).json({ error: "Could not determine plan from subscription" });
      return;
    }

    const isTrial = status === "trialing";
    const price = {
      unitAmount: priceData?.unit_amount ?? null,
      currency: priceData?.currency ?? null,
    };

    const orgDoc = await getOrgDoc(orgId);
    const orgSub = (orgDoc?.subscription as Record<string, unknown> | undefined) ?? {};
    const budgetCap = (orgSub.budgetCap as number | undefined) ?? 0;
    const creditLimit = PLAN_CREDIT_LIMITS[plan] ?? 0;
    const additionalCreditRate = PLAN_ADDITIONAL_CREDIT_RATES[plan] ?? 1;
    const additionalCreditLimit = additionalCreditRate > 0 ? budgetCap / additionalCreditRate : 0;
    const totalCreditLimit = creditLimit + additionalCreditLimit;

    await firestore.collection("orgs").doc(orgId).update({
      plan,
      isTrial,
      stripeSubscriptionId: subscriptionId,
      "subscription.creditLimit": creditLimit,
      "subscription.additionalCreditRate": additionalCreditRate,
      "subscription.additionalCreditLimit": additionalCreditLimit,
      "subscription.totalCreditLimit": totalCreditLimit,
    });

    res.json({ success: true, plan, isTrial, subscriptionId, price });

    sendTelegramMessage(`New trial started ${plan} 🎉`);

    if (userEmail) {
      sendEvent(userEmail, "trialStarted");
    }

    invalidateOrg(orgId);
    syncOrgToEdgeConfigAsync(orgId);

    const customerId = orgDoc?.stripeCustomerId as string | undefined;
    if (customerId) {
      const staleSubscriptions = await stripeClient.subscriptions.list({
        customer: customerId,
        status: "trialing",
        limit: 100,
      });

      const cancelPromises = staleSubscriptions.data
        .filter((sub) => sub.id !== subscriptionId)
        .map((sub) =>
          stripeClient.subscriptions.cancel(sub.id).catch((err) => {
            console.error(`Failed to cancel stale subscription ${sub.id}:`, err);
          }),
        );

      await Promise.all(cancelPromises);

      const incompleteSubscriptions = await stripeClient.subscriptions.list({
        customer: customerId,
        status: "incomplete",
        limit: 100,
      });

      const incompletePromises = incompleteSubscriptions.data
        .filter((sub) => sub.id !== subscriptionId)
        .map((sub) =>
          stripeClient.subscriptions.cancel(sub.id).catch((err) => {
            console.error(`Failed to cancel incomplete subscription ${sub.id}:`, err);
          }),
        );

      await Promise.all(incompletePromises);
    }
  },
);

export default router;
