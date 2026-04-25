import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "./firebase";

function monthKey(dateTime: string | undefined): string {
  if (!dateTime) return "unknown";
  const d = new Date(dateTime);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/**
 * Atomically update the running `chats` and `sentiment` aggregates on the org
 * document whenever a new summarized chat entry is added.
 *
 * Stored structure on org doc:
 *   chats:     { total: number, [monthKey]: number }
 *   sentiment: { average: number, [monthKey]: number }
 *
 * The monthly sentiment values are running averages maintained via transaction
 * so they stay exact without needing to scan all docs.
 */
export async function updateOrgChatAggregates(
  orgId: string,
  sentimentScore: number,
  dateTime: string | undefined,
): Promise<void> {
  const mKey = monthKey(dateTime);
  const orgRef = firestore.collection("orgs").doc(orgId);

  await firestore.runTransaction(async (tx: any) => {
    const orgDoc = await tx.get(orgRef);
    const data = orgDoc.data() ?? {};

    const chatsData = (data.chats ?? {}) as Record<string, number>;
    const sentimentData = (data.sentiment ?? {}) as Record<string, number>;

    const currentTotal = chatsData.total ?? 0;
    const currentMonthCount = chatsData[mKey] ?? 0;
    const currentAvg = sentimentData.average ?? 0;
    const currentMonthAvg = sentimentData[mKey] ?? 0;

    const newAvg =
      (currentAvg * currentTotal + sentimentScore) / (currentTotal + 1);
    const newMonthAvg =
      (currentMonthAvg * currentMonthCount + sentimentScore) /
      (currentMonthCount + 1);

    tx.update(orgRef, {
      "chats.total": FieldValue.increment(1),
      [`chats.${mKey}`]: FieldValue.increment(1),
      "sentiment.average": newAvg,
      [`sentiment.${mKey}`]: newMonthAvg,
    });
  });
}

/**
 * Compute aggregates by scanning all chat docs, write them back to the org
 * document, and return the computed values. Used as a one-time fallback when
 * the pre-aggregated fields are absent.
 */
export async function computeAndBackfillOrgAggregates(orgId: string): Promise<{
  chatCountTotal: number;
  chatCount: Record<string, number>;
  sentimentAverageTotal: number | null;
  sentimentAverage: Record<string, number>;
}> {
  const snapshot = await firestore
    .collection("orgs")
    .doc(orgId)
    .collection("chats")
    .get();

  const docs = snapshot.docs;
  const chatCountTotal = docs.length;

  const monthSentiment: Record<string, { total: number; count: number }> = {};
  const chatCount: Record<string, number> = {};
  let sentimentScoreTotal = 0;

  for (const doc of docs) {
    const d = doc.data();
    const score = d?.sentimentScore ?? 0;
    const mKey = monthKey(d?.dateTime);

    sentimentScoreTotal += score;

    if (!monthSentiment[mKey]) monthSentiment[mKey] = { total: 0, count: 0 };
    monthSentiment[mKey].total += score;
    monthSentiment[mKey].count += 1;
    chatCount[mKey] = (chatCount[mKey] ?? 0) + 1;
  }

  const sentimentAverageTotal =
    chatCountTotal > 0 ? sentimentScoreTotal / chatCountTotal : null;

  const sentimentAverage: Record<string, number> = {};
  for (const [mk, { total, count }] of Object.entries(monthSentiment)) {
    sentimentAverage[mk] = total / count;
  }

  // Write aggregates back so future requests use the fast path.
  const chatsField: Record<string, number> = { total: chatCountTotal, ...chatCount };
  const sentimentField: Record<string, number> = {
    ...(sentimentAverageTotal !== null ? { average: sentimentAverageTotal } : {}),
    ...sentimentAverage,
  };

  await firestore
    .collection("orgs")
    .doc(orgId)
    .update({ chats: chatsField, sentiment: sentimentField });

  return { chatCountTotal, chatCount, sentimentAverageTotal, sentimentAverage };
}
