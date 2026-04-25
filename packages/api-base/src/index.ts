/**
 * Resolves the HTTP base URL for the Feedchat API (Express stack mounted at `/api`).
 *
 * - Set `NEXT_PUBLIC_FEEDCHAT_API_URL` to override (e.g. split deployments or hosted API).
 * - **Public app:** defaults to same origin + `/api` in the browser.
 * - **Dashboard:** defaults to `NEXT_PUBLIC_PUBLIC_APP_ORIGIN` + `/api` (see `.env.example`);
 *   in this monorepo that is usually the public app dev server (`http://localhost:3002`).
 */
export type FeedchatApiBaseScope = "public" | "dashboard";

export function resolveFeedchatApiBase(scope: FeedchatApiBaseScope): string {
  const fromEnv =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_FEEDCHAT_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  const publicOrigin =
    (typeof process !== "undefined" &&
      process.env.NEXT_PUBLIC_PUBLIC_APP_ORIGIN?.trim()) ||
    "http://localhost:3002";

  const normalizedPublic = publicOrigin.replace(/\/$/, "");

  if (scope === "public") {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/api`.replace(/\/$/, "");
    }
    return `${normalizedPublic}/api`;
  }

  return `${normalizedPublic}/api`;
}
