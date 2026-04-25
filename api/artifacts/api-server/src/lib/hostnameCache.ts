import { firestore } from "./firebase.js";

interface CacheEntry {
  orgId: string | null;
  expiresAt: number;
}

const TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

export async function resolveOrgIdFromHostname(
  hostname: string,
): Promise<string | null> {
  const now = Date.now();

  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > now) {
    return cached.orgId;
  }

  const docId = hostname.replace(/\./g, "_");
  const [hostnameDoc, customDomainDoc] = await Promise.all([
    firestore.collection("hostnames").doc(docId).get(),
    firestore.collection("customDomains").doc(docId).get(),
  ]);

  const record = hostnameDoc.exists
    ? hostnameDoc
    : customDomainDoc.exists
      ? customDomainDoc
      : null;

  const orgId = (record?.data()?.org as string | undefined) ?? null;

  cache.set(hostname, { orgId, expiresAt: now + TTL_MS });

  return orgId;
}

export function invalidateHostname(hostname: string): void {
  cache.delete(hostname);
}
