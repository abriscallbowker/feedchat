import { Router, type IRouter, Response } from "express";
import Stripe from "stripe";
import { firestore } from "../lib/firebase.js";
import { getStripeForRequest, getPlanConfigForRequest } from "../lib/stripe.js";
import { getOrgDoc, invalidateOrg } from "../lib/orgCache.js";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth.js";

const router: IRouter = Router();

router.get(
  "/checkout",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const plan = req.query.plan as string | undefined;

      if (!plan) {
        res.status(400).json({ error: "plan query parameter is required" });
        return;
      }

      const plans = getPlanConfigForRequest(req);
      const planCfg = plans[plan as keyof typeof plans];
      if (!planCfg) {
        res.status(400).json({ error: `Invalid plan. Must be one of: ${Object.keys(plans).join(", ")}` });
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

      const orgData = await getOrgDoc(orgId);
      if (!orgData) {
        res.status(404).json({ error: "Org not found" });
        return;
      }

      let customerId: string | undefined = orgData.stripeCustomerId as string | undefined;

      const stripeClient = getStripeForRequest(req);

      if (!customerId) {
        const userEmail = (req.userData.email as string | undefined) ?? "";
        const customer = await stripeClient.customers.create({
          email: userEmail,
          metadata: { orgId },
        });
        customerId = customer.id;
        await firestore.collection("orgs").doc(orgId).update({
          stripeCustomerId: customerId,
        });
        invalidateOrg(orgId);
      }

      const subscription = await stripeClient.subscriptions.create({
        customer: customerId,
        items: [{ price: planCfg.priceId }],
        trial_period_days: 7,
        payment_behavior: "default_incomplete",
        payment_settings: { save_default_payment_method: "on_subscription" },
        expand: ["pending_setup_intent", "latest_invoice.confirmation_secret"],
        metadata: { orgId, plan },
      });

      const setupIntent = subscription.pending_setup_intent as Stripe.SetupIntent | null;
      const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
      const invoiceClientSecret = latestInvoice?.confirmation_secret?.client_secret ?? null;

      const clientSecret = setupIntent?.client_secret ?? invoiceClientSecret ?? null;

      if (!clientSecret) {
        res.status(500).json({ error: "Could not retrieve payment client secret" });
        return;
      }

      res.json({
        subscriptionId: subscription.id,
        clientSecret,
        type: setupIntent ? "setup" : "payment",
      });
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        req.log.error({ err }, "Stripe error in /checkout");
        res.status(err.statusCode ?? 500).json({
          error: err.message,
          code: err.code,
          type: err.type,
        });
      } else {
        req.log.error({ err }, "Unexpected error in /checkout");
        res.status(500).json({ error: "Internal server error" });
      }
    }
  },
);

export default router;
