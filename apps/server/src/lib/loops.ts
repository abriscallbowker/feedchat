/**
 * OSS / self-contained monorepo: Loops integration removed.
 *
 * Keep these exports as no-ops so existing route logic can be simplified
 * without requiring conditional imports or env configuration.
 */
export function createContact(_email: string, _companyName?: string): void {
  return;
}

export function sendEvent(
  _email: string,
  _eventName: string,
  _eventProperties?: Record<string, unknown>,
): void {
  return;
}

export function deleteContact(_email: string): void {
  return;
}
