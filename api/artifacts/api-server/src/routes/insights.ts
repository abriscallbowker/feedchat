import { Router, type IRouter, Response } from "express";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth.js";
import { computeAndBackfillOrgAggregates } from "../lib/orgAggregates.js";
import { getOrgDoc, invalidateOrg } from "../lib/orgCache.js";
import { getLatestSummary } from "../lib/summaryCache.js";

const router: IRouter = Router();

router.get(
  "/overview",
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

    const [orgData, latestSummary] = await Promise.all([
      getOrgDoc(orgId),
      getLatestSummary(orgId),
    ]);

    if (!orgData) {
      res.status(404).json({ error: "Org not found" });
      return;
    }

    let chatCountTotal: number;
    let chatCount: Record<string, number>;
    let sentimentAverageTotal: number | null;
    let sentimentAverage: Record<string, number>;

    const storedChats = orgData.chats as Record<string, number> | undefined;
    const storedSentiment = orgData.sentiment as Record<string, number> | undefined;

    if (storedChats?.total !== undefined && storedSentiment?.average !== undefined) {
      const { total: total_, ...monthCounts } = storedChats;
      const { average, ...monthAverages } = storedSentiment;

      chatCountTotal = total_;
      chatCount = monthCounts;
      sentimentAverageTotal = average;
      sentimentAverage = monthAverages;
    } else {
      ({ chatCountTotal, chatCount, sentimentAverageTotal, sentimentAverage } =
        await computeAndBackfillOrgAggregates(orgId));
      invalidateOrg(orgId);
    }

    res.json({
      orgId,
      sentimentAverageTotal,
      sentimentAverage,
      chatCountTotal,
      chatCount,
      latestSummary,
    });
  },
);

export default router;
