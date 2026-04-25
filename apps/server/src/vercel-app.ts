import express from "express";
import feedchatApp from "./app";
import { startSummaryWorker } from "./lib/summaryWorker";
import { startLlmSummaryWorker } from "./lib/llmSummaryWorker";

/**
 * Single Express stack mounted at `/api` so routes stay `/api/chat`, `/api/org/...`, etc.
 * Used by Next.js Pages API handlers on Vercel.
 */
const handler = express();
handler.use("/api", feedchatApp);

declare global {
  // eslint-disable-next-line no-var
  var __feedchatWorkersStarted: boolean | undefined;
}

// Local/OSS note:
// In this repo, the API is commonly run via Next.js `pages/api/[[...path]]`,
// which imports this handler. In that mode, `src/index.ts` never runs, so the
// background workers would never start unless we start them here.
if (
  process.env.FEEDCHAT_DISABLE_WORKERS?.trim() !== "true" &&
  !globalThis.__feedchatWorkersStarted
) {
  globalThis.__feedchatWorkersStarted = true;
  startSummaryWorker();
  startLlmSummaryWorker();
}

export default handler;
