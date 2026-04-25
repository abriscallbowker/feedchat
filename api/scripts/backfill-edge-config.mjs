import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  VERCEL_EDGE_CONFIG_ID,
  VERCEL_API_TOKEN,
} = process.env;

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  console.error("Missing Firebase credentials in environment");
  process.exit(1);
}
if (!VERCEL_EDGE_CONFIG_ID || !VERCEL_API_TOKEN) {
  console.error("Missing VERCEL_EDGE_CONFIG_ID or VERCEL_API_TOKEN in environment");
  process.exit(1);
}

initializeApp({
  credential: cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
});

const firestore = getFirestore();

function hostnameToKey(hostname) {
  return hostname.replace(/\./g, "_");
}

async function patchEdgeConfig(items) {
  if (items.length === 0) return;
  const res = await fetch(
    `https://api.vercel.com/v1/edge-config/${VERCEL_EDGE_CONFIG_ID}/items`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VERCEL_API_TOKEN}`,
      },
      body: JSON.stringify({ items }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Edge Config PATCH failed ${res.status}: ${text}`);
  }
}

async function main() {
  console.log("Fetching all orgs...");
  const orgsSnap = await firestore.collection("orgs").get();
  console.log(`Found ${orgsSnap.size} orgs`);

  let totalKeys = 0;
  const BATCH_SIZE = 50;
  let batch = [];

  for (const orgDoc of orgsSnap.docs) {
    const orgId = orgDoc.id;
    const data = orgDoc.data();

    const entry = {
      orgId,
      name: (data.companyName || data.name) ?? null,
      website: data.website ?? null,
      supportLink: data.supportLink ?? null,
      plan: data.plan ?? null,
      colorPalette: data.colorPalette ?? null,
      accentColor: data.accentColor ?? null,
    };

    const [hostnamesSnap, customDomainsSnap] = await Promise.all([
      firestore.collection("hostnames").where("org", "==", orgId).get(),
      firestore.collection("customDomains").where("org", "==", orgId).get(),
    ]);

    for (const doc of hostnamesSnap.docs) {
      const hostname = doc.data().hostname;
      if (hostname) {
        batch.push({ operation: "upsert", key: hostnameToKey(hostname), value: entry });
        totalKeys++;
      }
    }

    for (const doc of customDomainsSnap.docs) {
      const url = doc.data().url;
      if (url) {
        batch.push({ operation: "upsert", key: hostnameToKey(url), value: entry });
        totalKeys++;
      }
    }

    if (batch.length >= BATCH_SIZE) {
      await patchEdgeConfig(batch);
      console.log(`  Synced batch of ${batch.length} keys...`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await patchEdgeConfig(batch);
    console.log(`  Synced final batch of ${batch.length} keys...`);
  }

  console.log(`Done. Synced ${totalKeys} total Edge Config keys across ${orgsSnap.size} orgs.`);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
