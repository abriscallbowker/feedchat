import { resolveFeedchatApiBase } from "@feedchat/api-base";

/** HTTP base for the `/api` Express stack (same origin on the public app by default). */
export function getFeedchatApiBase(): string {
  return resolveFeedchatApiBase("public");
}

const DEFAULT_LOCAL_DEV_ORG_ID = "f3c62f7c-0b63-4a95-87bb-255beac0054f";

export function isLocalDevHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

/** On localhost-style hosts, returns org id for API calls (override with NEXT_PUBLIC_LOCAL_DEV_ORG_ID). */
export function localDevOrgId(): string | null {
  if (typeof window === "undefined") return null;
  if (!isLocalDevHostname(window.location.hostname)) return null;
  return (
    process.env.NEXT_PUBLIC_LOCAL_DEV_ORG_ID?.trim() || DEFAULT_LOCAL_DEV_ORG_ID
  );
}

/** Merge `orgId` into request JSON when running on local dev (for /chat, /voice, etc.). */
export function withOptionalLocalDevOrgId<T extends Record<string, unknown>>(
  body: T,
): T & { orgId?: string } {
  const id = localDevOrgId();
  if (!id) return body;
  return { ...body, orgId: id };
}

type OrgWebsiteResponse = {
  website?: string | null;
};

type OrgSupportLinkResponse = {
  supportLink?: string | null;
};

type OrgColorPaletteResponse = {
  colorPalette?: string | null;
};

type OrgAccentColorResponse = {
  accentColor?: string | null;
};

type OrgDefaultMessageResponse = {
  defaultMessage?: string | null;
};

function orgQuery(hostname: string): URLSearchParams {
  const q = new URLSearchParams();
  q.set("hostname", hostname.trim());
  const maybeLocalOrgId = localDevOrgId();
  if (maybeLocalOrgId) q.set("orgId", maybeLocalOrgId);
  return q;
}

/**
 * GET /org/defaultMessage?hostname={hostname}[&orgId={orgId-on-local-dev}]
 * Returns custom default assistant greeting text, or null when not found (404) or invalid.
 */
export async function fetchOrgDefaultMessage(
  hostname: string,
): Promise<string | null> {
  const trimmedHost = hostname.trim();
  if (!trimmedHost) return null;

  const base = getFeedchatApiBase().replace(/\/$/, "");
  const url = `${base}/org/defaultMessage?${orgQuery(trimmedHost).toString()}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) return null;
    const parsed = (await response
      .json()
      .catch(() => ({}))) as OrgDefaultMessageResponse;
    const value =
      typeof parsed.defaultMessage === "string"
        ? parsed.defaultMessage.trim()
        : "";
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function normalizeOptionalUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * GET /org/website/?hostname={hostname}[&orgId={orgId-on-local-dev}]
 */
export async function fetchOrgWebsite(
  hostname: string,
): Promise<string | null> {
  const base = getFeedchatApiBase().replace(/\/$/, "");
  const url = `${base}/org/website/?${orgQuery(hostname).toString()}`;

  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return null;
    const parsed = (await response
      .json()
      .catch(() => ({}))) as OrgWebsiteResponse;
    return normalizeOptionalUrl(parsed.website);
  } catch {
    return null;
  }
}

/**
 * GET /org/supportLink/?hostname={hostname}[&orgId={orgId-on-local-dev}]
 */
export async function fetchOrgSupportLink(
  hostname: string,
): Promise<string | null> {
  const base = getFeedchatApiBase().replace(/\/$/, "");
  const url = `${base}/org/supportLink/?${orgQuery(hostname).toString()}`;

  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return null;
    const parsed = (await response
      .json()
      .catch(() => ({}))) as OrgSupportLinkResponse;
    return normalizeOptionalUrl(parsed.supportLink);
  } catch {
    return null;
  }
}

/**
 * GET /org/colorPalette?hostname={hostname}[&orgId={orgId-on-local-dev}]
 */
export async function fetchOrgColorPalette(
  hostname: string,
): Promise<"light" | "dark" | null> {
  const base = getFeedchatApiBase().replace(/\/$/, "");
  const url = `${base}/org/colorPalette?${orgQuery(hostname).toString()}`;

  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return null;
    const parsed = (await response
      .json()
      .catch(() => ({}))) as OrgColorPaletteResponse;
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

/**
 * GET /org/accentColor?hostname={hostname}[&orgId={orgId-on-local-dev}]
 */
export async function fetchOrgAccentColor(
  hostname: string,
): Promise<string | null> {
  const base = getFeedchatApiBase().replace(/\/$/, "");
  const url = `${base}/org/accentColor?${orgQuery(hostname).toString()}`;

  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) return null;
    const parsed = (await response
      .json()
      .catch(() => ({}))) as OrgAccentColorResponse;
    const value =
      typeof parsed.accentColor === "string" ? parsed.accentColor.trim() : "";
    return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * GET /org/profilepic?hostname={hostname}[&orgId={orgId-on-local-dev}]
 * Returns the endpoint URL when an image exists, otherwise null.
 */
export async function fetchOrgProfilePicUrl(
  hostname: string,
): Promise<string | null> {
  const base = getFeedchatApiBase().replace(/\/$/, "");
  const url = `${base}/org/profilepic?${orgQuery(hostname).toString()}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const contentType =
      response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("image/webp")) return null;
    return url;
  } catch {
    return null;
  }
}
