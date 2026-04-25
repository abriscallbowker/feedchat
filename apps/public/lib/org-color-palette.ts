import { getFeedchatApiBase } from "./feedchat-api";

type OrgColorPaletteResponse = {
  colorPalette?: string | null;
};

/**
 * GET /org/colorPalette/?hostname=... — returns "light" | "dark" | null.
 */
export async function fetchOrgColorPaletteByHostname(
  hostname: string,
): Promise<"light" | "dark" | null> {
  const h = hostname.trim().toLowerCase();
  if (!h) return null;
  const base = getFeedchatApiBase().replace(/\/$/, "");

  try {
    const response = await fetch(
      `${base}/org/colorPalette/?hostname=${encodeURIComponent(h)}`,
      {
        method: "GET",
        next: { revalidate: 300 },
      },
    );
    if (!response.ok) return null;
    const parsed = (await response.json().catch(() => ({}))) as OrgColorPaletteResponse;
    const raw =
      typeof parsed.colorPalette === "string"
        ? parsed.colorPalette.trim().toLowerCase()
        : "";
    if (raw === "dark") return "dark";
    if (raw === "light") return "light";
    return null;
  } catch {
    return null;
  }
}
