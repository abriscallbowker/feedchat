import { rtdb } from "./firebase";
import { summarizeChat } from "./summaryService";
import { SUMMARY_IDLE_SECONDS } from "../config";
import { logger } from "./logger";

const POLL_INTERVAL_MS = 30_000;

async function processStaleChatSessions(): Promise<void> {
  const now = Date.now();
  const cutoff = now - SUMMARY_IDLE_SECONDS * 1000;

  let snapshot;
  try {
    snapshot = await rtdb.ref("/pendingSummaries").once("value");
  } catch (err) {
    logger.error(
      { err },
      "summaryWorker: failed to read /pendingSummaries from RTDB",
    );
    return;
  }

  type PendingEntry = {
    lastMessageAt?: string;
  };

  const orgs = snapshot.val() as Record<
    string,
    Record<string, PendingEntry>
  > | null;

  if (!orgs) return;

  const candidates: Array<{ orgId: string; chatId: string }> = [];

  for (const [orgId, chats] of Object.entries(orgs)) {
    if (!chats || typeof chats !== "object") continue;
    for (const [chatId, pending] of Object.entries(chats)) {
      if (!pending || typeof pending !== "object") continue;
      if (!pending.lastMessageAt) continue;

      const lastMessageAt = new Date(pending.lastMessageAt).getTime();
      if (isNaN(lastMessageAt) || lastMessageAt > cutoff) continue;

      candidates.push({ orgId, chatId });
    }
  }

  if (candidates.length === 0) return;

  logger.info(
    { count: candidates.length },
    "summaryWorker: found stale chat sessions to summarize",
  );

  await Promise.allSettled(
    candidates.map(({ orgId, chatId }) =>
      summarizeChat(orgId, chatId, logger).catch((err) => {
        logger.error(
          { err, orgId, chatId },
          "summaryWorker: unexpected error summarizing chat",
        );
      }),
    ),
  );
}

export function startSummaryWorker(): void {
  logger.info(
    { pollIntervalMs: POLL_INTERVAL_MS, idleSeconds: SUMMARY_IDLE_SECONDS },
    "summaryWorker: started",
  );

  const run = async () => {
    try {
      await processStaleChatSessions();
    } catch (err) {
      logger.error({ err }, "summaryWorker: unhandled error in poll cycle");
    }
  };

  run();
  setInterval(run, POLL_INTERVAL_MS);
}
