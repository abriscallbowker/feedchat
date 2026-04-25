import { Router, type IRouter, Request, Response } from "express";
import { summarizeChat } from "../lib/summaryService.js";
import { internalOnly } from "../middlewares/internalOnly.js";
import { apiKeyAuth } from "../middlewares/apiKeyAuth.js";
import { processOrgs } from "../lib/llmSummaryWorker.js";
import { firestore } from "../lib/firebase.js";

const router: IRouter = Router();

const SUMMARY_ALL_RATE_LIMIT_MS = 24 * 60 * 60 * 1000;
const SUMMARY_ALL_CONFIG_DOC = "config/summaryAllJob";

router.post("/summary", internalOnly, async (req: Request, res: Response): Promise<void> => {
  const { orgId, chatId } = req.body as { orgId?: string; chatId?: string };

  if (!orgId || !chatId) {
    res.status(400).json({ error: "orgId and chatId are required" });
    return;
  }

  const result = await summarizeChat(orgId, chatId, req.log);

  if (result.status === "skipped") {
    res.json({ message: result.reason });
    return;
  }

  if (result.status === "error") {
    res.status(500).json({ error: result.reason });
    return;
  }

  res.json({
    chatId: result.chatId,
    sentimentScore: result.sentimentScore,
    summary: result.summary,
  });
});

router.post(
  "/summary/all",
  apiKeyAuth,
  async (req: Request, res: Response): Promise<void> => {
    const configRef = firestore.doc(SUMMARY_ALL_CONFIG_DOC);
    const configSnap = await configRef.get();
    const lastRun: string | undefined = configSnap.data()?.lastRun;

    if (lastRun) {
      const elapsed = Date.now() - new Date(lastRun).getTime();
      if (elapsed < SUMMARY_ALL_RATE_LIMIT_MS) {
        const retryAfterSec = Math.ceil((SUMMARY_ALL_RATE_LIMIT_MS - elapsed) / 1000);
        res.setHeader("Retry-After", String(retryAfterSec));
        res.status(429).json({
          error: "This endpoint can only be called once per day",
          retryAfterSeconds: retryAfterSec,
        });
        return;
      }
    }

    await configRef.set({ lastRun: new Date().toISOString() });

    res.status(202).json({ message: "Summary generation triggered for all organisations" });

    processOrgs().catch((err) => {
      req.log.error({ err }, "summary/all: unhandled error during processOrgs");
    });
  },
);

export default router;
