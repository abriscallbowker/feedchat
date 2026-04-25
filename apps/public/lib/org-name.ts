import { getFeedchatApiBase } from "./feedchat-api";

/**
 * GET /org/name/?hostname=… — unauthenticated. Returns trimmed `companyName` or null.
 */
export async function fetchOrgCompanyName(hostname: string): Promise<string | null> {
  const h = hostname.trim().toLowerCase();
  if (!h) return null;
  const base = getFeedchatApiBase().replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/org/name/?hostname=${encodeURIComponent(h)}`, {
      method: "GET",
      next: { revalidate: 300 }
    });
    if (!response.ok) return null;

    const text = (await response.text()).trim();
    if (!text) return null;

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return null;
    }

    if (!data || typeof data !== "object") return null;
    const name = (data as Record<string, unknown>).companyName;
    if (typeof name !== "string") return null;
    const trimmed = name.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
