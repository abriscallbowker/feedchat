import { firestore } from "./firebase.js";

const VERCEL_EDGE_CONFIG_ID = process.env.VERCEL_EDGE_CONFIG_ID;
const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;

const EDGE_CONFIG_API = "https://api.vercel.com/v1/edge-config";

function hostnameToKey(hostname: string): string {
  return hostname.replace(/\./g, "_");
}

interface EdgeConfigOrgEntry {
  orgId: string;
  name: string | null;
  website: string | null;
  supportLink: string | null;
  plan: string | null;
  colorPalette: string | null;
  accentColor: string | null;
  fallbackUrl: string | null;
  creditExhausted: boolean;
  defaultMessage: string;
}

type EdgeConfigItem =
  | { operation: "upsert"; key: string; value: EdgeConfigOrgEntry }
  | { operation: "delete"; key: string };

async function patchEdgeConfig(items: EdgeConfigItem[]): Promise<void> {
  if (!VERCEL_EDGE_CONFIG_ID || !VERCEL_API_TOKEN) {
    console.warn("[edgeConfig] VERCEL_EDGE_CONFIG_ID or VERCEL_API_TOKEN not set, skipping");
    return;
  }
  if (items.length === 0) return;

  const res = await fetch(`${EDGE_CONFIG_API}/${VERCEL_EDGE_CONFIG_ID}/items`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${VERCEL_API_TOKEN}`,
    },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[edgeConfig] PATCH failed ${res.status}: ${text}`);
  }
}

export async function syncOrgToEdgeConfig(orgId: string): Promise<void> {
  if (!VERCEL_EDGE_CONFIG_ID || !VERCEL_API_TOKEN) {
    console.warn("[edgeConfig] VERCEL_EDGE_CONFIG_ID or VERCEL_API_TOKEN not set, skipping");
    return;
  }

  const [orgDoc, hostnamesSnap, customDomainsSnap] = await Promise.all([
    firestore.collection("orgs").doc(orgId).get(),
    firestore.collection("hostnames").where("org", "==", orgId).get(),
    firestore.collection("customDomains").where("org", "==", orgId).get(),
  ]);

  if (!orgDoc.exists) {
    console.warn(`[edgeConfig] Org ${orgId} not found, skipping sync`);
    return;
  }

  const data = orgDoc.data() ?? {};
  const sub = (data.subscription as Record<string, unknown> | undefined) ?? {};
  const creditsUsed = (sub.creditsUsed as number | undefined) ?? 0;
  const creditLimit = (sub.creditLimit as number | undefined) ?? 0;
  const totalCreditLimit = (sub.totalCreditLimit as number | undefined) ?? creditLimit;
  const effectiveLimit = Math.max(creditLimit, totalCreditLimit);
  const creditExhausted = effectiveLimit > 0 && creditsUsed >= effectiveLimit;

  const entry: EdgeConfigOrgEntry = {
    orgId,
    name: ((data.companyName || data.name) as string | undefined) ?? null,
    website: (data.website as string | undefined) ?? null,
    supportLink: (data.supportLink as string | undefined) ?? null,
    plan: (data.plan as string | undefined) ?? null,
    colorPalette: (data.colorPalette as string | undefined) ?? null,
    accentColor: (data.accentColor as string | undefined) ?? null,
    fallbackUrl: (data.fallbackUrl as string | undefined) ?? null,
    creditExhausted,
    defaultMessage: (data.defaultMessage as string | undefined) ?? "Hey! Any feedback to share?",
  };

  const items: EdgeConfigItem[] = [];

  for (const doc of hostnamesSnap.docs) {
    const hostname = doc.data().hostname as string | undefined;
    if (hostname) {
      items.push({ operation: "upsert", key: hostnameToKey(hostname), value: entry });
    }
  }

  for (const doc of customDomainsSnap.docs) {
    const url = doc.data().url as string | undefined;
    if (url) {
      items.push({ operation: "upsert", key: hostnameToKey(url), value: entry });
    }
  }

  if (items.length === 0) return;

  await patchEdgeConfig(items);
}

export function syncOrgToEdgeConfigAsync(orgId: string): void {
  syncOrgToEdgeConfig(orgId).catch((err) =>
    console.error("[edgeConfig] syncOrgToEdgeConfig error:", err),
  );
}

export async function removeHostnamesFromEdgeConfig(hostnames: string[]): Promise<void> {
  if (hostnames.length === 0) return;
  const items: EdgeConfigItem[] = hostnames.map((h) => ({ operation: "delete", key: hostnameToKey(h) }));
  await patchEdgeConfig(items);
}

export function removeHostnamesFromEdgeConfigAsync(hostnames: string[]): void {
  removeHostnamesFromEdgeConfig(hostnames).catch((err) =>
    console.error("[edgeConfig] removeHostnamesFromEdgeConfig error:", err),
  );
}
