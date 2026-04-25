/**
 * OSS / self-contained monorepo: external notification providers removed.
 *
 * These functions remain as safe no-ops to keep internal call sites simple
 * (summary generation, exports, etc.) without requiring Loops/Telegram/Stripe.
 */
export async function notifyCreditsUsage(_orgId: string): Promise<void> {
  return;
}

export async function notifyDataExport(
  _orgId: string,
  _exporterEmail: string,
): Promise<void> {
  return;
}

export async function notifyNewFeedback(_orgId: string): Promise<void> {
  return;
}
