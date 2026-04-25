import { firestore } from "./firebase.js";

interface SummaryCacheEntry {
  body: string;
  dateSubmitted: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, SummaryCacheEntry | null>();

export async function getLatestSummary(
  orgId: string,
): Promise<{ body: string; dateSubmitted: string } | null> {
  const now = Date.now();
  if (cache.has(orgId)) {
    const entry = cache.get(orgId)!;
    if (entry === null || entry.expiresAt > now) {
      return entry;
    }
  }

  const snapshot = await firestore
    .collection("orgs")
    .doc(orgId)
    .collection("summary")
    .orderBy("dateSubmitted", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) {
    cache.set(orgId, null);
    return null;
  }

  const d = snapshot.docs[0].data();
  const entry: SummaryCacheEntry = {
    body: d.body as string,
    dateSubmitted: d.dateSubmitted as string,
    expiresAt: now + TTL_MS,
  };
  cache.set(orgId, entry);
  return { body: entry.body, dateSubmitted: entry.dateSubmitted };
}

export function invalidateSummary(orgId: string): void {
  cache.delete(orgId);
}
