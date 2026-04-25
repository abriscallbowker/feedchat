import { firestore } from "./firebase";
import type { DocumentData } from "firebase-admin/firestore";

interface OrgCacheEntry {
  data: DocumentData;
  expiresAt: number;
}

const SAFETY_TTL_MS = 2 * 60 * 60 * 1000;

const orgCache = new Map<string, OrgCacheEntry>();

export async function getOrgDoc(orgId: string): Promise<DocumentData | null> {
  const now = Date.now();
  const cached = orgCache.get(orgId);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const orgDoc = await firestore.collection("orgs").doc(orgId).get();
  if (!orgDoc.exists) return null;

  const data = orgDoc.data()!;
  orgCache.set(orgId, { data, expiresAt: now + SAFETY_TTL_MS });
  return data;
}

export function invalidateOrg(orgId: string): void {
  orgCache.delete(orgId);
}
