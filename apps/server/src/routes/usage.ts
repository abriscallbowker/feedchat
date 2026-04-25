import { Router, type IRouter, Response } from "express";
import { getOrgDoc } from "../lib/orgCache";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth";

const router: IRouter = Router();

router.get(
  "/usage",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
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
    const sub = (orgData.subscription as Record<string, unknown> | undefined) ?? {};

    const budgetCap = sub.budgetCap as number | undefined;
    const additionalCreditRate = sub.additionalCreditRate as number | undefined;
    const additionalCreditLimit = sub.additionalCreditLimit as number | undefined;
    const totalCreditLimit = sub.totalCreditLimit as number | undefined;

    res.json({
      creditsUsed: (sub.creditsUsed as number | undefined) ?? 0,
      creditLimit: (sub.creditLimit as number | undefined) ?? 0,
      renewalDate: (sub.renewalDate as string | undefined) ?? null,
      ...(budgetCap !== undefined && { budgetCap }),
      ...(additionalCreditRate !== undefined && { additionalCreditRate }),
      ...(additionalCreditLimit !== undefined && { additionalCreditLimit }),
      ...(totalCreditLimit !== undefined && { totalCreditLimit }),
    });
  },
);

export default router;
