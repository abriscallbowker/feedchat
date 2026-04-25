import { Router, type IRouter, Response } from "express";
import { getStripeForRequest } from "../lib/stripe.js";
import { getOrgDoc } from "../lib/orgCache.js";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth.js";

const FALLBACK_PORTAL_URL =
  "https://billing.stripe.com/p/login/3cI00l4ztc3f9X360R7g400";

const router: IRouter = Router();

router.get(
  "/stripe/portal",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const orgId = req.orgId;
      if (!orgId) {
        res.json({ url: FALLBACK_PORTAL_URL });
        return;
      }

      const orgData = await getOrgDoc(orgId);
      if (!orgData) {
        res.json({ url: FALLBACK_PORTAL_URL });
        return;
      }

      const customerId: string | undefined = orgData.stripeCustomerId as string | undefined;
      if (!customerId) {
        res.json({ url: FALLBACK_PORTAL_URL });
        return;
      }

      const returnUrl =
        process.env.PORTAL_RETURN_URL ?? "https://dash.feedchat.io/";

      const stripeClient = getStripeForRequest(req);
      const session = await stripeClient.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      res.json({ url: session.url });
    } catch {
      res.json({ url: FALLBACK_PORTAL_URL });
    }
  },
);

export default router;
