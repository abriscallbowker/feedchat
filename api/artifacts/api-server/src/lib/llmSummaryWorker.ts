import { firestore } from "./firebase.js";
import { generateOrgSummary } from "./llmSummaryService.js";
import { logger } from "./logger.js";

const POLL_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function processOrgs(): Promise<void> {
  let orgsSnapshot;
  try {
    orgsSnapshot = await firestore.collection("orgs").get();
  } catch (err) {
    logger.error({ err }, "llmSummaryWorker: failed to read orgs from Firestore");
    return;
  }

  if (orgsSnapshot.empty) return;

  for (const orgDoc of orgsSnapshot.docs) {
    const orgId = orgDoc.id;

    try {
      const summarySnapshot = await firestore
        .collection("orgs")
        .doc(orgId)
        .collection("summary")
        .orderBy("dateSubmitted", "desc")
        .limit(1)
        .get();

      let lastSummaryDate: Date | null = null;
      if (!summarySnapshot.empty) {
        const raw = summarySnapshot.docs[0].data()?.dateSubmitted;
        if (raw) {
          lastSummaryDate = new Date(raw);
        }
      }

      let newChatQuery = firestore
        .collection("orgs")
        .doc(orgId)
        .collection("chats")
        .limit(1);

      if (lastSummaryDate !== null) {
        newChatQuery = newChatQuery.where("dateTime", ">", lastSummaryDate.toISOString());
      }

      const newChatSnapshot = await newChatQuery.get();
      const hasNewChat = !newChatSnapshot.empty;

      if (!hasNewChat) {
        logger.debug({ orgId }, "llmSummaryWorker: no new chats since last summary, skipping");
        continue;
      }

      logger.info({ orgId }, "llmSummaryWorker: new chats detected, generating LLM summary");
      const orgData = orgDoc.data();
      const companyName = ((orgData?.companyName || orgData?.name || orgId) as string);
      const result = await generateOrgSummary(orgId, companyName, logger);

      if (result.status === "skipped") {
        logger.info({ orgId, reason: result.reason }, "llmSummaryWorker: summary skipped");
      } else if (result.status === "error") {
        logger.error({ orgId, reason: result.reason }, "llmSummaryWorker: summary error");
      }
    } catch (err) {
      logger.error({ err, orgId }, "llmSummaryWorker: unexpected error processing org");
    }
  }
}

export function startLlmSummaryWorker(): void {
  logger.info(
    { pollIntervalMs: POLL_INTERVAL_MS },
    "llmSummaryWorker: started",
  );

  const run = async () => {
    try {
      await processOrgs();
    } catch (err) {
      logger.error({ err }, "llmSummaryWorker: unhandled error in poll cycle");
    }
  };

  run();
  setInterval(run, POLL_INTERVAL_MS);
}
