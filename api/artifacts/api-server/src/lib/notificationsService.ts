import { firestore } from "./firebase.js";
import { sendTelegramMessage } from "./telegram.js";
import { stripe } from "./stripe.js";
import { syncOrgToEdgeConfigAsync } from "./edgeConfig.js";

const PLAN_LIMITS: Record<string, { chats: number }> = {
  start: { chats: 100 },
  scale: { chats: 1000 },
  pro:   { chats: 3_000 },
};

const CREDIT_THRESHOLDS = [50, 75, 100];
const TRIAL_END_CREDIT_THRESHOLD = 100;

type OrgUser = {
  uid: string;
  email: string;
  notifications?: Record<string, boolean>;
};

async function getOrgUsers(orgId: string): Promise<OrgUser[]> {
  const snapshot = await firestore.collection("users").where("org", "==", orgId).get();
  return snapshot.docs.map((doc) => ({
    uid: doc.id,
    email: doc.data().email as string,
    notifications: doc.data().notifications as Record<string, boolean> | undefined,
  }));
}

async function sendLoopsEvent(
  email: string,
  eventName: string,
  eventProperties: Record<string, string>,
): Promise<void> {
  const LOOPS_API_KEY = process.env.LOOPS_API_KEY;
  if (!LOOPS_API_KEY) {
    console.warn("[loops] LOOPS_API_KEY not set, skipping");
    return;
  }
  const res = await fetch("https://app.loops.so/api/v1/events/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LOOPS_API_KEY}`,
    },
    body: JSON.stringify({ email, eventName, eventProperties }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`[loops] events/send failed ${res.status}: ${text}`);
  }
}

/**
 * Checks whether any credit alert thresholds (50/75/100%) have been newly
 * crossed and notifies eligible org users via Loops + Telegram.
 * Expects subscription.creditsUsed to already be up-to-date on the org doc.
 */
export async function notifyCreditsUsage(orgId: string): Promise<void> {
  try {
    const orgRef = firestore.collection("orgs").doc(orgId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) return;

    const orgData = orgDoc.data()!;
    const plan = (orgData.plan as string | undefined) ?? "free";
    const limits = PLAN_LIMITS[plan];
    if (!limits) return;

    const sub = (orgData.subscription as Record<string, unknown> | undefined) ?? {};
    const creditsUsed = (sub.creditsUsed as number | undefined) ?? 0;
    const creditLimit = (sub.creditLimit as number | undefined) ?? limits.chats;
    const totalCreditLimit = (sub.totalCreditLimit as number | undefined) ?? creditLimit;

    const usagePct = totalCreditLimit > 0 ? (creditsUsed / totalCreditLimit) * 100 : 0;
    const alreadySent = (orgData.creditAlertsSent as number[] | undefined) ?? [];
    const newlySent: number[] = [];

    for (const threshold of CREDIT_THRESHOLDS) {
      if (usagePct >= threshold && !alreadySent.includes(threshold)) {
        const users = await getOrgUsers(orgId);
        const eligible = users.filter((u) => u.notifications?.billing !== false);

        await Promise.all(
          eligible.map((u) =>
            sendLoopsEvent(u.email, "creditsAlert", {
              creditsUsage: `${threshold}%`,
            }).catch((err) =>
              console.error("[notifications] sendLoopsEvent error:", err),
            ),
          ),
        );

        sendTelegramMessage(`Org ${orgId} hit ${threshold}% credits.`);
        newlySent.push(threshold);
      }
    }

    if (newlySent.length > 0) {
      await orgRef.update({
        creditAlertsSent: [...alreadySent, ...newlySent],
      });

      if (newlySent.includes(100)) {
        syncOrgToEdgeConfigAsync(orgId);
      }
    }

    if (
      orgData.isTrial === true &&
      creditsUsed >= TRIAL_END_CREDIT_THRESHOLD &&
      orgData.stripeSubscriptionId &&
      !orgData.trialEndedByCredits
    ) {
      await orgRef.update({ trialEndedByCredits: true });

      const users = await getOrgUsers(orgId);
      await Promise.all(
        users.map((u) =>
          sendLoopsEvent(u.email, "trialCompleted", {
            reason: "your 100 free credits (equal to 100 feedback sessions) were used",
          }).catch((err) =>
            console.error("[notifications] trialCompleted sendLoopsEvent error:", err),
          ),
        ),
      );

      await stripe.subscriptions.update(orgData.stripeSubscriptionId as string, {
        trial_end: "now",
      });
    }
  } catch (err) {
    console.error("[notifications] notifyCreditsUsage error:", err);
  }
}

export async function notifyDataExport(orgId: string, exporterEmail: string): Promise<void> {
  try {
    const users = await getOrgUsers(orgId);
    const eligible = users.filter((u) => u.notifications?.dataExports !== false);

    await Promise.all(
      eligible.map((u) =>
        sendLoopsEvent(u.email, "dataExportsAlert", { exporterEmail }).catch((err) =>
          console.error("[notifications] sendLoopsEvent error:", err),
        ),
      ),
    );
  } catch (err) {
    console.error("[notifications] notifyDataExport error:", err);
  }
}

export async function notifyNewFeedback(orgId: string): Promise<void> {
  try {
    const orgRef = firestore.collection("orgs").doc(orgId);
    const orgDoc = await orgRef.get();
    if (!orgDoc.exists) return;

    const orgData = orgDoc.data()!;
    const today = new Date().toISOString().slice(0, 10);
    const lastSent = (orgData.lastNewFeedbackNotificationDate as string | undefined) ?? "";

    if (lastSent === today) return;

    const companyName =
      ((orgData.companyName || orgData.name) as string | undefined) ?? "";

    const users = await getOrgUsers(orgId);
    const eligible = users.filter((u) => u.notifications?.newFeedback !== false);

    if (eligible.length === 0) return;

    await Promise.all(
      eligible.map((u) =>
        sendLoopsEvent(u.email, "newFeedbackAlert", { companyName }).catch((err) =>
          console.error("[notifications] sendLoopsEvent error:", err),
        ),
      ),
    );

    await orgRef.update({ lastNewFeedbackNotificationDate: today });
  } catch (err) {
    console.error("[notifications] notifyNewFeedback error:", err);
  }
}
