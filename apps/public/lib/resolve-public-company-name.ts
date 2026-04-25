import { cache } from "react";
import { headers } from "next/headers";
import { base64HeaderToUtf8String } from "./default-message-header";

export type PublicChatBranding = {
  companyName: string | null;
  website: string | null;
  supportLink: string | null;
  colorPalette: "light" | "dark" | null;
  accentColor: string | null;
  /** From Edge Config when present; avoids a client GET /org/defaultMessage. */
  defaultMessage: string | null;
};

/**
 * Resolves branding for the public chat from middleware-forwarded hostcheck data.
 * Deduplicated per request (metadata + page).
 */
export const getPublicChatBranding = cache(async (): Promise<PublicChatBranding> => {
  const headerList = await headers();
  const companyName = headerList.get("x-feedchat-org-name")?.trim() || null;
  const website = headerList.get("x-feedchat-org-website")?.trim() || null;
  const supportLink = headerList.get("x-feedchat-org-support-link")?.trim() || null;
  const colorPaletteRaw =
    headerList.get("x-feedchat-org-color-palette")?.trim().toLowerCase() || "";
  const colorPalette =
    colorPaletteRaw === "dark"
      ? "dark"
      : colorPaletteRaw === "light"
        ? "light"
        : null;
  const accentColor = headerList.get("x-feedchat-org-accent-color")?.trim() || null;

  const defaultMessageB64 =
    headerList.get("x-feedchat-org-default-message")?.trim() || null;
  let defaultMessage: string | null = null;
  if (defaultMessageB64) {
    const decoded = base64HeaderToUtf8String(defaultMessageB64);
    const t = decoded?.trim() ?? "";
    defaultMessage = t.length > 0 ? t : null;
  }

  return {
    companyName,
    website,
    supportLink,
    colorPalette,
    accentColor,
    defaultMessage,
  };
});
