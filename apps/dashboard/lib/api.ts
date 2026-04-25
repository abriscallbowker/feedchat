import { resolveFeedchatApiBase } from "@feedchat/api-base";

/** Base URL for the HTTP API (`/api` on the public app in this monorepo by default). */
export function getFeedchatApiBase(): string {
  return resolveFeedchatApiBase("dashboard");
}

export function authJsonHeaders(token: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`
  } as const;
}

export function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`
  } as const;
}

export function pickOrgId(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const id = o.id ?? o.orgId ?? o.organizationId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** GET /org — subscription plan (e.g. `free`, `cancelled`, paid tier). */
export function pickOrgPlan(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const p = (data as Record<string, unknown>).plan;
  return typeof p === "string" && p.length > 0 ? p : null;
}

/** GET /user — logged in user's email address. */
export function pickUserEmail(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const email = o.email ?? o.userEmail;
  return typeof email === "string" && email.length > 0 ? email : null;
}

/** GET /user — signup date as ISO string (or null). */
export function pickUserSignUpDate(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const raw = (data as Record<string, unknown>).signUpDate;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** GET /user — role (e.g. `owner`, `viewer`), normalized to lowercase. */
export function pickUserRole(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const role = (data as Record<string, unknown>).role;
  if (typeof role !== "string" || !role.trim()) return null;
  return role.trim().toLowerCase();
}

/**
 * Parse GET /hostname body: plain string, JSON string, or `{ hostname: string }`.
 */
export async function parseHostnameFromGetResponse(response: Response): Promise<string | null> {
  const text = (await response.text()).trim();
  if (!text) return null;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const data = JSON.parse(text) as unknown;
      if (typeof data === "string") return data;
      if (data && typeof data === "object" && "hostname" in data) {
        const h = (data as { hostname: unknown }).hostname;
        return typeof h === "string" && h.length > 0 ? h : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  return text;
}

const RESERVED_SUBDOMAINS = new Set([
  "www",
  "app",
  "admin",
  "portal",
  "billing",
  "checkout",
  "dash",
  "dashboard"
]);

export function validateTenantSubdomain(slug: string): { ok: true } | { ok: false; message: string } {
  const normalized = slug.trim().toLowerCase();
  if (normalized.length < 2) {
    return { ok: false, message: "Use at least 2 letters." };
  }
  if (normalized.length > 63) {
    return { ok: false, message: "Subdomain is too long." };
  }
  if (!/^[a-z]+$/.test(normalized)) {
    return { ok: false, message: "Use only letters (a–z)." };
  }
  if (RESERVED_SUBDOMAINS.has(normalized)) {
    return { ok: false, message: "This name is reserved. Choose another." };
  }
  return { ok: true };
}

/** Ensures `href` is an absolute https URL for opening in a new tab. */
export function ensureHttpsAppUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice("http://".length)}`;
  return `https://${trimmed}`;
}

/** UI-only: same URL without `https://` (or `http://`) for display. */
export function displayAppUrlWithoutScheme(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (/^https:\/\//i.test(trimmed)) return trimmed.slice("https://".length);
  if (/^http:\/\//i.test(trimmed)) return trimmed.slice("http://".length);
  return trimmed;
}

/** GET /analysis — `tags` maps arbitrary keys (e.g. index strings) to tag labels. */
export type AnalysisChatSummary = {
  chatId: string;
  dateTime: string;
  sentimentScore: number;
  summary: string;
  tags?: Record<string, unknown>;
};

function coerceTagLabel(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.value === "string") return v.value;
    if (typeof v.tag === "string") return v.tag;
    if (typeof v.label === "string") return v.label;
  }
  return "";
}

export function chatTagValues(tags: Record<string, unknown> | undefined): string[] {
  if (!tags) return [];
  return Object.values(tags).map(coerceTagLabel).filter(Boolean);
}

export function chatHasTag(
  tags: Record<string, unknown> | undefined,
  tag: string,
): boolean {
  if (!tags) return false;
  const normalized = tag.trim();
  if (!normalized) return false;
  return Object.values(tags).some((v) => coerceTagLabel(v).trim() === normalized);
}

export function mergeChatTag(
  tags: Record<string, unknown> | undefined,
  tag: string,
): Record<string, unknown> {
  const trimmed = tag.trim();
  const next = { ...(tags ?? {}) };
  let max = -1;
  for (const k of Object.keys(next)) {
    const n = Number(k);
    if (Number.isFinite(n) && n > max) max = n;
  }
  next[String(max + 1)] = trimmed;
  return next;
}

export function removeChatTagByValue(
  tags: Record<string, unknown> | undefined,
  tag: string,
): Record<string, unknown> | undefined {
  if (!tags) return undefined;
  const next = { ...tags };
  const normalized = tag.trim();
  const key = Object.keys(next).find((k) => coerceTagLabel(next[k]).trim() === normalized);
  if (key) delete next[key];
  return Object.keys(next).length ? next : undefined;
}

export type AnalysisResponse = {
  orgId?: string;
  chats: AnalysisChatSummary[];
  /** Pass as `cursor` for the next page; `null` means no more pages. */
  nextCursor: string | null;
};

/** GET /usage */
export type UsageResponse = {
  creditsUsed: number;
  creditLimit: number;
  renewalDate: string;
  budgetCap: number | null;
  additionalCreditLimit: number | null;
  additionalCreditRate: number | null;
  totalCreditLimit: number | null;
};

/** Latest doc from the summary subcollection, embedded in GET /overview. */
export type OverviewLatestSummary = {
  body: string;
  dateSubmitted: string;
};

/** GET /overview */
export type InsightsResponse = {
  orgId?: string;
  sentimentAverageTotal: number;
  sentimentAverage: Record<string, number>;
  chatCountTotal: number;
  chatCount: Record<string, number>;
  latestSummary: OverviewLatestSummary | null;
};

const EMPTY_INSIGHTS: InsightsResponse = {
  sentimentAverageTotal: 0,
  sentimentAverage: {},
  chatCountTotal: 0,
  chatCount: {},
  latestSummary: null,
};

function coalesceFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function coalesceNumberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = coalesceFiniteNumber(v);
    if (n !== null) out[k] = n;
  }
  return out;
}

function normalizeLatestSummary(value: unknown): OverviewLatestSummary | null {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const body = o.body;
  if (typeof body !== "string" || !body.trim()) return null;
  const dateSubmitted = o.dateSubmitted;
  const dateStr =
    typeof dateSubmitted === "string" ? dateSubmitted.trim() : "";
  return { body: body.trim(), dateSubmitted: dateStr };
}

/** Safe shape for dashboard charts when GET /overview is 404 or returns sparse/null fields. */
export function normalizeInsightsResponse(raw: unknown): InsightsResponse {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_INSIGHTS };
  }
  const o = raw as Record<string, unknown>;
  const latestSummary = normalizeLatestSummary(o.latestSummary);
  return {
    ...EMPTY_INSIGHTS,
    ...(typeof o.orgId === "string" && o.orgId ? { orgId: o.orgId } : {}),
    sentimentAverageTotal:
      coalesceFiniteNumber(o.sentimentAverageTotal) ??
      EMPTY_INSIGHTS.sentimentAverageTotal,
    sentimentAverage: coalesceNumberRecord(o.sentimentAverage),
    chatCountTotal:
      coalesceFiniteNumber(o.chatCountTotal) ?? EMPTY_INSIGHTS.chatCountTotal,
    chatCount: coalesceNumberRecord(o.chatCount),
    latestSummary,
  };
}

/** GET /conversations */
export type ConversationTurn = {
  user: string;
  assistant: string;
};

export type ConversationItem = {
  chatId: string;
  userId: string | null;
  createdAt: string | null;
  lastMessageAt: string | null;
  index: ConversationTurn[];
};

/** GET /conversations?chatId=… */
export type ConversationByChatIdResponse = {
  orgId?: string;
  conversation: ConversationItem | null;
};

/** GET /conversations (paginated list) */
export type ConversationsResponse = {
  orgId?: string;
  conversations: ConversationItem[];
  page: number;
  pageSize: number;
  total: number;
};

