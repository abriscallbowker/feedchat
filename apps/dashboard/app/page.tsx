"use client";

import {
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowRightEndOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  ArchiveBoxXMarkIcon,
  Bars3Icon,
  PaperAirplaneIcon,
  CalendarDaysIcon,
  CalculatorIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon,
  CloudIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  CubeTransparentIcon,
  DocumentMagnifyingGlassIcon,
  EnvelopeIcon,
  GiftIcon,
  InformationCircleIcon,
  LinkIcon,
  LockClosedIcon,
  MinusIcon,
  SparklesIcon,
  SwatchIcon,
  UserGroupIcon,
  SunIcon,
  MoonIcon,
  TableCellsIcon,
  EllipsisVerticalIcon,
  EnvelopeOpenIcon,
  BarsArrowDownIcon,
  BellIcon,
  TrashIcon,
  UserCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  ArrowPathIcon as ArrowPathIconSolid,
  CheckIcon as CheckIconSolid,
  ClipboardDocumentIcon as ClipboardDocumentIconSolid,
  DocumentCheckIcon as DocumentCheckIconSolid,
  TagIcon as TagIconSolid,
  UserIcon,
} from "@heroicons/react/24/solid";
import { toBlob } from "html-to-image";
import {
  Auth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { Button, Input } from "@feedchat/ui";
import Lottie from "lottie-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import liveAnimation from "../public/assets/live.json";
import {
  type AnalysisResponse,
  type ConversationByChatIdResponse,
  type ConversationItem,
  getFeedchatApiBase,
  type InsightsResponse,
  type UsageResponse,
  authHeaders,
  authJsonHeaders,
  chatHasTag,
  chatTagValues,
  mergeChatTag,
  normalizeInsightsResponse,
  pickOrgId,
  pickOrgPlan,
  pickUserEmail,
  pickUserRole,
  pickUserSignUpDate,
  removeChatTagByValue,
} from "../lib/api";
import { getFirebaseAuth } from "../lib/firebase";
import {
  stripBoldFromMarkdown,
  stripMarkdownPreservingLineBreaks,
} from "../lib/strip-markdown-plain";

type AuthMode = "onboarding" | "signin" | "resetPassword";
type OnboardingStep = 1 | 2 | 3 | 4;
type DashboardTabId =
  | "insights"
  | "conversations"
  | "team"
  | "appearance"
  | "domains"
  | "usage"
  | "notifications"
  | "account";
type TeamMember = {
  email: string;
  role: string;
};
type ColorPaletteOption = "light" | "dark";
type CustomDomainDnsInstruction = {
  type: string;
  name: string;
  value: string;
  reason?: string;
};

// OSS single-tenant note:
// Domains/hostnames are removed from the OSS backend, but we keep the dashboard’s
// original UI structure intact. These helpers are only used inside the Domains UI.
const TENANT_APP_HOST = "localhost";
function validateTenantSubdomain(slug: string): { ok: boolean; message: string } {
  if (!slug) return { ok: false, message: "Enter a subdomain." };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return { ok: false, message: "Use only a-z, 0-9 and hyphens." };
  }
  if (slug.length < 2) return { ok: false, message: "Subdomain is too short." };
  return { ok: true, message: "" };
}
async function parseHostnameFromGetResponse(
  response: Response,
): Promise<string | null> {
  const json = (await response.json().catch(() => null)) as unknown;
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const hostname = typeof o.hostname === "string" ? o.hostname : "";
  return hostname || null;
}

type UserNotifications = {
  billing: boolean;
  newFeedback: boolean;
  dataExports: boolean;
};

function normalizeUserNotifications(value: unknown): UserNotifications {
  const base: UserNotifications = {
    billing: false,
    newFeedback: false,
    dataExports: false,
  };
  if (!value || typeof value !== "object") return base;
  const o = value as Record<string, unknown>;
  const notifications =
    o.notifications && typeof o.notifications === "object"
      ? (o.notifications as Record<string, unknown>)
      : null;
  if (!notifications) return base;
  return {
    billing: notifications.billing === true,
    newFeedback: notifications.newFeedback === true,
    dataExports: notifications.dataExports === true,
  };
}

function formatOrdinalDay(day: number) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatLongDateWithOrdinal(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${formatOrdinalDay(d.getDate())} ${months[d.getMonth()]}, ${d.getFullYear()}`;
}

const CUSTOM_DOMAIN_VERIFIED_SUCCESS_MESSAGE =
  "Domain added. May take 5mins to display.";
const CUSTOM_DOMAIN_VERIFIED_SUCCESS_DISPLAY_MS = 5 * 60 * 1000;

const ORG_CATEGORIES = [
  "Mobile App",
  "SaaS Tool",
  "AI Tool",
  "Ecommerce Brand",
  "Physical Shop",
  "Service Business",
  "FinTech",
  "Other",
] as const;

const ORG_SIZES = ["0-10K", "10K-100K", "100K-500K", "500K-1M", "1M+"] as const;
const DEFAULT_COLOR_PALETTE: ColorPaletteOption = "light";
const DEFAULT_ACCENT_COLOR = "#0A80FE";
const DEFAULT_INITIAL_MESSAGE_PLACEHOLDER = "Welcome! Any feedback to share?";
const MAX_PROFILE_PIC_FILE_SIZE_BYTES = 1024 * 1024;
const PROFILE_PIC_ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const ANALYSIS_PAGE_LIMIT = 25;

function formatDashboardDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12)
    return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });
}

/** Compact label for chart x-axis (e.g. Jan 25). */
function formatMonthKeyAxis(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12)
    return monthKey;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "short",
    year: "2-digit",
  });
}

function getYAxisTicks(
  min: number,
  max: number,
  yDomain: { min: number; max: number } | undefined,
  valueFormatter: (value: number) => string,
): number[] {
  if (yDomain?.min === -1 && yDomain?.max === 1) {
    return [-1, 0, 1];
  }
  if (min === max) return [min];
  const mid = (min + max) / 2;
  const candidates = [min, mid, max];
  const seen = new Set<string>();
  const out: number[] = [];
  for (const t of candidates) {
    const label = valueFormatter(t);
    if (!seen.has(label)) {
      seen.add(label);
      out.push(t);
    }
  }
  return out.sort((a, b) => a - b);
}

function formatMonthKeyFromDate(date: Date) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function parseAttachmentFilename(contentDisposition: string | null): string {
  if (!contentDisposition) return "insights-export.csv";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(contentDisposition);
  if (encoded?.[1]) {
    try {
      return decodeURIComponent(encoded[1]);
    } catch {
      return "insights-export.csv";
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(contentDisposition);
  return plain?.[1] || "insights-export.csv";
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeColorPalette(value: unknown): ColorPaletteOption | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "light" || normalized === "dark") return normalized;
  return null;
}

function normalizeAccentColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return normalized.toUpperCase();
}

function relativeLuminanceFromHex(hex: string): number {
  const h = hex.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(h)) return 0.5;
  const r = parseInt(h.slice(1, 3), 16) / 255;
  const g = parseInt(h.slice(3, 5), 16) / 255;
  const b = parseInt(h.slice(5, 7), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatioPair(L1: number, L2: number): number {
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pick black or white foreground for maximum WCAG-style contrast on `bgHex`. */
function pickAccessibleTextOnBackground(bgHex: string): "#000000" | "#ffffff" {
  const Lbg = relativeLuminanceFromHex(bgHex);
  const Lblack = relativeLuminanceFromHex("#000000");
  const Lwhite = relativeLuminanceFromHex("#ffffff");
  const cBlack = contrastRatioPair(Lbg, Lblack);
  const cWhite = contrastRatioPair(Lbg, Lwhite);
  return cBlack >= cWhite ? "#000000" : "#ffffff";
}

function orgFieldMeaningfullyPresent(
  orgData: Record<string, unknown>,
  key: string,
): boolean {
  if (!(key in orgData)) return false;
  const v = orgData[key];
  if (v === null || v === undefined) return false;
  if (typeof v === "string" && v.trim() === "") return false;
  return true;
}

/** GET /org snapshot: appearance fields (excludes brand name — not part of this checklist). */
function orgSetupAppearanceDone(
  orgData: Record<string, unknown> | null,
): boolean {
  if (!orgData) return false;
  return (
    orgData.hasProfilePic === true ||
    orgFieldMeaningfullyPresent(orgData, "website") ||
    orgFieldMeaningfullyPresent(orgData, "supportLink") ||
    orgFieldMeaningfullyPresent(orgData, "defaultMessage") ||
    orgFieldMeaningfullyPresent(orgData, "colorPalette") ||
    orgFieldMeaningfullyPresent(orgData, "accentColor")
  );
}

function orgSetupTeamDone(orgData: Record<string, unknown> | null): boolean {
  if (!orgData) return false;
  const n = orgData.membersCount;
  if (typeof n === "number" && Number.isFinite(n)) return n > 1;
  if (typeof n === "string" && n.trim() !== "") {
    const parsed = Number(n);
    return Number.isFinite(parsed) && parsed > 1;
  }
  return false;
}

function formatSentimentScore(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function SelectedInsightMetaRow({
  dateTime,
  sentimentScore,
}: {
  dateTime: string;
  sentimentScore: number | string;
}) {
  const sentimentLabel =
    typeof sentimentScore === "number"
      ? formatSentimentScore(sentimentScore)
      : String(sentimentScore);
  return (
    <div className="dashboard-feedback-selected-insight-meta">
      <time className="dashboard-insight-date" dateTime={dateTime}>
        {formatDashboardDate(dateTime)}
      </time>
      <span className="dashboard-insight-score">
        <SparklesIcon
          aria-hidden="true"
          className="dashboard-insight-score-icon"
        />
        Sentiment {sentimentLabel}
      </span>
    </div>
  );
}

function isValidEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

/**
 * Trim, add https when no scheme, and return a canonical href for POST /org/fallbackUrl.
 */
function normalizeOrgFallbackUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  let toParse = trimmed;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    toParse = `https://${trimmed}`;
  }

  try {
    return new URL(toParse).href;
  } catch {
    return trimmed;
  }
}

function parseTeamMembers(data: unknown): TeamMember[] {
  const source = Array.isArray(data)
    ? data
    : data &&
        typeof data === "object" &&
        Array.isArray((data as { members?: unknown }).members)
      ? (data as { members: unknown[] }).members
      : [];
  return source
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const email = row.email;
      const role = row.role;
      if (typeof email !== "string" || typeof role !== "string") return null;
      const normalizedEmail = email.trim();
      const normalizedRole = role.trim().toLowerCase();
      if (!normalizedEmail || !normalizedRole) return null;
      return {
        email: normalizedEmail,
        role: normalizedRole === "owner" ? "owner" : "viewer",
      };
    })
    .filter((member): member is TeamMember => member !== null);
}

function formatRoleLabel(role: string) {
  if (!role) return role;
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function lastNMonthsKeys(n: number, endDate: Date) {
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    months.push(
      formatMonthKeyFromDate(
        new Date(endDate.getFullYear(), endDate.getMonth() - i, 1),
      ),
    );
  }
  return months;
}

type MonthlyChartRow = { month: string; value: number };

function MonthlyLineChart({
  series,
  colorClassName,
  valueFormatter,
  chartType = "line",
  yDomain,
}: {
  series: Record<string, number>;
  colorClassName?: string;
  valueFormatter: (value: number) => string;
  chartType?: "line" | "bar";
  /** When set, Y scale is fixed (e.g. sentiment −1…1); axis line stays at value 0. */
  yDomain?: { min: number; max: number };
}) {
  const data: MonthlyChartRow[] = useMemo(() => {
    const monthKeys = lastNMonthsKeys(6, new Date());
    return monthKeys.map((month) => ({
      month,
      value: series[month] ?? 0,
    }));
  }, [series]);

  const values = data.map((d) => d.value);
  const min = yDomain ? yDomain.min : Math.min(0, ...values);
  const max = yDomain ? yDomain.max : Math.max(0, ...values);
  const yDomainResolved: [number, number] = yDomain
    ? [yDomain.min, yDomain.max]
    : min === max
      ? [min, min + 1]
      : [min, max];

  const yTicks = getYAxisTicks(min, max, yDomain, valueFormatter);

  const isSecondary = Boolean(colorClassName?.includes("is-secondary"));
  const chartGradientDomId = useId().replace(/:/g, "");
  const gradientUrl = `url(#${chartGradientDomId})`;
  const lineStroke =
    chartType === "line" ? gradientUrl : isSecondary ? "#4a4a4a" : "#111111";
  const barFill = chartType === "bar" && isSecondary ? gradientUrl : "#111111";

  const chartMargin = { top: 8, right: 10, left: 4, bottom: 16 };

  const tooltipContent = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: ReadonlyArray<{ value?: number }>;
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const v = payload[0]?.value;
    if (v === undefined) return null;
    return (
      <div className="dashboard-recharts-tooltip">
        {formatMonthKey(String(label))}: {valueFormatter(v)}
      </div>
    );
  };

  return (
    <div className="dashboard-line-chart dashboard-recharts-wrap">
      <ResponsiveContainer width="100%" height={168}>
        {chartType === "line" ? (
          <LineChart
            aria-label="Monthly sentiment chart"
            data={data}
            margin={chartMargin}
          >
            <defs>
              <linearGradient
                id={chartGradientDomId}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#6d6d6d" />
                <stop offset="100%" stopColor="#000000" />
              </linearGradient>
            </defs>
            <XAxis
              axisLine={{ stroke: "#e0e0e0" }}
              dataKey="month"
              interval={0}
              tick={{ fill: "#666666", fontSize: 9, fontWeight: 500 }}
              tickFormatter={formatMonthKeyAxis}
              tickLine={false}
            />
            <YAxis
              domain={yDomainResolved}
              tick={{ fill: "#666666", fontSize: 9, fontWeight: 500 }}
              tickFormatter={valueFormatter}
              tickLine={false}
              ticks={yTicks}
              width={44}
              axisLine={false}
            />
            <ReferenceLine stroke="#d0d0d0" strokeWidth={1} y={0} />
            <Tooltip
              animationDuration={150}
              content={tooltipContent}
              cursor={{ stroke: "#d8d8d8", strokeWidth: 1 }}
            />
            <Line
              activeDot={{ fill: lineStroke, r: 4, strokeWidth: 0 }}
              animationDuration={280}
              animationEasing="ease-out"
              dataKey="value"
              dot={(dotProps) => {
                const { cx, cy, payload, index } = dotProps;
                const row = payload as MonthlyChartRow | undefined;
                const dotKey =
                  typeof row?.month === "string"
                    ? row.month
                    : typeof index === "number"
                      ? `i-${index}`
                      : "dot";
                if (
                  payload == null ||
                  typeof cx !== "number" ||
                  typeof cy !== "number"
                ) {
                  return <g key={dotKey} />;
                }
                if (row?.value === 0) {
                  return (
                    <circle key={dotKey} cx={cx} cy={cy} fill="none" r={0} />
                  );
                }
                return (
                  <circle
                    key={dotKey}
                    cx={cx}
                    cy={cy}
                    fill={lineStroke}
                    r={3}
                    stroke="none"
                  />
                );
              }}
              isAnimationActive
              stroke={lineStroke}
              strokeWidth={1.5}
              type="monotone"
            />
          </LineChart>
        ) : (
          <BarChart
            aria-label="Monthly conversations chart"
            data={data}
            margin={chartMargin}
          >
            {isSecondary ? (
              <defs>
                <linearGradient
                  id={chartGradientDomId}
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="100%"
                >
                  <stop offset="0%" stopColor="#6d6d6d" />
                  <stop offset="100%" stopColor="#000000" />
                </linearGradient>
              </defs>
            ) : null}
            <XAxis
              axisLine={{ stroke: "#e0e0e0" }}
              dataKey="month"
              interval={0}
              tick={{ fill: "#666666", fontSize: 9, fontWeight: 500 }}
              tickFormatter={formatMonthKeyAxis}
              tickLine={false}
            />
            <YAxis
              domain={yDomainResolved}
              tick={{ fill: "#666666", fontSize: 9, fontWeight: 500 }}
              tickFormatter={valueFormatter}
              tickLine={false}
              ticks={yTicks}
              width={44}
              axisLine={false}
            />
            <Tooltip
              animationDuration={150}
              content={tooltipContent}
              cursor={{ fill: "rgba(0,0,0,0.04)" }}
            />
            <Bar
              animationDuration={280}
              animationEasing="ease-out"
              dataKey="value"
              fill={barFill}
              isAnimationActive
              maxBarSize={48}
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function formatUsageCount(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return Math.round(value).toLocaleString();
}

function formatRenewalDateLabel(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";

  const day = d.getUTCDate();
  const lastTwo = day % 100;
  const suffix =
    lastTwo >= 11 && lastTwo <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  const month = d.toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return `${day}${suffix} ${month}`;
}

const USAGE_BAR_FILL_NORMAL = "#111111";
const USAGE_BAR_FILL_OVER_LIMIT = "#991b1b";

type UsageChartRow = {
  name: string;
  used: number;
  remainder: number;
  limit: number;
  rawUsed: number;
  usedOverLimit: boolean;
};

function resolveCreditsBarLimit(data: UsageResponse): number {
  const total = data.totalCreditLimit;
  if (typeof total === "number" && Number.isFinite(total) && total >= 0) {
    return total;
  }
  return data.creditLimit;
}

function buildUsageChartRows(data: UsageResponse): UsageChartRow[] {
  const specs: { name: string; used: number; limit: number }[] = [
    {
      name: "Credits",
      used: data.creditsUsed,
      limit: resolveCreditsBarLimit(data),
    },
  ];
  return specs.map(({ name, used, limit }) => {
    const limRaw =
      typeof limit === "number" && Number.isFinite(limit) && limit >= 0
        ? limit
        : 0;
    const u =
      typeof used === "number" && Number.isFinite(used) && used >= 0 ? used : 0;

    if (limRaw <= 0) {
      if (u <= 0) {
        return {
          name,
          used: 0,
          remainder: 1,
          limit: limRaw,
          rawUsed: u,
          usedOverLimit: false,
        };
      }
      return {
        name,
        used: u,
        remainder: 0,
        limit: limRaw,
        rawUsed: u,
        usedOverLimit: true,
      };
    }

    if (u > limRaw) {
      return {
        name,
        used: u,
        remainder: 0,
        limit: limRaw,
        rawUsed: u,
        usedOverLimit: true,
      };
    }

    return {
      name,
      used: u,
      remainder: limRaw - u,
      limit: limRaw,
      rawUsed: u,
      usedOverLimit: false,
    };
  });
}

function UsageLimitsBarChart({ data }: { data: UsageResponse }) {
  const chartRows = useMemo(() => buildUsageChartRows(data), [data]);

  const tooltipContent = ({
    active,
    label,
  }: {
    active?: boolean;
    label?: string;
  }) => {
    if (!active || !label) return null;
    const row = chartRows.find((r) => r.name === label);
    if (!row) return null;
    const limitLabel = formatUsageCount(row.limit);
    return (
      <div className="dashboard-recharts-tooltip">
        {row.name}: {formatUsageCount(row.rawUsed)} / {limitLabel}
      </div>
    );
  };

  const chartMargin = { top: 8, right: 16, left: 4, bottom: 8 };

  return (
    <div className="dashboard-line-chart dashboard-recharts-wrap">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart
          aria-label="Usage versus limits"
          data={chartRows}
          layout="vertical"
          margin={chartMargin}
        >
          <XAxis
            axisLine={{ stroke: "#e0e0e0" }}
            tick={{ fill: "#666666", fontSize: 9, fontWeight: 500 }}
            tickFormatter={(v: number) => formatUsageCount(v)}
            tickLine={false}
            type="number"
          />
          <YAxis
            axisLine={false}
            dataKey="name"
            tick={{ fill: "#666666", fontSize: 10, fontWeight: 500 }}
            tickLine={false}
            type="category"
            width={112}
          />
          <Tooltip
            animationDuration={150}
            content={tooltipContent}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar
            animationDuration={280}
            animationEasing="ease-out"
            dataKey="used"
            fill={USAGE_BAR_FILL_NORMAL}
            isAnimationActive
            maxBarSize={28}
            radius={[0, 3, 3, 0]}
            stackId="usage"
          >
            {chartRows.map((entry) => (
              <Cell
                key={entry.name}
                fill={
                  entry.usedOverLimit
                    ? USAGE_BAR_FILL_OVER_LIMIT
                    : USAGE_BAR_FILL_NORMAL
                }
              />
            ))}
          </Bar>
          <Bar
            animationDuration={280}
            animationEasing="ease-out"
            dataKey="remainder"
            fill="#e8e8e8"
            isAnimationActive
            maxBarSize={28}
            radius={[0, 3, 3, 0]}
            stackId="usage"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function InsightsListLoadingEllipsis() {
  const [dotCount, setDotCount] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setDotCount((n) => (n + 1) % 4);
    }, 400);
    return () => window.clearInterval(id);
  }, []);
  return (
    <p className="dashboard-insights-list-loading-more muted" role="status">
      Loading{".".repeat(dotCount)}
    </p>
  );
}

function OverviewInsightsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading overview"
      className="dashboard-overview-insights-stack"
      role="status"
    >
      <div className="dashboard-insights-grid">
        <section
          className="dashboard-metric-card dashboard-skeleton-pulse"
          aria-hidden="true"
        >
          <div className="dashboard-overview-skeleton-metric-inner" />
        </section>
        <section
          className="dashboard-metric-card dashboard-skeleton-pulse"
          aria-hidden="true"
        >
          <div className="dashboard-overview-skeleton-metric-inner" />
        </section>
      </div>
      <section
        className="dashboard-smart-summary-card dashboard-skeleton-pulse"
        aria-hidden="true"
      >
        <div className="dashboard-overview-skeleton-smart-summary-inner" />
      </section>
    </div>
  );
}

function FeedbackInsightListSkeleton() {
  return (
    <ul
      aria-busy="true"
      aria-label="Loading feedback"
      className="dashboard-insights-list dashboard-conversations-scroll-list"
      role="status"
    >
      <li className="dashboard-insight-card-wrap">
        <div
          aria-hidden="true"
          className="dashboard-insight-card dashboard-feedback-skeleton-insight-card dashboard-skeleton-pulse"
        />
      </li>
    </ul>
  );
}

function DelayedEntriesHint({ className }: { className?: string }) {
  return (
    <p
      className={`dashboard-delayed-entries-hint muted${className ? ` ${className}` : ""}`}
      role="status"
    >
      <CloudIcon
        aria-hidden="true"
        className="dashboard-delayed-entries-hint-icon"
      />
      Can take ~2mins to see new entries
    </p>
  );
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia(query);

    const update = () => setMatches(media.matches);
    update();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, [query]);

  return matches;
}

function linearNewIssueUrlFromInsightTitle(title: string): string {
  const q = encodeURIComponent(title.trim()).replace(/%20/g, "+");
  return `https://linear.app/new?title=${q}`;
}

function FeedbackConversationTurnMarkdown({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const rootClass =
    role === "user"
      ? "dashboard-msg dashboard-msg-user"
      : "dashboard-msg dashboard-msg-assistant";
  const markdownClass =
    role === "user"
      ? "dashboard-msg-markdown dashboard-msg-markdown--user"
      : "dashboard-msg-markdown dashboard-msg-markdown--assistant";

  return (
    <div className={rootClass}>
      <span className="dashboard-msg-label">
        {role === "user" ? "User" : "Assistant"}
      </span>
      <div className={markdownClass}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

function FeedbackConversationActionBar({
  insightTitle,
  conversationDetailLoading,
  conversationDetail,
  conversationCopyStatus,
  onScreenshotChat,
  tags,
  addTagsDisabled,
  onAddTagsClick,
  onRemoveTag,
  tagRemoveBusy,
  addTagInlineOpen,
  addTagInput,
  onAddTagInputChange,
  onSubmitAddTag,
  addTagSubmitting,
  addTagError,
}: {
  insightTitle: string;
  conversationDetailLoading: boolean;
  conversationDetail: ConversationItem | null;
  conversationCopyStatus: "idle" | "loading" | "success";
  onScreenshotChat: () => void;
  tags: Record<string, unknown> | undefined;
  addTagsDisabled?: boolean;
  onAddTagsClick: () => void;
  onRemoveTag: (tag: string) => void;
  tagRemoveBusy: string | null;
  addTagInlineOpen: boolean;
  addTagInput: string;
  onAddTagInputChange: (value: string) => void;
  onSubmitAddTag: () => void;
  addTagSubmitting: boolean;
  addTagError: string | null;
}) {
  const linearUrl = linearNewIssueUrlFromInsightTitle(insightTitle);
  const tagMutationLocked = addTagSubmitting;
  const addTagsButtonDisabled = tagMutationLocked || !!addTagsDisabled;
  const [createTicketMenuOpen, setCreateTicketMenuOpen] = useState(false);
  const createTicketMenuRef = useRef<HTMLDivElement | null>(null);
  const screenshotDisabled =
    conversationDetailLoading ||
    !conversationDetail ||
    (conversationDetail.index?.length ?? 0) === 0 ||
    conversationCopyStatus === "loading" ||
    tagMutationLocked;

  useEffect(() => {
    if (!createTicketMenuOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const node = createTicketMenuRef.current;
      if (!node) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (node.contains(target)) return;
      setCreateTicketMenuOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateTicketMenuOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [createTicketMenuOpen]);

  let screenshotUnavailableHint: string | null = null;
  if (tagMutationLocked) {
    screenshotUnavailableHint = "Saving tag…";
  } else if (conversationCopyStatus === "loading") {
    screenshotUnavailableHint = "Creating screenshot…";
  } else if (conversationDetailLoading || !conversationDetail) {
    screenshotUnavailableHint = "Loading conversation…";
  } else if ((conversationDetail.index?.length ?? 0) === 0) {
    screenshotUnavailableHint = "No messages to screenshot";
  }

  const tagPairs = Object.entries(tags ?? {})
    .map(([key, raw]) => {
      if (typeof raw === "string") return [key, raw] as const;
      if (raw && typeof raw === "object") {
        const o = raw as Record<string, unknown>;
        const v = o.value ?? o.tag ?? o.label;
        if (typeof v === "string") return [key, v] as const;
      }
      if (typeof raw === "number" && Number.isFinite(raw)) {
        return [key, String(raw)] as const;
      }
      return null;
    })
    .filter((v): v is readonly [string, string] => Boolean(v))
    .sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <>
      {tagPairs.length > 0 ? (
        <div className="dashboard-feedback-conversation-tags-row">
          {tagPairs.map(([key, label]) => (
            <span
              className="dashboard-feedback-conversation-tag-chip"
              key={`${key}-${label}`}
            >
              <span className="dashboard-feedback-conversation-tag-label">
                {label}
              </span>
              <button
                aria-label={`Remove tag ${label}`}
                className="dashboard-feedback-conversation-tag-remove"
                disabled={tagRemoveBusy === label || tagMutationLocked}
                onClick={() => onRemoveTag(label)}
                type="button"
              >
                <XMarkIcon
                  aria-hidden="true"
                  className="dashboard-feedback-conversation-tag-remove-icon"
                />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {addTagInlineOpen ? (
        <form
          className="dashboard-feedback-conversation-add-tag-row"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmitAddTag();
          }}
        >
          <Input
            aria-label="New tag"
            className="dashboard-feedback-conversation-add-tag-input"
            disabled={tagMutationLocked}
            required
            onChange={(event) => onAddTagInputChange(event.target.value)}
            placeholder="Tag name"
            value={addTagInput}
          />
          <button
            aria-label="Save tag"
            className="dashboard-feedback-conversation-add-tag-save"
            disabled={tagMutationLocked}
            type="submit"
          >
            <CheckIconSolid aria-hidden="true" className="dashboard-nav-icon" />
          </button>
        </form>
      ) : null}
      {addTagError && addTagInlineOpen ? (
        <p className="auth-error dashboard-feedback-conversation-add-tag-error">
          {addTagError}
        </p>
      ) : null}
      <div className="dashboard-feedback-conversation-actionbar">
        <button
          aria-label="Add tags"
          className="dashboard-feedback-conversation-actionbar-btn"
          disabled={addTagsButtonDisabled}
          onClick={onAddTagsClick}
          type="button"
          style={addTagsButtonDisabled ? { cursor: "not-allowed" } : undefined}
        >
          <TagIconSolid aria-hidden="true" className="dashboard-nav-icon" />
          Add tags
        </button>
        <button
          aria-label="Screenshot chat"
          className="dashboard-feedback-conversation-actionbar-btn"
          disabled={screenshotDisabled}
          onClick={onScreenshotChat}
          title={
            screenshotDisabled
              ? (screenshotUnavailableHint ?? "Screenshot unavailable")
              : "Screenshot chat"
          }
          type="button"
        >
          {conversationCopyStatus === "loading" ? (
            <ArrowPathIconSolid
              aria-hidden="true"
              className="dashboard-nav-icon dashboard-conversation-modal-icon-spin"
            />
          ) : conversationCopyStatus === "success" ? (
            <CheckIconSolid aria-hidden="true" className="dashboard-nav-icon" />
          ) : (
            <ClipboardDocumentIconSolid
              aria-hidden="true"
              className="dashboard-nav-icon"
            />
          )}
          Screenshot chat
        </button>
        <div
          className={`dashboard-feedback-create-ticket-menu${
            tagMutationLocked ? " is-disabled" : ""
          }${createTicketMenuOpen ? " is-open" : ""}`}
          ref={createTicketMenuRef}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            aria-disabled={tagMutationLocked}
            aria-haspopup="menu"
            aria-expanded={createTicketMenuOpen}
            className="dashboard-feedback-conversation-actionbar-btn dashboard-feedback-create-ticket-menu-trigger"
            disabled={tagMutationLocked}
            onClick={() => {
              if (tagMutationLocked) return;
              setCreateTicketMenuOpen((open) => !open);
            }}
            type="button"
          >
            <DocumentCheckIconSolid
              aria-hidden="true"
              className="dashboard-nav-icon"
            />
            Create ticket
          </button>
          <div
            className="dashboard-feedback-create-ticket-menu-panel"
            role="menu"
          >
            <a
              className="dashboard-feedback-create-ticket-menu-item"
              href={linearUrl}
              rel="noopener noreferrer"
              role="menuitem"
              target="_blank"
              onClick={() => setCreateTicketMenuOpen(false)}
            >
              <img
                alt=""
                className="dashboard-feedback-linear-menu-logo"
                height={18}
                src="/assets/linear-dark-logo.svg"
                width={18}
              />
              <span className="dashboard-feedback-linear-menu-label">
                Linear
              </span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
}

export default function DashboardHomePage() {
  const router = useRouter();
  const pathname = usePathname();
  const isInviteRoute = pathname === "/invite";
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [user, setUser] = useState<User | null>(null);
  const [auth, setAuth] = useState<Auth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthResolved, setIsAuthResolved] = useState(false);
  const [isFinalizingSignUp, setIsFinalizingSignUp] = useState(false);
  const [signupSetupProgress, setSignupSetupProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("onboarding");
  const [step, setStep] = useState<OnboardingStep>(1);

  const AUTH_QUOTES = useMemo(
    () => [
      "Unlock deeper user feedback, on autopilot.",
      "Find out what your users really need.",
      "What are your users really saying?",
    ],
    [],
  );
  const [authQuote, setAuthQuote] = useState(AUTH_QUOTES[0]);

  useEffect(() => {
    setAuthQuote(AUTH_QUOTES[Math.floor(Math.random() * AUTH_QUOTES.length)]);
  }, [AUTH_QUOTES]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileMenuSlideIn, setMobileMenuSlideIn] = useState(false);
  const mobileMenuClosingRef = useRef(false);
  const [isSettingsSidebarOpen, setIsSettingsSidebarOpen] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");

  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [isSignUpPasswordFocused, setIsSignUpPasswordFocused] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [isInvitePasswordFocused, setIsInvitePasswordFocused] = useState(false);
  const signUpPasswordBlurTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const invitePasswordBlurTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    return () => {
      if (signUpPasswordBlurTimeoutRef.current) {
        clearTimeout(signUpPasswordBlurTimeoutRef.current);
      }
      if (invitePasswordBlurTimeoutRef.current) {
        clearTimeout(invitePasswordBlurTimeoutRef.current);
      }
    };
  }, []);

  const [resetPasswordEmail, setResetPasswordEmail] = useState("");
  const [resetPasswordMessage, setResetPasswordMessage] = useState<
    string | null
  >(null);

  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgPlan, setOrgPlan] = useState<string | null>(null);
  const [dashboardTab, setDashboardTab] = useState<DashboardTabId>("insights");
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionUserRole, setSessionUserRole] = useState<string | null>(null);
  const [sessionUserEmail, setSessionUserEmail] = useState<string | null>(null);
  const [sessionUserSignUpDate, setSessionUserSignUpDate] = useState<
    string | null
  >(null);
  const [userNotifications, setUserNotifications] =
    useState<UserNotifications | null>(null);
  const [notificationsSubmitting, setNotificationsSubmitting] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null,
  );

  const [dangerModalOpen, setDangerModalOpen] = useState(false);
  const [dangerModalTitle, setDangerModalTitle] = useState<
    "Delete Organization" | "Reset All Data" | null
  >(null);
  const [dangerModalInput, setDangerModalInput] = useState("");
  const [dangerModalSubmitting, setDangerModalSubmitting] = useState(false);
  const [dangerModalError, setDangerModalError] = useState<string | null>(null);

  const [subdomainSlug, setSubdomainSlug] = useState("");
  const [existingHostname, setExistingHostname] = useState<string | null>(null);
  const [hostnameSubmitting, setHostnameSubmitting] = useState(false);
  const [hostnameError, setHostnameError] = useState<string | null>(null);
  const [customDomainInput, setCustomDomainInput] = useState("");
  const [customDomainValue, setCustomDomainValue] = useState<string | null>(
    null,
  );
  const [customDomainSubmitting, setCustomDomainSubmitting] = useState(false);
  const [customDomainVerifying, setCustomDomainVerifying] = useState(false);
  const [customDomainVerified, setCustomDomainVerified] = useState(false);
  const [customDomainError, setCustomDomainError] = useState<string | null>(
    null,
  );
  const [customDomainSuccess, setCustomDomainSuccess] = useState<string | null>(
    null,
  );
  const [customDomainDns, setCustomDomainDns] = useState<
    CustomDomainDnsInstruction[]
  >([]);
  const [customDomainSavedToFeedchat, setCustomDomainSavedToFeedchat] =
    useState(false);
  const [customDomainMenuOpen, setCustomDomainMenuOpen] = useState(false);
  const [appearancePreviewMenuOpen, setAppearancePreviewMenuOpen] =
    useState(false);
  const [customDomainRemoving, setCustomDomainRemoving] = useState(false);
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [profilePicLoading, setProfilePicLoading] = useState(false);
  const [profilePicSaving, setProfilePicSaving] = useState(false);
  const [profilePicError, setProfilePicError] = useState<string | null>(null);
  const [website, setWebsite] = useState("");
  const [supportLink, setSupportLink] = useState("");
  const [initialWebsite, setInitialWebsite] = useState("");
  const [initialSupportLink, setInitialSupportLink] = useState("");
  const [websiteSaving, setWebsiteSaving] = useState(false);
  const [supportLinkSaving, setSupportLinkSaving] = useState(false);
  const [websiteError, setWebsiteError] = useState<string | null>(null);
  const [supportLinkError, setSupportLinkError] = useState<string | null>(null);
  const [defaultMessage, setDefaultMessage] = useState("");
  const [initialDefaultMessage, setInitialDefaultMessage] = useState("");
  const [defaultMessageSaving, setDefaultMessageSaving] = useState(false);
  const [defaultMessageError, setDefaultMessageError] = useState<string | null>(
    null,
  );
  const [colorPalette, setColorPalette] = useState<ColorPaletteOption>(
    DEFAULT_COLOR_PALETTE,
  );
  const [initialColorPalette, setInitialColorPalette] =
    useState<ColorPaletteOption>(DEFAULT_COLOR_PALETTE);
  const [colorPaletteSaving, setColorPaletteSaving] = useState(false);
  const [colorPaletteError, setColorPaletteError] = useState<string | null>(
    null,
  );
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [initialAccentColor, setInitialAccentColor] =
    useState(DEFAULT_ACCENT_COLOR);
  const [accentColorSaving, setAccentColorSaving] = useState(false);
  const [accentColorError, setAccentColorError] = useState<string | null>(null);
  /** True when GET /org returned a valid `accentColor` (not the UI placeholder default). */
  const [accentColorPresentOnOrg, setAccentColorPresentOnOrg] = useState(false);
  const [brandName, setBrandName] = useState("");
  const [initialBrandName, setInitialBrandName] = useState("");
  const [brandNameSaving, setBrandNameSaving] = useState(false);
  const [brandNameError, setBrandNameError] = useState<string | null>(null);
  const [orgSetupSnapshot, setOrgSetupSnapshot] = useState<Record<
    string,
    unknown
  > | null>(null);

  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsData, setInsightsData] = useState<InsightsResponse | null>(
    null,
  );
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageData, setUsageData] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [budgetCapInput, setBudgetCapInput] = useState("");
  const [budgetCapSaving, setBudgetCapSaving] = useState(false);
  const [fallbackUrlInput, setFallbackUrlInput] = useState("");
  const [initialFallbackUrl, setInitialFallbackUrl] = useState("");
  const [fallbackUrlSaving, setFallbackUrlSaving] = useState(false);
  const smartSummaryCopyTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [smartSummaryCopyStatus, setSmartSummaryCopyStatus] = useState<
    "idle" | "success"
  >("idle");
  const smartSummaryMarkdownBodyRef = useRef<HTMLDivElement | null>(null);
  const [smartSummaryLongContent, setSmartSummaryLongContent] = useState<
    boolean | null
  >(null);
  const [smartSummaryExpanded, setSmartSummaryExpanded] = useState(false);

  const overviewSummaryMarkdown = useMemo(() => {
    const body = insightsData?.latestSummary?.body;
    return typeof body === "string" && body.trim() ? body.trim() : null;
  }, [insightsData?.latestSummary]);

  /** `undefined` = first page (omit `cursor`); string = `cursor` query for next page. */
  const [analysisRequestCursor, setAnalysisRequestCursor] = useState<
    string | undefined
  >(undefined);
  const [analysisSearchQuery, setAnalysisSearchQuery] = useState("");
  const [analysisSort, setAnalysisSort] = useState<
    "newest" | "oldest" | "best_sentiment" | "worst_sentiment"
  >("newest");
  const [analysisData, setAnalysisData] = useState<AnalysisResponse | null>(
    null,
  );
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisHasMore, setAnalysisHasMore] = useState(true);
  const [analysisExportStatus, setAnalysisExportStatus] = useState<
    "idle" | "processing"
  >("idle");
  const [analysisExportError, setAnalysisExportError] = useState<string | null>(
    null,
  );
  const analysisLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const analysisNextCursorRef = useRef<string | null>(null);
  const [analysisTagFilter, setAnalysisTagFilter] = useState<"all" | string>(
    "all",
  );
  const [addTagInlineOpen, setAddTagInlineOpen] = useState(false);
  const [addTagInput, setAddTagInput] = useState("");
  const [addTagSubmitting, setAddTagSubmitting] = useState(false);
  const [addTagError, setAddTagError] = useState<string | null>(null);
  const [tagRemoveBusy, setTagRemoveBusy] = useState<string | null>(null);

  const ANALYSIS_EMPTY_PLACEHOLDER_CHAT_ID = "__analysis-empty-placeholder__";
  const analysisEmptyPlaceholderDateTime = useMemo(
    () => new Date().toISOString(),
    [],
  );
  const analysisEmptyPlaceholderChat = useMemo(() => {
    return {
      chatId: ANALYSIS_EMPTY_PLACEHOLDER_CHAT_ID,
      dateTime: analysisEmptyPlaceholderDateTime,
      summary: "A summary of feedback given by your user.",
      sentimentScore: 0.6,
      tags: undefined,
    };
  }, [analysisEmptyPlaceholderDateTime]);
  const analysisEmptyPlaceholderConversation = useMemo(() => {
    return {
      chatId: ANALYSIS_EMPTY_PLACEHOLDER_CHAT_ID,
      userId: null,
      index: [
        {
          user: "I have this particular bit of feedback",
          assistant:
            "This is an example! Real user feedback and conversations will be displayed here.",
        },
      ],
    } as ConversationItem;
  }, []);

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const selectedAnalysisChat = useMemo(() => {
    if (!selectedChatId) return null;
    if (selectedChatId === ANALYSIS_EMPTY_PLACEHOLDER_CHAT_ID) {
      return analysisEmptyPlaceholderChat;
    }
    if (!analysisData?.chats?.length) return null;
    return analysisData.chats.find((c) => c.chatId === selectedChatId) ?? null;
  }, [selectedChatId, analysisData, analysisEmptyPlaceholderChat]);

  const uniqueAnalysisTags = useMemo(() => {
    const seen = new Set<string>();
    for (const chat of analysisData?.chats ?? []) {
      for (const v of chatTagValues(chat.tags)) {
        const t = v.trim();
        if (t) seen.add(t);
      }
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [analysisData]);
  const deferredUniqueAnalysisTags = useDeferredValue(uniqueAnalysisTags);
  const [conversationDetail, setConversationDetail] =
    useState<ConversationItem | null>(null);
  const [conversationDetailLoading, setConversationDetailLoading] =
    useState(false);
  const [conversationDetailError, setConversationDetailError] = useState<
    string | null
  >(null);
  const conversationThreadRef = useRef<HTMLDivElement | null>(null);
  const conversationCopySuccessTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [conversationCopyStatus, setConversationCopyStatus] = useState<
    "idle" | "loading" | "success"
  >("idle");
  const userIdCopySuccessTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const [userIdCopyStatus, setUserIdCopyStatus] = useState<"idle" | "success">(
    "idle",
  );
  const customDomainDnsCopyTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const profilePicObjectUrlRef = useRef<string | null>(null);
  const [customDomainDnsCopyStatus, setCustomDomainDnsCopyStatus] = useState<
    "idle" | "success"
  >("idle");
  const [customDomainDnsCopiedValue, setCustomDomainDnsCopiedValue] = useState<
    string | null
  >(null);
  const [customDomainDnsStatusDots, setCustomDomainDnsStatusDots] = useState(0);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamSuccess, setTeamSuccess] = useState<string | null>(null);
  const [teamAddEmail, setTeamAddEmail] = useState("");
  const [teamAddSubmitting, setTeamAddSubmitting] = useState(false);
  const [teamRemovingEmail, setTeamRemovingEmail] = useState<string | null>(
    null,
  );
  const [isProvisioningInviteUser, setIsProvisioningInviteUser] =
    useState(false);
  const [isInviteUserProvisioned, setIsInviteUserProvisioned] = useState(false);
  const [shouldProvisionInviteUser, setShouldProvisionInviteUser] =
    useState(false);

  function hasValidCredentials(email: string, password: string) {
    return /^\S+@\S+\.\S+$/.test(email.trim()) && password.trim().length > 0;
  }

  function isValidHttpUrl(value: string) {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  function normalizeCustomDomain(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "");
  }

  function isValidCustomDomain(value: string) {
    if (!value) return false;
    if (value.length > 253) return false;
    if (!value.includes(".")) return false;
    return /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value);
  }

  useEffect(() => {
    const authInstance = getFirebaseAuth();
    setAuth(authInstance);

    if (!authInstance) {
      setError(
        "Firebase config is missing. Add NEXT_PUBLIC_FIREBASE_* values to the repo root `.env.local`.",
      );
      setIsAuthResolved(true);
      return;
    }

    return onAuthStateChanged(
      authInstance,
      (nextUser) => {
        if (!nextUser) {
          if (profilePicObjectUrlRef.current) {
            URL.revokeObjectURL(profilePicObjectUrlRef.current);
            profilePicObjectUrlRef.current = null;
          }
          setProfilePicUrl(null);
          setProfilePicLoading(false);
          setProfilePicError(null);
          setProfilePicSaving(false);
        }
        setUser(nextUser);
        setIsAuthResolved(true);
      },
      () => {
        setIsAuthResolved(true);
      },
    );
  }, []);

  useEffect(() => {
    if (!isInviteRoute || user) return;
    setShouldProvisionInviteUser(true);
    setAuthMode("signin");
  }, [isInviteRoute, user]);

  useEffect(() => {
    if (!user || isFinalizingSignUp) return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [user, isFinalizingSignUp]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    setMobileMenuSlideIn(false);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setMobileMenuSlideIn(true));
    });
    return () => cancelAnimationFrame(id);
  }, [isMobileMenuOpen]);

  /** Avoid repeating GET /org, /user, /hostname once hydrated; reset on logout. */
  const fullSessionFetchedRef = useRef(false);
  /** Handle account switching without a null-user intermediate state. */
  const lastSessionUserUidRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user || isFinalizingSignUp) {
      fullSessionFetchedRef.current = false;
      lastSessionUserUidRef.current = null;
      setOrgId(null);
      setOrgPlan(null);
      setExistingHostname(null);
      setSessionLoading(false);
      setSessionError(null);
      setSessionUserRole(null);
      setSessionUserEmail(null);
      setSessionUserSignUpDate(null);
      setOrgSetupSnapshot(null);
      setUserNotifications(null);
      setNotificationsSubmitting(false);
      setNotificationsError(null);
      setUsageLoading(false);
      setUsageError(null);
      setUsageData(null);
      setBudgetCapSaving(false);
      setBudgetCapInput("");
      setFallbackUrlInput("");
      setInitialFallbackUrl("");
      setFallbackUrlSaving(false);
      return;
    }
    const nextUid = user.uid ?? null;
    if (nextUid && lastSessionUserUidRef.current !== nextUid) {
      // Reset cached session data if Firebase swaps users without emitting `null`.
      fullSessionFetchedRef.current = false;
      lastSessionUserUidRef.current = nextUid;
      setSessionUserRole(null);
      setSessionUserEmail(null);
      setSessionUserSignUpDate(null);
      setSessionError(null);
      setOrgId(null);
      setOrgPlan(null);
      setExistingHostname(null);
      setOrgSetupSnapshot(null);
      setUserNotifications(null);
      setNotificationsError(null);
      setTeamMembers([]);
      setTeamLoading(false);
      setTeamError(null);
      setTeamSuccess(null);
      setTeamAddEmail("");
      setTeamAddSubmitting(false);
      setTeamRemovingEmail(null);
      setUsageLoading(false);
      setUsageError(null);
      setUsageData(null);
      setBudgetCapSaving(false);
      setBudgetCapInput("");
      setFallbackUrlInput("");
      setInitialFallbackUrl("");
      setFallbackUrlSaving(false);
    }
    if (
      isInviteRoute &&
      (!isInviteUserProvisioned || shouldProvisionInviteUser)
    ) {
      fullSessionFetchedRef.current = false;
      lastSessionUserUidRef.current = null;
      setOrgId(null);
      setOrgPlan(null);
      setExistingHostname(null);
      setSessionLoading(false);
      setSessionError(null);
      setSessionUserRole(null);
      setSessionUserEmail(null);
      setSessionUserSignUpDate(null);
      setOrgSetupSnapshot(null);
      setUserNotifications(null);
      setNotificationsSubmitting(false);
      setNotificationsError(null);
      return;
    }

    if (fullSessionFetchedRef.current) {
      return;
    }

    // Overview can load from GET /overview alone; defer full org/user/hostname until
    // that request has settled on the Overview tab, or immediately if user left Overview.
    if (dashboardTab === "insights") {
      if (insightsLoading) return;
      if (insightsData === null && insightsError === null) return;
    }

    let cancelled = false;
    setSessionLoading(true);
    setSessionError(null);
    setSessionUserRole(null);
    setSessionUserEmail(null);
    setSessionUserSignUpDate(null);
    setNotificationsError(null);

    (async () => {
      try {
        const token = await user.getIdToken();
        const [orgResponse, userResponse] = await Promise.all(
          [
            fetch(`${getFeedchatApiBase()}/org`, { headers: authHeaders(token) }),
            fetch(`${getFeedchatApiBase()}/user`, { headers: authHeaders(token) }),
          ],
        );

        if (cancelled) return;

        if (!orgResponse.ok || !userResponse.ok) {
          setSessionError(
            "Could not load your account. Try refreshing the page.",
          );
          setOrgId(null);
          setOrgPlan(null);
          setExistingHostname(null);
          setSessionUserRole(null);
          setOrgSetupSnapshot(null);
          setUserNotifications(null);
          setAccentColorPresentOnOrg(false);
          return;
        }

        const orgJson = await orgResponse.json();
        const userJson = await userResponse.json();
        if (!cancelled) {
          setSessionUserRole(pickUserRole(userJson));
          setSessionUserEmail(pickUserEmail(userJson));
          setSessionUserSignUpDate(pickUserSignUpDate(userJson));
          setUserNotifications(normalizeUserNotifications(userJson));
        }
        const id = pickOrgId(orgJson);
        if (!id) {
          setSessionError("Could not read organization id from the server.");
          setOrgId(null);
          setOrgPlan(null);
          setExistingHostname(null);
          setSessionUserRole(null);
          setOrgSetupSnapshot(null);
          setUserNotifications(null);
          setAccentColorPresentOnOrg(false);
          return;
        }
        setOrgId(id);
        fullSessionFetchedRef.current = true;
        setOrgPlan(pickOrgPlan(orgJson));
        if (orgJson && typeof orgJson === "object") {
          const orgData = orgJson as Record<string, unknown>;
          setOrgSetupSnapshot(orgData);
          const websiteValue = orgData.website;
          const supportLinkValue = orgData.supportLink;
          const defaultMessageValue = orgData.defaultMessage;
          const customDomainData =
            orgData.customDomain && typeof orgData.customDomain === "object"
              ? (orgData.customDomain as Record<string, unknown>)
              : null;
          const customDomainUrlValue = customDomainData?.url;
          const colorPaletteValue =
            normalizeColorPalette(orgData.colorPalette) ??
            DEFAULT_COLOR_PALETTE;
          const normalizedAccentFromOrg = normalizeAccentColor(
            orgData.accentColor,
          );
          const accentColorValue =
            normalizedAccentFromOrg ?? DEFAULT_ACCENT_COLOR;
          setAccentColorPresentOnOrg(normalizedAccentFromOrg !== null);
          const orgNameValue = orgData.name;
          const orgNameStr =
            typeof orgNameValue === "string" ? orgNameValue : "";
          setBrandName(orgNameStr);
          setInitialBrandName(orgNameStr);
          setWebsite(
            typeof websiteValue === "string" && websiteValue.length > 0
              ? websiteValue
              : "",
          );
          setInitialWebsite(
            typeof websiteValue === "string" && websiteValue.length > 0
              ? websiteValue
              : "",
          );
          setSupportLink(
            typeof supportLinkValue === "string" && supportLinkValue.length > 0
              ? supportLinkValue
              : "",
          );
          setInitialSupportLink(
            typeof supportLinkValue === "string" && supportLinkValue.length > 0
              ? supportLinkValue
              : "",
          );
          const defaultMessageTrimmed =
            typeof defaultMessageValue === "string"
              ? defaultMessageValue.trim()
              : "";
          setDefaultMessage(
            defaultMessageTrimmed.length > 0 ? defaultMessageTrimmed : "",
          );
          setInitialDefaultMessage(
            defaultMessageTrimmed.length > 0 ? defaultMessageTrimmed : "",
          );
          setColorPalette(colorPaletteValue);
          setInitialColorPalette(colorPaletteValue);
          setAccentColor(accentColorValue);
          setInitialAccentColor(accentColorValue);
          const rawFallbackUrl = orgData.fallbackUrl ?? orgData.url;
          const fallbackUrlStr =
            typeof rawFallbackUrl === "string"
              ? normalizeOrgFallbackUrl(rawFallbackUrl)
              : "";
          setFallbackUrlInput(fallbackUrlStr);
          setInitialFallbackUrl(fallbackUrlStr);
          if (
            typeof customDomainUrlValue === "string" &&
            customDomainUrlValue.trim().length > 0
          ) {
            const normalizedCustomDomain =
              normalizeCustomDomain(customDomainUrlValue);
            setCustomDomainValue(normalizedCustomDomain);
            setCustomDomainInput(normalizedCustomDomain);
            setCustomDomainVerified(true);
            setCustomDomainDns([]);
            setCustomDomainSavedToFeedchat(true);
          } else {
            setCustomDomainValue(null);
            setCustomDomainInput("");
            setCustomDomainVerified(false);
            setCustomDomainDns([]);
            setCustomDomainSavedToFeedchat(false);
          }
        } else {
          setFallbackUrlInput("");
          setInitialFallbackUrl("");
          setOrgSetupSnapshot(null);
          setBrandName("");
          setInitialBrandName("");
          setWebsite("");
          setInitialWebsite("");
          setSupportLink("");
          setInitialSupportLink("");
          setDefaultMessage("");
          setInitialDefaultMessage("");
          setColorPalette(DEFAULT_COLOR_PALETTE);
          setInitialColorPalette(DEFAULT_COLOR_PALETTE);
          setAccentColor(DEFAULT_ACCENT_COLOR);
          setInitialAccentColor(DEFAULT_ACCENT_COLOR);
          setAccentColorPresentOnOrg(false);
          setCustomDomainValue(null);
          setCustomDomainInput("");
          setCustomDomainVerified(false);
          setCustomDomainDns([]);
          setCustomDomainSavedToFeedchat(false);
        }

        if (!cancelled) setExistingHostname(null);
      } catch {
        if (!cancelled) {
          setSessionError("Could not load your account.");
          setOrgId(null);
          setOrgPlan(null);
          setExistingHostname(null);
          setSessionUserRole(null);
          setOrgSetupSnapshot(null);
          setAccentColorPresentOnOrg(false);
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isFinalizingSignUp,
    isInviteRoute,
    isInviteUserProvisioned,
    shouldProvisionInviteUser,
    user,
    dashboardTab,
    insightsLoading,
    insightsData,
    insightsError,
  ]);

  useEffect(() => {
    if (sessionLoading) return;
    if (sessionUserRole !== "viewer") return;
    const tab = dashboardTab;
    if (tab !== "appearance" && tab !== "domains") {
      return;
    }
    setDashboardTab("insights");
    if (tab === "appearance" || tab === "domains") {
      setIsSettingsSidebarOpen(false);
    }
  }, [sessionLoading, sessionUserRole, dashboardTab]);

  useEffect(() => {
    if (!user) {
      setIsInviteUserProvisioned(false);
      setIsProvisioningInviteUser(false);
      if (!isInviteRoute) {
        setShouldProvisionInviteUser(false);
      }
      return;
    }
    if (
      !isInviteRoute ||
      !shouldProvisionInviteUser ||
      isInviteUserProvisioned
    ) {
      return;
    }

    let cancelled = false;
    setIsProvisioningInviteUser(true);

    (async () => {
      try {
        const token = await user.getIdToken();
        const userEmail = user.email?.trim() ?? "";
        if (!userEmail) {
          throw new Error("Could not determine email for invite setup.");
        }
        const response = await fetch(`${getFeedchatApiBase()}/user`, {
          method: "POST",
          headers: authJsonHeaders(token),
          body: JSON.stringify({
            email: userEmail,
            signUpDate: new Date().toISOString(),
            role: "viewer",
          }),
        });
        if (!response.ok) {
          const responseText = await response.text();
          let normalizedResponseText = responseText.trim().toLowerCase();
          try {
            const parsed = JSON.parse(responseText) as { error?: unknown };
            if (typeof parsed.error === "string" && parsed.error.trim()) {
              normalizedResponseText = parsed.error.trim().toLowerCase();
            }
          } catch {
            // Non-JSON error body; fall back to raw text matching.
          }
          if (response.status === 403) {
            if (
              normalizedResponseText.includes(
                "user is not associated with any organization",
              )
            ) {
              throw new Error("No invite found. Please create new team.");
            }
            throw new Error("Could not finish invite setup. Please try again.");
          }
          throw new Error("Could not finish invite setup. Please try again.");
        }
        if (!cancelled) {
          setIsInviteUserProvisioned(true);
          setShouldProvisionInviteUser(false);
          setError(null);
          router.replace("/");
        }
      } catch (nextError) {
        if (!cancelled) {
          const nextMessage =
            nextError instanceof Error
              ? nextError.message
              : "Could not finish invite setup. Please try again.";
          setIsProvisioningInviteUser(false);
          setIsInviteUserProvisioned(false);
          setShouldProvisionInviteUser(false);
          if (nextMessage === "No invite found. Please create new team.") {
            setAuthMode("signin");
            setSignInEmail("");
            setSignInPassword("");
          }
          setError(nextMessage);
          if (auth) {
            void signOut(auth).catch(() => {
              // Ensure invite error messaging is not blocked by sign-out failures.
            });
          }
        }
      } finally {
        if (!cancelled) {
          setIsProvisioningInviteUser(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    auth,
    isInviteRoute,
    isInviteUserProvisioned,
    router,
    shouldProvisionInviteUser,
    user,
  ]);

  useEffect(() => {
    if (!isInviteRoute || !user) return;
    if (isProvisioningInviteUser || shouldProvisionInviteUser) return;
    if (error === "No invite found. Please create new team.") return;
    router.replace("/");
  }, [
    error,
    isInviteRoute,
    isProvisioningInviteUser,
    router,
    shouldProvisionInviteUser,
    user,
  ]);

  useEffect(() => {
    if (!user) {
      setSubdomainSlug("");
      setExistingHostname(null);
      setHostnameError(null);
      setCustomDomainInput("");
      setCustomDomainValue(null);
      setCustomDomainVerified(false);
      setCustomDomainDns([]);
      setCustomDomainSavedToFeedchat(false);
      setCustomDomainMenuOpen(false);
      setCustomDomainRemoving(false);
      setTeamMembers([]);
      setTeamLoading(false);
      setTeamError(null);
      setTeamSuccess(null);
      setTeamAddEmail("");
      setTeamAddSubmitting(false);
      setTeamRemovingEmail(null);
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setDashboardTab("insights");
    }
  }, [user]);

  useEffect(() => {
    if (!customDomainSuccess) return;
    const duration =
      customDomainSuccess === CUSTOM_DOMAIN_VERIFIED_SUCCESS_MESSAGE
        ? CUSTOM_DOMAIN_VERIFIED_SUCCESS_DISPLAY_MS
        : 3500;
    const timeout = setTimeout(() => {
      setCustomDomainSuccess(null);
    }, duration);
    return () => clearTimeout(timeout);
  }, [customDomainSuccess]);

  useEffect(() => {
    if (!customDomainValue || customDomainVerified) {
      setCustomDomainDnsStatusDots(0);
      return;
    }
    const intervalId = setInterval(() => {
      setCustomDomainDnsStatusDots((prev) => (prev + 1) % 4);
    }, 500);
    return () => clearInterval(intervalId);
  }, [customDomainValue, customDomainVerified]);

  useEffect(() => {
    if (!user || isFinalizingSignUp || sessionLoading || !orgId) {
      setProfilePicLoading(false);
      setProfilePicError(null);
      setProfilePicUrl(null);
      if (profilePicObjectUrlRef.current) {
        URL.revokeObjectURL(profilePicObjectUrlRef.current);
        profilePicObjectUrlRef.current = null;
      }
      return;
    }

    let cancelled = false;
    setProfilePicLoading(true);
    setProfilePicError(null);

    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${getFeedchatApiBase()}/org/profilePic`, {
          headers: authHeaders(token),
          cache: "no-store",
        });
        if (cancelled) return;
        if (!response.ok) {
          setProfilePicUrl(null);
          return;
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.startsWith("image/")) {
          setProfilePicUrl(null);
          return;
        }
        const blob = await response.blob();
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        if (profilePicObjectUrlRef.current) {
          URL.revokeObjectURL(profilePicObjectUrlRef.current);
        }
        profilePicObjectUrlRef.current = objectUrl;
        setProfilePicUrl(objectUrl);
      } catch {
        if (!cancelled) setProfilePicUrl(null);
      } finally {
        if (!cancelled) setProfilePicLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (profilePicObjectUrlRef.current) {
        URL.revokeObjectURL(profilePicObjectUrlRef.current);
        profilePicObjectUrlRef.current = null;
      }
    };
  }, [user, isFinalizingSignUp, sessionLoading, orgId]);

  useEffect(() => {
    if (orgPlan === null) return;
    if (sessionUserRole === "viewer") {
      setDashboardTab("insights");
      return;
    }
    setDashboardTab("insights");
  }, [orgPlan, sessionUserRole]);

  useEffect(() => {
    if (!user || isFinalizingSignUp) {
      setInsightsData(null);
      setInsightsError(null);
      setInsightsLoading(false);
      return;
    }
    if (dashboardTab !== "insights") return;

    let cancelled = false;
    setInsightsLoading(true);
    setInsightsError(null);

    (async () => {
      try {
        const token = await user.getIdToken();
        const insightsRes = await fetch(`${getFeedchatApiBase()}/overview`, {
          headers: authHeaders(token),
        });

        if (cancelled) return;

        if (!insightsRes.ok) {
          if (insightsRes.status === 404) {
            setInsightsError(null);
            setInsightsData(normalizeInsightsResponse(null));
          } else {
            setInsightsError("Could not load insights.");
            setInsightsData(null);
          }
        } else {
          const raw = await insightsRes.json().catch(() => null);
          setInsightsData(normalizeInsightsResponse(raw));
        }
      } catch {
        if (!cancelled) {
          setInsightsError("Could not load insights.");
          setInsightsData(null);
        }
      } finally {
        if (!cancelled) setInsightsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isFinalizingSignUp, dashboardTab]);

  useEffect(() => {
    if (!user || isFinalizingSignUp || sessionLoading) return;
    if (dashboardTab !== "usage") return;

    let cancelled = false;
    setUsageLoading(true);
    setUsageError(null);

    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${getFeedchatApiBase()}/usage`, {
          headers: authHeaders(token),
        });

        if (cancelled) return;

        if (!res.ok) {
          setUsageError("Could not load usage.");
          setUsageData(null);
          return;
        }

        const json = (await res.json()) as unknown;
        if (!json || typeof json !== "object") {
          setUsageError("Could not read usage data.");
          setUsageData(null);
          return;
        }
        const o = json as Record<string, unknown>;
        const pick = (key: string): number => {
          const v = o[key];
          if (typeof v === "number" && Number.isFinite(v)) return v;
          if (typeof v === "string") {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
          }
          return 0;
        };
        const pickNullable = (key: string): number | null => {
          const v = o[key];
          if (v === null || v === undefined) return null;
          if (typeof v === "number" && Number.isFinite(v)) return v;
          if (typeof v === "string") {
            const n = Number(v);
            if (Number.isFinite(n)) return n;
          }
          return null;
        };
        const pickString = (key: string): string => {
          const v = o[key];
          return typeof v === "string" ? v : "";
        };
        setUsageData({
          creditsUsed: pick("creditsUsed"),
          creditLimit: pick("creditLimit"),
          renewalDate: pickString("renewalDate"),
          budgetCap: pickNullable("budgetCap"),
          additionalCreditLimit: pickNullable("additionalCreditLimit"),
          additionalCreditRate: pickNullable("additionalCreditRate"),
          totalCreditLimit: pickNullable("totalCreditLimit"),
        });
      } catch {
        if (!cancelled) {
          setUsageError("Could not load usage.");
          setUsageData(null);
        }
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isFinalizingSignUp, sessionLoading, dashboardTab]);

  useEffect(() => {
    const cap = usageData?.budgetCap;
    if (cap === null || cap === undefined) return;
    setBudgetCapInput(new Intl.NumberFormat("en-US").format(cap));
  }, [usageData?.budgetCap]);

  useEffect(() => {
    if (!user || isFinalizingSignUp || sessionLoading) return;
    if (dashboardTab !== "team") return;

    let cancelled = false;
    setTeamLoading(true);
    setTeamError(null);

    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch(`${getFeedchatApiBase()}/members`, {
          headers: authHeaders(token),
        });
        if (cancelled) return;
        if (!response.ok) {
          setTeamError("Could not load team members.");
          setTeamMembers([]);
          return;
        }
        const data = (await response.json()) as unknown;
        setTeamMembers(parseTeamMembers(data));
      } catch {
        if (!cancelled) {
          setTeamError("Could not load team members.");
          setTeamMembers([]);
        }
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isFinalizingSignUp, sessionLoading, dashboardTab]);

  useEffect(() => {
    if (!user || isFinalizingSignUp || sessionLoading) return;
    if (dashboardTab !== "conversations") return;

    let cancelled = false;
    setAnalysisLoading(true);
    setAnalysisError(null);
    if (analysisRequestCursor === undefined) {
      setAnalysisTagFilter("all");
    }

    (async () => {
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({
          limit: String(ANALYSIS_PAGE_LIMIT),
        });
        if (analysisRequestCursor !== undefined) {
          params.set("cursor", analysisRequestCursor);
        }
        const response = await fetch(
          `${getFeedchatApiBase()}/analysis?${params}`,
          {
            headers: authHeaders(token),
          },
        );

        if (cancelled) return;

        if (!response.ok) {
          setAnalysisError("Could not load analysis.");
          if (analysisRequestCursor === undefined) {
            setAnalysisData(null);
            setAnalysisHasMore(true);
          }
          return;
        }
        const nextPageData = (await response.json()) as AnalysisResponse;
        const nextCursor = nextPageData.nextCursor ?? null;
        analysisNextCursorRef.current = nextCursor;
        const isFirstPage = analysisRequestCursor === undefined;
        setAnalysisData((prev) => {
          if (isFirstPage || !prev) return nextPageData;
          const existingChatIds = new Set(
            prev.chats.map((chat) => chat.chatId),
          );
          const appendedChats = nextPageData.chats.filter(
            (chat) => !existingChatIds.has(chat.chatId),
          );
          return {
            ...nextPageData,
            chats: [...prev.chats, ...appendedChats],
          };
        });
        setAnalysisHasMore(nextCursor !== null);
      } catch {
        if (!cancelled) {
          setAnalysisError("Could not load analysis.");
          if (analysisRequestCursor === undefined) {
            setAnalysisData(null);
            setAnalysisHasMore(true);
          }
        }
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    isFinalizingSignUp,
    sessionLoading,
    dashboardTab,
    analysisRequestCursor,
  ]);

  useEffect(() => {
    if (!user || isFinalizingSignUp || sessionLoading) return;
    if (dashboardTab !== "conversations") return;
    if (!analysisHasMore || analysisLoading || analysisError) return;

    const target = analysisLoadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];
        if (!firstEntry?.isIntersecting) return;
        const c = analysisNextCursorRef.current;
        if (!c) return;
        observer.unobserve(firstEntry.target);
        setAnalysisRequestCursor(c);
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    user,
    isFinalizingSignUp,
    sessionLoading,
    dashboardTab,
    analysisHasMore,
    analysisLoading,
    analysisError,
  ]);

  useEffect(() => {
    if (!user || isFinalizingSignUp || sessionLoading) return;
    if (dashboardTab !== "conversations" || !selectedChatId) return;

    let cancelled = false;
    setConversationDetail(null);
    setConversationDetailLoading(true);
    setConversationDetailError(null);

    if (selectedChatId === ANALYSIS_EMPTY_PLACEHOLDER_CHAT_ID) {
      setConversationDetail(analysisEmptyPlaceholderConversation);
      setConversationDetailLoading(false);
      setConversationDetailError(null);
      return;
    }

    (async () => {
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ chatId: selectedChatId });
        const response = await fetch(
          `${getFeedchatApiBase()}/conversations?${params}`,
          {
            headers: authHeaders(token),
          },
        );

        if (cancelled) return;

        if (!response.ok) {
          setConversationDetailError("Could not load conversation.");
          setConversationDetail(null);
          return;
        }

        const data = (await response.json()) as ConversationByChatIdResponse;
        const conv = data.conversation;
        if (conv == null) {
          setConversationDetailError("Could not load conversation.");
          setConversationDetail(null);
          return;
        }
        setConversationDetail(conv);
      } catch {
        if (!cancelled) {
          setConversationDetailError("Could not load conversation.");
          setConversationDetail(null);
        }
      } finally {
        if (!cancelled) setConversationDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    isFinalizingSignUp,
    sessionLoading,
    dashboardTab,
    selectedChatId,
    analysisEmptyPlaceholderConversation,
  ]);

  useEffect(() => {
    if (dashboardTab !== "conversations") return;
    if (selectedChatId) return;
    setConversationDetail(null);
    setConversationDetailError(null);
    setConversationDetailLoading(false);
  }, [dashboardTab, selectedChatId]);

  useEffect(() => {
    if (dashboardTab !== "conversations") {
      setSelectedChatId(null);
      setAnalysisRequestCursor(undefined);
      analysisNextCursorRef.current = null;
      setAnalysisData(null);
      setAnalysisError(null);
      setAnalysisHasMore(true);
      setAnalysisTagFilter("all");
      setAddTagInlineOpen(false);
      setAddTagInput("");
      setAddTagError(null);
      setTagRemoveBusy(null);
    }
    if (dashboardTab !== "team") {
      setTeamError(null);
      setTeamSuccess(null);
      setTeamAddEmail("");
      setTeamAddSubmitting(false);
      setTeamRemovingEmail(null);
    }
  }, [dashboardTab]);

  useEffect(() => {
    if (!teamSuccess) return;
    const timeout = setTimeout(() => {
      setTeamSuccess(null);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [teamSuccess]);

  useEffect(() => {
    if (!selectedChatId) {
      setConversationDetail(null);
      setConversationDetailError(null);
      setConversationCopyStatus("idle");
      setUserIdCopyStatus("idle");
      setAddTagInlineOpen(false);
      setAddTagInput("");
      setAddTagError(null);
      if (conversationCopySuccessTimeoutRef.current) {
        clearTimeout(conversationCopySuccessTimeoutRef.current);
        conversationCopySuccessTimeoutRef.current = null;
      }
      if (userIdCopySuccessTimeoutRef.current) {
        clearTimeout(userIdCopySuccessTimeoutRef.current);
        userIdCopySuccessTimeoutRef.current = null;
      }
    }
  }, [selectedChatId]);

  async function copyConversationThreadToClipboard() {
    const node = conversationThreadRef.current;
    if (!node) return;
    setConversationCopyStatus("loading");
    try {
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        width: node.scrollWidth,
        height: node.scrollHeight,
      });
      if (!blob) {
        throw new Error("Could not generate image");
      }
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob }),
      ]);
      setConversationCopyStatus("success");
      if (conversationCopySuccessTimeoutRef.current) {
        clearTimeout(conversationCopySuccessTimeoutRef.current);
      }
      conversationCopySuccessTimeoutRef.current = setTimeout(() => {
        conversationCopySuccessTimeoutRef.current = null;
        setConversationCopyStatus("idle");
      }, 2000);
    } catch {
      setConversationCopyStatus("idle");
    }
  }

  async function copyUserIdToClipboard(userId: string) {
    try {
      await navigator.clipboard.writeText(userId);
      setUserIdCopyStatus("success");
      if (userIdCopySuccessTimeoutRef.current) {
        clearTimeout(userIdCopySuccessTimeoutRef.current);
      }
      userIdCopySuccessTimeoutRef.current = setTimeout(() => {
        userIdCopySuccessTimeoutRef.current = null;
        setUserIdCopyStatus("idle");
      }, 2000);
    } catch {
      setUserIdCopyStatus("idle");
    }
  }

  async function submitAddChatTag() {
    if (!user || !selectedChatId) return;
    const tag = addTagInput.trim();
    if (!tag) return;
    setAddTagError(null);
    const snapshotBefore = selectedAnalysisChat?.tags
      ? { ...selectedAnalysisChat.tags }
      : undefined;
    setAnalysisData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        chats: prev.chats.map((c) =>
          c.chatId === selectedChatId
            ? { ...c, tags: mergeChatTag(c.tags, tag) }
            : c,
        ),
      };
    });
    setAddTagInput("");
    setAddTagInlineOpen(false);
    setAddTagSubmitting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/chat/tag/add`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ chatId: selectedChatId, tag }),
      });
      if (!response.ok) {
        throw new Error("Could not add tag.");
      }
    } catch {
      setAddTagError("Could not add tag.");
      setAnalysisData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chats: prev.chats.map((c) =>
            c.chatId === selectedChatId ? { ...c, tags: snapshotBefore } : c,
          ),
        };
      });
      setAddTagInlineOpen(true);
      setAddTagInput(tag);
    } finally {
      setAddTagSubmitting(false);
    }
  }

  async function removeTagFromChat(chatId: string, tag: string) {
    if (!user) return;
    setTagRemoveBusy(tag);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/chat/tag/remove`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ chatId, tag }),
      });
      if (!response.ok) return;
      setAnalysisData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chats: prev.chats.map((c) =>
            c.chatId === chatId
              ? { ...c, tags: removeChatTagByValue(c.tags, tag) }
              : c,
          ),
        };
      });
      setAnalysisTagFilter((f) => (f === tag ? "all" : f));
    } catch {
      // ignore
    } finally {
      setTagRemoveBusy(null);
    }
  }

  async function refreshTeamMembers() {
    if (!user) return;
    setTeamLoading(true);
    setTeamError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/members`, {
        headers: authHeaders(token),
      });
      if (!response.ok) {
        throw new Error("Could not load team members.");
      }
      const data = (await response.json()) as unknown;
      setTeamMembers(parseTeamMembers(data));
    } catch (nextError) {
      setTeamError(
        nextError instanceof Error
          ? nextError.message
          : "Could not load team members.",
      );
      setTeamMembers([]);
    } finally {
      setTeamLoading(false);
    }
  }

  async function addTeamMember() {
    if (!user) return;
    if (sessionUserRole !== "owner") {
      setTeamError("Must be account owner to do this action.");
      return;
    }
    const email = teamAddEmail.trim().toLowerCase();
    setTeamError(null);
    setTeamSuccess(null);
    if (!isValidEmail(email)) {
      setTeamError("Enter a valid email.");
      return;
    }
    setTeamAddSubmitting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/team/add`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ email, role: "viewer" }),
      });
      if (!response.ok) {
        throw new Error("Could not add team member.");
      }
      setTeamAddEmail("");
      setTeamSuccess("Team member added.");
      await refreshTeamMembers();
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setTeamError(
        nextError instanceof Error
          ? nextError.message
          : "Could not add team member.",
      );
    } finally {
      setTeamAddSubmitting(false);
    }
  }

  async function removeTeamMember(email: string) {
    if (!user) return;
    if (sessionUserRole !== "owner") {
      setTeamError("Must be account owner to do this action.");
      return;
    }
    setTeamError(null);
    setTeamSuccess(null);
    setTeamRemovingEmail(email);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/team/remove`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        throw new Error("Could not remove team member.");
      }
      setTeamSuccess("Team member removed.");
      await refreshTeamMembers();
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setTeamError(
        nextError instanceof Error
          ? nextError.message
          : "Could not remove team member.",
      );
    } finally {
      setTeamRemovingEmail(null);
    }
  }

  async function copyCustomDomainDnsValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCustomDomainDnsCopiedValue(value);
      setCustomDomainDnsCopyStatus("success");
      if (customDomainDnsCopyTimeoutRef.current) {
        clearTimeout(customDomainDnsCopyTimeoutRef.current);
      }
      customDomainDnsCopyTimeoutRef.current = setTimeout(() => {
        customDomainDnsCopyTimeoutRef.current = null;
        setCustomDomainDnsCopiedValue(null);
        setCustomDomainDnsCopyStatus("idle");
      }, 2000);
    } catch {
      setCustomDomainDnsCopiedValue(null);
      setCustomDomainDnsCopyStatus("idle");
    }
  }

  async function copySmartSummaryToClipboard() {
    const text = overviewSummaryMarkdown;
    if (!text) return;
    const plain = stripMarkdownPreservingLineBreaks(text);
    try {
      await navigator.clipboard.writeText(plain);
      setSmartSummaryCopyStatus("success");
      if (smartSummaryCopyTimeoutRef.current) {
        clearTimeout(smartSummaryCopyTimeoutRef.current);
      }
      smartSummaryCopyTimeoutRef.current = setTimeout(() => {
        smartSummaryCopyTimeoutRef.current = null;
        setSmartSummaryCopyStatus("idle");
      }, 2000);
    } catch {
      setSmartSummaryCopyStatus("idle");
    }
  }

  useLayoutEffect(() => {
    if (!overviewSummaryMarkdown) {
      setSmartSummaryLongContent(null);
      setSmartSummaryExpanded(false);
      return;
    }

    const node = smartSummaryMarkdownBodyRef.current;
    // Skip until the ref exists — deps re-run when the block mounts.
    if (!node) {
      return;
    }

    setSmartSummaryExpanded(false);
    setSmartSummaryLongContent(null);

    const applyTempLineClamp = (el: HTMLElement) => {
      el.style.display = "-webkit-box";
      el.style.setProperty("-webkit-box-orient", "vertical");
      el.style.setProperty("-webkit-line-clamp", "10");
      el.style.overflow = "hidden";
    };

    const clearTempLineClamp = (el: HTMLElement) => {
      el.style.display = "";
      el.style.removeProperty("-webkit-box-orient");
      el.style.removeProperty("-webkit-line-clamp");
      el.style.overflow = "";
    };

    const measure = () => {
      const el = smartSummaryMarkdownBodyRef.current;
      if (!el) return;
      applyTempLineClamp(el);
      void el.offsetHeight;
      const overflows = el.scrollHeight > el.clientHeight + 2;
      clearTempLineClamp(el);
      setSmartSummaryLongContent(overflows);
      if (!overflows) {
        setSmartSummaryExpanded(false);
      }
    };

    measure();
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      const el = smartSummaryMarkdownBodyRef.current;
      if (el) clearTempLineClamp(el);
    };
  }, [
    overviewSummaryMarkdown,
    dashboardTab,
    sessionLoading,
    insightsData,
    insightsLoading,
    insightsError,
  ]);

  async function exportAnalysisToCsv() {
    if (!user || analysisExportStatus === "processing") return;
    setAnalysisExportStatus("processing");
    setAnalysisExportError(null);

    try {
      const token = await user.getIdToken();
      const startResponse = await fetch(
        `${getFeedchatApiBase()}/analysis/export`,
        {
          headers: authHeaders(token),
        },
      );

      if (!startResponse.ok) {
        setAnalysisExportError("Could not start export.");
        return;
      }

      let status = "processing";
      for (let attempts = 0; attempts < 120; attempts += 1) {
        const statusResponse = await fetch(
          `${getFeedchatApiBase()}/analysis/export`,
          {
            headers: authHeaders(token),
          },
        );
        if (!statusResponse.ok) {
          setAnalysisExportError("Could not check export status.");
          return;
        }
        const statusPayload = (await statusResponse.json()) as {
          status?: string;
        };
        status = statusPayload.status ?? "processing";
        if (status !== "processing") break;
        await sleep(1500);
      }

      if (status === "processing") {
        setAnalysisExportError(
          "Export is taking longer than expected. Try again.",
        );
        return;
      }

      const downloadResponse = await fetch(
        `${getFeedchatApiBase()}/analysis/export?download=true`,
        {
          headers: authHeaders(token),
        },
      );
      if (!downloadResponse.ok) {
        setAnalysisExportError("Could not download export.");
        return;
      }

      const blob = await downloadResponse.blob();
      const objectUrl = URL.createObjectURL(blob);
      const filename = parseAttachmentFilename(
        downloadResponse.headers.get("content-disposition"),
      );
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setAnalysisExportError("Could not export CSV.");
    } finally {
      setAnalysisExportStatus("idle");
    }
  }

  async function withHandler(action: (authInstance: Auth) => Promise<void>) {
    setIsLoading(true);
    setError(null);

    if (!auth) {
      setError("Firebase auth is not configured.");
      setIsLoading(false);
      return;
    }

    try {
      await action(auth);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Authentication failed.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function openSettingsSidebar() {
    setIsSettingsSidebarOpen(true);
    setDashboardTab("usage");
  }

  function exitSettingsSidebar() {
    setIsSettingsSidebarOpen(false);
    setDashboardTab("insights");
    closeMobileMenu();
  }

  function openMobileMenu() {
    mobileMenuClosingRef.current = false;
    setIsMobileMenuOpen(true);
  }

  function closeMobileMenu() {
    if (!isMobileMenuOpen) return;
    mobileMenuClosingRef.current = true;
    setMobileMenuSlideIn(false);
  }

  const resetAuthAndOnboardingAfterLogout = useCallback(() => {
    if (signUpPasswordBlurTimeoutRef.current) {
      clearTimeout(signUpPasswordBlurTimeoutRef.current);
      signUpPasswordBlurTimeoutRef.current = null;
    }
    if (invitePasswordBlurTimeoutRef.current) {
      clearTimeout(invitePasswordBlurTimeoutRef.current);
      invitePasswordBlurTimeoutRef.current = null;
    }
    setStep(1);
    setCompanyName("");
    setCategory("");
    setSize("");
    setSignUpEmail("");
    setSignUpPassword("");
    setIsSignUpPasswordFocused(false);
    setSignInEmail("");
    setSignInPassword("");
    setIsInvitePasswordFocused(false);
    setResetPasswordEmail("");
    setResetPasswordMessage(null);
    setError(null);
    setIsLoading(false);
    setIsFinalizingSignUp(false);
    setSignupSetupProgress(0);
    setIsProvisioningInviteUser(false);
    setIsInviteUserProvisioned(false);
    if (isInviteRoute) {
      setAuthMode("signin");
      setShouldProvisionInviteUser(true);
    } else {
      setAuthMode("onboarding");
      setShouldProvisionInviteUser(false);
    }
    setAuthQuote(AUTH_QUOTES[Math.floor(Math.random() * AUTH_QUOTES.length)]);
    setDashboardTab("insights");
    setIsSettingsSidebarOpen(false);
    mobileMenuClosingRef.current = false;
    setIsMobileMenuOpen(false);
    setMobileMenuSlideIn(false);
    setDangerModalOpen(false);
    setDangerModalTitle(null);
    setDangerModalInput("");
    setDangerModalError(null);
    setDangerModalSubmitting(false);
  }, [AUTH_QUOTES, isInviteRoute]);

  const hadFirebaseUserRef = useRef(false);
  useEffect(() => {
    if (!isAuthResolved) return;
    if (hadFirebaseUserRef.current && !user) {
      resetAuthAndOnboardingAfterLogout();
    }
    hadFirebaseUserRef.current = user !== null;
  }, [user, isAuthResolved, resetAuthAndOnboardingAfterLogout]);

  function handleMobileAsideTransitionEnd(
    event: React.TransitionEvent<HTMLElement>,
  ) {
    if (event.propertyName !== "transform") return;
    if (mobileMenuClosingRef.current) {
      mobileMenuClosingRef.current = false;
      setIsMobileMenuOpen(false);
    }
  }

  async function saveWebsite() {
    if (!user) return;
    const trimmedWebsite = website.trim();
    setWebsiteError(null);
    if (!trimmedWebsite) {
      setWebsiteError("Enter a Website URL to save.");
      return;
    }
    if (!isValidHttpUrl(trimmedWebsite)) {
      setWebsiteError(
        "Website must be a valid URL starting with http:// or https://.",
      );
      return;
    }
    setWebsiteSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/org/website`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ website: trimmedWebsite }),
      });
      if (!response.ok) throw new Error("Could not save Website.");
      setWebsite(trimmedWebsite);
      setInitialWebsite(trimmedWebsite);
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setWebsiteError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setWebsiteSaving(false);
    }
  }

  async function saveSupportLink() {
    if (!user) return;
    const trimmedSupportLink = supportLink.trim();
    setSupportLinkError(null);
    if (!trimmedSupportLink) {
      setSupportLinkError("Enter a Support Link URL to save.");
      return;
    }
    if (!isValidHttpUrl(trimmedSupportLink)) {
      setSupportLinkError(
        "Support Link must be a valid URL starting with http:// or https://.",
      );
      return;
    }
    setSupportLinkSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/org/supportLink`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ supportLink: trimmedSupportLink }),
      });
      if (!response.ok) throw new Error("Could not save Support Link.");
      setSupportLink(trimmedSupportLink);
      setInitialSupportLink(trimmedSupportLink);
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setSupportLinkError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setSupportLinkSaving(false);
    }
  }

  async function saveDefaultMessage() {
    if (!user) return;
    const trimmed = defaultMessage.trim();
    setDefaultMessageError(null);
    setDefaultMessageSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/org/defaultMessage`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ defaultMessage: trimmed }),
      });
      if (!response.ok) throw new Error("Could not save message.");
      setDefaultMessage(trimmed);
      setInitialDefaultMessage(trimmed);
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setDefaultMessageError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setDefaultMessageSaving(false);
    }
  }

  async function saveBrandName() {
    if (!user) return;
    const trimmed = brandName.trim();
    setBrandNameError(null);
    setBrandNameSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/org/name`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) throw new Error("Could not save brand name.");
      setBrandName(trimmed);
      setInitialBrandName(trimmed);
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setBrandNameError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setBrandNameSaving(false);
    }
  }

  async function refreshOrgSetupSnapshot(patch?: Record<string, unknown>) {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/org`, {
        headers: authHeaders(token),
      });
      if (!response.ok) return;
      const orgJson = await response.json();
      if (orgJson && typeof orgJson === "object") {
        setOrgSetupSnapshot({
          ...(orgJson as Record<string, unknown>),
          ...(patch ?? {}),
        });
      }
    } catch {
      /* ignore snapshot refresh */
    }
  }

  async function saveColorPalette(nextPalette: ColorPaletteOption) {
    if (!user) return;
    setColorPalette(nextPalette);
    setColorPaletteError(null);
    setColorPaletteSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/org/colorPalette`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ colorPalette: nextPalette }),
      });
      if (!response.ok) throw new Error("Could not save Color Palette.");
      setInitialColorPalette(nextPalette);
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setColorPalette(initialColorPalette);
      setColorPaletteError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setColorPaletteSaving(false);
    }
  }

  async function saveAccentColor() {
    if (!user) return;
    const normalizedAccentColor = normalizeAccentColor(accentColor);
    setAccentColorError(null);
    if (!normalizedAccentColor) {
      setAccentColorError("Accent Color must be a valid hex code.");
      return;
    }
    setAccentColorSaving(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`${getFeedchatApiBase()}/org/accentColor`, {
        method: "POST",
        headers: authJsonHeaders(token),
        body: JSON.stringify({ accentColor: normalizedAccentColor }),
      });
      if (!response.ok) throw new Error("Could not save Accent Color.");
      setAccentColor(normalizedAccentColor);
      setInitialAccentColor(normalizedAccentColor);
      setAccentColorPresentOnOrg(true);
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setAccentColorError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setAccentColorSaving(false);
    }
  }

  async function handleProfilePicSelection(file: File | null) {
    setProfilePicError(null);
    if (!file) {
      return;
    }
    const isSupportedType = PROFILE_PIC_ACCEPTED_TYPES.has(file.type);
    if (!isSupportedType) {
      setProfilePicError("Use .png, .jpg, .jpeg, or .webp files.");
      return;
    }
    if (file.size > MAX_PROFILE_PIC_FILE_SIZE_BYTES) {
      setProfilePicError("Profile pic must be 1MB or smaller.");
      return;
    }
    await uploadProfilePic(file);
  }

  async function uploadProfilePic(file: File) {
    if (!user) return;
    setProfilePicSaving(true);
    setProfilePicError(null);
    try {
      const token = await user.getIdToken();
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`${getFeedchatApiBase()}/org/profilePic`, {
        method: "POST",
        headers: authHeaders(token),
        body,
      });
      if (!response.ok) throw new Error("Could not upload profile pic.");
      const profilePicResponse = await fetch(
        `${getFeedchatApiBase()}/org/profilePic`,
        {
          headers: authHeaders(token),
          cache: "no-store",
        },
      );
      if (profilePicResponse.ok) {
        const contentType =
          profilePicResponse.headers.get("content-type") ?? "";
        if (contentType.startsWith("image/")) {
          const blob = await profilePicResponse.blob();
          const objectUrl = URL.createObjectURL(blob);
          if (profilePicObjectUrlRef.current) {
            URL.revokeObjectURL(profilePicObjectUrlRef.current);
          }
          profilePicObjectUrlRef.current = objectUrl;
          setProfilePicUrl(objectUrl);
        }
      }
      await refreshOrgSetupSnapshot({ hasProfilePic: true });
    } catch (nextError) {
      setProfilePicError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setProfilePicSaving(false);
    }
  }

  async function addCustomDomain() {
    const domain = normalizeCustomDomain(customDomainInput);
    setCustomDomainError(null);
    setCustomDomainSuccess(null);
    setCustomDomainVerified(false);
    setCustomDomainDns([]);
    setCustomDomainSavedToFeedchat(false);
    setCustomDomainMenuOpen(false);

    if (!isValidCustomDomain(domain)) {
      setCustomDomainError("Enter a valid domain, e.g. feedback.company.com");
      return;
    }

    setCustomDomainSubmitting(true);
    try {
      const response = await fetch("/api/vercel/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        verified?: boolean;
        instructions?: CustomDomainDnsInstruction[];
      } | null;
      if (!response.ok) {
        throw new Error(payload?.message ?? "Could not add custom domain.");
      }
      setCustomDomainValue(domain);
      setCustomDomainInput(domain);
      setCustomDomainVerified(Boolean(payload?.verified));
      setCustomDomainDns(
        Array.isArray(payload?.instructions) ? payload.instructions : [],
      );
      if (payload?.verified) {
        if (!user) {
          throw new Error("Could not save verified domain.");
        }
        const token = await user.getIdToken();
        const saveResponse = await fetch(`${getFeedchatApiBase()}/customDomain`, {
          method: "POST",
          headers: authJsonHeaders(token),
          body: JSON.stringify({ domain }),
        });
        if (!saveResponse.ok) {
          throw new Error("Domain verified, but failed to save in Feedchat.");
        }
        setCustomDomainSavedToFeedchat(true);
        setCustomDomainSuccess(CUSTOM_DOMAIN_VERIFIED_SUCCESS_MESSAGE);
      }
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setCustomDomainError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setCustomDomainSubmitting(false);
    }
  }

  async function refreshCustomDomainStatus() {
    if (!user) return;
    const domain =
      customDomainValue ?? normalizeCustomDomain(customDomainInput);
    if (!isValidCustomDomain(domain)) {
      setCustomDomainError("Enter a valid domain, e.g. feedback.company.com");
      return;
    }

    setCustomDomainVerifying(true);
    setCustomDomainError(null);
    try {
      const statusResponse = await fetch(
        `/api/vercel/domains?domain=${encodeURIComponent(domain)}`,
      );
      const statusPayload = (await statusResponse.json().catch(() => null)) as {
        message?: string;
        verified?: boolean;
        instructions?: CustomDomainDnsInstruction[];
      } | null;
      if (!statusResponse.ok) {
        throw new Error(
          statusPayload?.message ?? "Could not fetch custom domain status.",
        );
      }

      setCustomDomainValue(domain);
      setCustomDomainVerified(Boolean(statusPayload?.verified));
      setCustomDomainDns(
        Array.isArray(statusPayload?.instructions)
          ? statusPayload.instructions
          : [],
      );

      if (!statusPayload?.verified) {
        return;
      }

      if (!customDomainSavedToFeedchat) {
        const token = await user.getIdToken();
        const response = await fetch(`${getFeedchatApiBase()}/customDomain`, {
          method: "POST",
          headers: authJsonHeaders(token),
          body: JSON.stringify({ domain }),
        });
        if (!response.ok) {
          throw new Error("Domain verified, but failed to save in Feedchat.");
        }
        setCustomDomainSavedToFeedchat(true);
      }
      setCustomDomainSuccess(CUSTOM_DOMAIN_VERIFIED_SUCCESS_MESSAGE);
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setCustomDomainError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setCustomDomainVerifying(false);
    }
  }

  async function removeCustomDomain() {
    if (!user || !customDomainValue) return;
    const domain = customDomainValue;
    setCustomDomainRemoving(true);
    setCustomDomainError(null);
    setCustomDomainSuccess(null);
    try {
      const removeResponse = await fetch("/api/vercel/domains", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const removePayload = (await removeResponse.json().catch(() => null)) as {
        message?: string;
      } | null;
      if (!removeResponse.ok) {
        throw new Error(
          removePayload?.message ?? "Could not remove custom domain.",
        );
      }

      if (customDomainVerified) {
        const token = await user.getIdToken();
        const response = await fetch(
          `${getFeedchatApiBase()}/customDomain/delete`,
          {
            method: "POST",
            headers: authJsonHeaders(token),
            body: JSON.stringify({ domain }),
          },
        );
        if (!response.ok && response.status !== 404) {
          throw new Error(
            "Removed from Vercel, but failed to remove from Feedchat.",
          );
        }
      }

      setCustomDomainValue(null);
      setCustomDomainInput("");
      setCustomDomainVerified(false);
      setCustomDomainDns([]);
      setCustomDomainSavedToFeedchat(false);
      setCustomDomainSuccess("Custom domain removed.");
      setCustomDomainMenuOpen(false);
      void refreshOrgSetupSnapshot();
    } catch (nextError) {
      setCustomDomainError(
        nextError instanceof Error ? nextError.message : "Request failed.",
      );
    } finally {
      setCustomDomainRemoving(false);
    }
  }

  useEffect(() => {
    if (!user || !customDomainValue || customDomainVerified) return;
    void refreshCustomDomainStatus();
    const intervalId = setInterval(() => {
      void refreshCustomDomainStatus();
    }, 12000);
    return () => clearInterval(intervalId);
  }, [user, customDomainValue, customDomainVerified]);

  async function finalizeSignup(
    authInstance: Auth,
    signedInUser: User,
    fallbackEmail: string,
  ) {
    setSignupSetupProgress(8);
    const token = await signedInUser.getIdToken();
    setSignupSetupProgress(22);
    const userEmail = signedInUser.email ?? fallbackEmail;

    if (!userEmail) {
      throw new Error("Could not determine email for user creation.");
    }

    const headers = authJsonHeaders(token);

    const orgResponse = await fetch(`${getFeedchatApiBase()}/org`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: companyName,
        category,
        size,
      }),
    });

    if (!orgResponse.ok) {
      throw new Error("Could not complete onboarding setup. Please try again.");
    }

    setSignupSetupProgress(52);

    let orgPayload: unknown;
    try {
      orgPayload = await orgResponse.json();
    } catch {
      orgPayload = null;
    }
    const orgId = pickOrgId(orgPayload);
    if (!orgId) {
      throw new Error("Could not complete onboarding setup. Please try again.");
    }

    setSignupSetupProgress(72);

    const userResponse = await fetch(`${getFeedchatApiBase()}/user`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: userEmail,
        signUpDate: new Date().toISOString(),
        org: orgId,
        role: "owner",
      }),
    });

    if (!userResponse.ok) {
      throw new Error("Could not complete onboarding setup. Please try again.");
    }

    setSignupSetupProgress(100);
    setIsFinalizingSignUp(false);
  }

  async function continueWithGoogleSignUp(authInstance: Auth) {
    setSignupSetupProgress(0);
    setIsFinalizingSignUp(true);
    try {
      const credential = await signInWithPopup(
        authInstance,
        new GoogleAuthProvider(),
      );
      setSignupSetupProgress(4);
      await finalizeSignup(authInstance, credential.user, "");
    } catch (nextError) {
      setSignupSetupProgress(0);
      setIsFinalizingSignUp(false);
      await signOut(authInstance);
      throw nextError;
    }
  }

  async function createEmailPasswordAccount(authInstance: Auth) {
    setSignupSetupProgress(0);
    setIsFinalizingSignUp(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        authInstance,
        signUpEmail,
        signUpPassword,
      );
      setSignupSetupProgress(4);
      await finalizeSignup(authInstance, credential.user, signUpEmail);
    } catch (nextError) {
      setSignupSetupProgress(0);
      setIsFinalizingSignUp(false);
      await signOut(authInstance);
      throw nextError;
    }
  }

  if (!isAuthResolved) {
    return (
      <main className="page-shell">
        <p>Loading...</p>
      </main>
    );
  }

  if (
    user &&
    !isFinalizingSignUp &&
    (!isInviteRoute || (isInviteUserProvisioned && !shouldProvisionInviteUser))
  ) {
    const authedUser = user;
    const isSessionViewer = sessionUserRole === "viewer";
    const canManageTeam = sessionUserRole === "owner";

    const navigationItems = [
      {
        id: "insights" as const,
        label: "Overview",
        icon: CubeTransparentIcon,
      },
      {
        id: "conversations" as const,
        label: "Feedback",
        icon: ChatBubbleBottomCenterTextIcon,
      },
    ] as const;

    const settingsNavItems = [
      {
        id: "team" as const,
        label: "Team",
        icon: UserGroupIcon,
        selectable: true,
      },
      {
        id: "usage" as const,
        label: "Usage",
        icon: CalculatorIcon,
        selectable: true,
      },
    ] as const;

    const mainAriaLabel =
      dashboardTab === "account"
        ? "Account content"
        : dashboardTab === "usage"
          ? "Usage content"
          : dashboardTab === "insights"
            ? "Overview content"
            : dashboardTab === "conversations"
              ? "Feedback content"
              : dashboardTab === "team"
                ? "Team content"
                : "Dashboard content";

    const showDomainsPanel = false;

    const setupChecklistAppearanceDone =
      orgSetupAppearanceDone(orgSetupSnapshot);
    const setupChecklistTeamDone = orgSetupTeamDone(orgSetupSnapshot);

    const normalizedOrgPlan =
      orgPlan !== null ? orgPlan.trim().toLowerCase() : "";
    const isCancelledOrgPlan = normalizedOrgPlan === "cancelled";
    const isPaidOrgPlan =
      orgPlan !== null && normalizedOrgPlan !== "free" && !isCancelledOrgPlan;

    const showOverviewDelayedEntriesHint =
      isPaidOrgPlan &&
      Boolean(orgId) &&
      !sessionLoading &&
      dashboardTab === "insights" &&
      !insightsLoading &&
      !insightsError &&
      insightsData !== null &&
      (insightsData.chatCountTotal ?? 0) === 0 &&
      !overviewSummaryMarkdown;

    const showFeedbackDelayedEntriesHint =
      isPaidOrgPlan &&
      Boolean(orgId) &&
      !sessionLoading &&
      dashboardTab === "conversations" &&
      !analysisLoading &&
      !analysisError &&
      analysisData !== null &&
      (analysisData.chats?.length ?? 0) === 0;

    /** Paid org, no sessions yet: show on every tab (not tied to Overview/Feedback only). */
    const insightsEmptyForGatherPanel =
      insightsData !== null &&
      !insightsLoading &&
      !insightsError &&
      (insightsData.chatCountTotal ?? 0) === 0 &&
      !overviewSummaryMarkdown;

    const analysisEmptyOrUnsetForGatherPanel =
      analysisData === null ||
      (!analysisLoading &&
        !analysisError &&
        (analysisData.chats?.length ?? 0) === 0);

    const showPaidEmptySetupFloat =
      isPaidOrgPlan &&
      !isSessionViewer &&
      !sessionLoading &&
      Boolean(orgId) &&
      insightsEmptyForGatherPanel &&
      analysisEmptyOrUnsetForGatherPanel;

    const showCancelledRestartSetupFloat =
      isCancelledOrgPlan &&
      !isSessionViewer &&
      !sessionLoading &&
      Boolean(orgId);

    async function openStripePortal() {
      return;
    }

    async function saveBudgetCap() {
      if (sessionUserRole !== "owner") return;

      const n = Number(budgetCapInput.replaceAll(",", ""));
      if (!Number.isFinite(n)) {
        return;
      }

      setBudgetCapSaving(true);
      try {
        const token = await authedUser.getIdToken();
        const res = await fetch(`${getFeedchatApiBase()}/org/budgetCap`, {
          method: "POST",
          headers: authJsonHeaders(token),
          body: JSON.stringify({ budgetCap: n }),
        });
        if (!res.ok) {
          throw new Error("Could not save budget cap.");
        }
        const json = (await res.json().catch(() => null)) as unknown;
        const o =
          json && typeof json === "object"
            ? (json as Record<string, unknown>)
            : {};
        const pickNullable = (key: string): number | null => {
          const v = o[key];
          if (v === null || v === undefined) return null;
          if (typeof v === "number" && Number.isFinite(v)) return v;
          if (typeof v === "string") {
            const next = Number(v);
            if (Number.isFinite(next)) return next;
          }
          return null;
        };

        const nextBudgetCap = pickNullable("budgetCap") ?? n;
        const nextAdditionalCreditLimit = pickNullable("additionalCreditLimit");
        const nextAdditionalCreditRate = pickNullable("additionalCreditRate");
        const nextTotalCreditLimit = pickNullable("totalCreditLimit");

        setUsageData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            budgetCap: nextBudgetCap,
            additionalCreditLimit:
              nextAdditionalCreditLimit ?? prev.additionalCreditLimit,
            additionalCreditRate:
              nextAdditionalCreditRate ?? prev.additionalCreditRate,
            totalCreditLimit: nextTotalCreditLimit ?? prev.totalCreditLimit,
          };
        });
        setBudgetCapInput(
          new Intl.NumberFormat("en-US").format(nextBudgetCap ?? n),
        );
      } catch {
      } finally {
        setBudgetCapSaving(false);
      }
    }

    async function saveFallbackUrl() {
      if (sessionUserRole !== "owner") return;

      const normalized = normalizeOrgFallbackUrl(fallbackUrlInput);
      setFallbackUrlSaving(true);
      try {
        const token = await authedUser.getIdToken();
        const res = await fetch(`${getFeedchatApiBase()}/org/fallbackUrl`, {
          method: "POST",
          headers: authJsonHeaders(token),
          body: JSON.stringify({ url: normalized }),
        });
        if (!res.ok) {
          throw new Error("Could not save fallback URL.");
        }
        const json = (await res.json().catch(() => null)) as unknown;
        let next = normalized;
        if (json && typeof json === "object") {
          const o = json as Record<string, unknown>;
          const fromUrl = o.url;
          const fromFallback = o.fallbackUrl;
          if (typeof fromUrl === "string" && fromUrl.trim()) {
            next = normalizeOrgFallbackUrl(fromUrl);
          } else if (typeof fromFallback === "string") {
            next = normalizeOrgFallbackUrl(fromFallback);
          }
        }
        setInitialFallbackUrl(next);
        setFallbackUrlInput(next);
        setOrgSetupSnapshot((prev) =>
          prev
            ? {
                ...prev,
                url: next.length > 0 ? next : null,
                fallbackUrl: next.length > 0 ? next : null,
              }
            : null,
        );
      } catch {
      } finally {
        setFallbackUrlSaving(false);
      }
    }

    function renderMainSidebar() {
      return (
        <>
          <div className="dashboard-sidebar-top">
            <div className="dashboard-logo-row">
              <img
                alt=""
                aria-hidden="true"
                className="dashboard-logo-icon"
                src="/assets/icon.svg"
              />
              <p className="dashboard-logo">Feedchat</p>
            </div>
            <nav className="dashboard-nav" aria-label="Dashboard sections">
              {navigationItems.map((item) => (
                <button
                  key={item.id}
                  className={`dashboard-nav-item${
                    dashboardTab === item.id ? " is-active" : ""
                  }`}
                  onClick={() => {
                    setDashboardTab(item.id);
                    closeMobileMenu();
                  }}
                  type="button"
                >
                  <item.icon
                    aria-hidden="true"
                    className="dashboard-nav-icon"
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </nav>
            <button
              className="dashboard-logout"
              onClick={() => {
                openSettingsSidebar();
              }}
              type="button"
            >
              <Cog6ToothIcon
                aria-hidden="true"
                className="dashboard-nav-icon"
              />
              <span>Settings</span>
            </button>
          </div>
        </>
      );
    }

    function renderSettingsSidebar() {
      return (
        <>
          <div className="dashboard-sidebar-top">
            <div className="dashboard-logo-row">
              <img
                alt=""
                aria-hidden="true"
                className="dashboard-logo-icon"
                src="/assets/icon.svg"
              />
              <p className="dashboard-logo">Feedchat</p>
            </div>
            <div className="dashboard-settings-sidebar-heading">
              <button
                aria-label="Back to dashboard"
                className="dashboard-settings-sidebar-back"
                onClick={() => {
                  exitSettingsSidebar();
                }}
                type="button"
              >
                <ChevronLeftIcon
                  aria-hidden="true"
                  className="dashboard-nav-icon"
                />
              </button>
              <p className="dashboard-settings-sidebar-subtitle">Settings</p>
            </div>
            <nav className="dashboard-nav" aria-label="Settings sections">
              {settingsNavItems.map((item) => (
                <Fragment key={item.id}>
                  <button
                    className={`dashboard-nav-item${
                      item.selectable && dashboardTab === item.id
                        ? " is-active"
                        : ""
                    }`}
                    disabled={!item.selectable}
                    onClick={() => {
                      if (item.selectable) setDashboardTab(item.id);
                    }}
                    type="button"
                  >
                    <item.icon
                      aria-hidden="true"
                      className="dashboard-nav-icon"
                    />
                    <span>{item.label}</span>
                  </button>
                  {item.id === "usage" ? (
                    <div
                      aria-hidden="true"
                      className="dashboard-nav-divider"
                      role="presentation"
                    />
                  ) : null}
                </Fragment>
              ))}
            </nav>
          </div>
          <div className="dashboard-sidebar-bottom">
            <button
              className={`dashboard-nav-item${
                dashboardTab === "account" ? " is-active" : ""
              }`}
              onClick={() => {
                setDashboardTab("account");
              }}
              type="button"
            >
              <UserCircleIcon
                aria-hidden="true"
                className="dashboard-nav-icon"
              />
              <span>Account</span>
            </button>
            <button
              className="dashboard-logout"
              onClick={() =>
                withHandler(async (authInstance) => {
                  await signOut(authInstance);
                  setIsSettingsSidebarOpen(false);
                })
              }
              type="button"
            >
              <ArrowRightEndOnRectangleIcon
                aria-hidden="true"
                className="dashboard-nav-icon"
              />
              <span>Log out</span>
            </button>
          </div>
        </>
      );
    }

    function renderSidebarMenu() {
      return isSettingsSidebarOpen
        ? renderSettingsSidebar()
        : renderMainSidebar();
    }

    return (
      <main className="dashboard-shell">
        <button
          aria-controls="mobile-dashboard-sidebar"
          aria-expanded={isMobileMenuOpen}
          aria-label="Open menu"
          className="dashboard-mobile-menu-button"
          onClick={() => {
            openMobileMenu();
          }}
          type="button"
        >
          <Bars3Icon aria-hidden="true" className="dashboard-nav-icon" />
        </button>

        <aside
          aria-label={
            isSettingsSidebarOpen
              ? "Settings navigation"
              : "Dashboard navigation"
          }
          className="dashboard-sidebar desktop-sidebar"
        >
          {renderSidebarMenu()}
        </aside>

        {isMobileMenuOpen ? (
          <div
            className={`mobile-sidebar-overlay${
              mobileMenuSlideIn ? " mobile-sidebar-overlay--open" : ""
            }`}
            onClick={() => {
              closeMobileMenu();
            }}
            role="presentation"
          >
            <aside
              aria-label={
                isSettingsSidebarOpen
                  ? "Settings navigation"
                  : "Dashboard navigation"
              }
              className={`dashboard-sidebar mobile-sidebar${
                mobileMenuSlideIn ? " mobile-sidebar--open" : ""
              }`}
              id="mobile-dashboard-sidebar"
              onClick={(event) => event.stopPropagation()}
              onTransitionEnd={(event) => {
                if (event.target !== event.currentTarget) return;
                handleMobileAsideTransitionEnd(event);
              }}
            >
              <button
                aria-label="Close menu"
                className="dashboard-mobile-close-button"
                onClick={() => {
                  closeMobileMenu();
                }}
                type="button"
              >
                <XMarkIcon aria-hidden="true" className="dashboard-nav-icon" />
              </button>
              {renderSidebarMenu()}
            </aside>
          </div>
        ) : null}

        <section aria-label={mainAriaLabel} className="dashboard-main-content">
          <div
            className={`${
              dashboardTab === "usage" || dashboardTab === "account"
                ? "stack"
                : `card stack${
                    dashboardTab === "insights" ||
                    dashboardTab === "conversations"
                      ? " dashboard-data-card"
                      : ""
                  }${
                    dashboardTab === "conversations"
                      ? " dashboard-conversations-card"
                      : ""
                  }`
            }`}
          >
            {sessionLoading && dashboardTab !== "insights" ? (
              <p className="muted">Loading your organization…</p>
            ) : null}
            {sessionError ? <p className="auth-error">{sessionError}</p> : null}
            {false && !sessionLoading && orgId && existingHostname ? (
              <>
                <h1 className="page-title">Subdomain</h1>
                <a
                  className="dashboard-app-link-card"
                  href={`https://${(existingHostname ?? "").replace(/^https?:\/\//, "")}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="dashboard-app-link-url">
                    {(existingHostname ?? "").replace(/^https?:\/\//, "")}
                  </span>
                  <span
                    className="dashboard-app-link-lottie"
                    aria-hidden="true"
                  >
                    <Lottie
                      animationData={liveAnimation}
                      loop
                      style={{ height: 40, width: 40 }}
                    />
                  </span>
                </a>
              </>
            ) : null}
            {false &&
            !sessionLoading &&
            orgId &&
            !existingHostname ? (
              <>
                <h1 className="page-title">Create your app</h1>
                <p className="muted">
                  Choose a subdomain. You can add a custom domain later.
                </p>
                <form
                  className="stack dashboard-subdomain-create-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!user || !orgId) return;

                    setHostnameSubmitting(true);
                    try {
                      throw new Error(
                        "Domains are disabled in OSS single-tenant mode.",
                      );
                    } catch (nextError) {
                      setHostnameError(
                        nextError instanceof Error
                          ? nextError.message
                          : "Request failed.",
                      );
                    } finally {
                      setHostnameSubmitting(false);
                    }
                  }}
                >
                  <div className="dashboard-subdomain-create-field">
                    <label
                      className="dashboard-field-label"
                      htmlFor="tenant-subdomain"
                    >
                      Subdomain
                    </label>
                    <div className="dashboard-subdomain-create-row">
                      <div className="dashboard-hostname-row">
                        <Input
                          autoCapitalize="none"
                          autoComplete="off"
                          disabled={hostnameSubmitting}
                          id="tenant-subdomain"
                          onChange={(event) =>
                            setSubdomainSlug(
                              event.target.value.replace(/[^a-zA-Z]/g, ""),
                            )
                          }
                          placeholder="yourbrand"
                          spellCheck={false}
                          value={subdomainSlug}
                        />
                        <span
                          className="dashboard-hostname-suffix"
                          aria-hidden="true"
                        >
                          (disabled)
                        </span>
                      </div>
                      <Button
                        className="dashboard-subdomain-create-btn"
                        disabled={hostnameSubmitting || !subdomainSlug.trim()}
                        type="submit"
                      >
                        {hostnameSubmitting ? "Creating…" : "Create"}
                      </Button>
                    </div>
                  </div>
                  {hostnameError ? (
                    <p className="auth-error">{hostnameError}</p>
                  ) : null}
                </form>
              </>
            ) : null}
            {false ? (
              <>
                <h1 className="page-title">Notifications</h1>
                <p className="muted">
                  Choose which updates you want to receive.
                </p>
                {notificationsError ? (
                  <p className="auth-error">{notificationsError}</p>
                ) : null}
                {!userNotifications ? (
                  <p className="muted">Loading notification settings…</p>
                ) : (
                  <div className="stack">
                    {(
                      [
                        {
                          id: "billing" as const,
                          label: "Credit Usage Alerts",
                          help: "Get emails when you have used 50%, 75% & 100% of your monthly credits allowance.",
                        },
                        {
                          id: "dataExports" as const,
                          label: "Data Export Alerts",
                          help: "Get emails when your user feedback data is exported.",
                        },
                        {
                          id: "newFeedback" as const,
                          label: "New Feedback Alerts",
                          help: "Get emails when users leave new insights. Capped at 1 per day.",
                        },
                      ] as const
                    ).map((item) => (
                      <div key={item.id} className="dashboard-toggle-row">
                        <div className="dashboard-toggle-row-left">
                          <div className="dashboard-toggle-label-row">
                            <p className="dashboard-toggle-label">
                              {item.label}
                            </p>
                            <span className="dashboard-tooltip-wrap">
                              <button
                                aria-label={`More info: ${item.label}`}
                                className="dashboard-tooltip-trigger"
                                type="button"
                              >
                                <InformationCircleIcon
                                  aria-hidden="true"
                                  className="dashboard-tooltip-icon"
                                />
                              </button>
                              <span
                                className="dashboard-tooltip"
                                role="tooltip"
                              >
                                {item.help}
                              </span>
                            </span>
                          </div>
                        </div>
                        <label className="dashboard-toggle">
                          <input
                            checked={Boolean(userNotifications?.[item.id])}
                            className="dashboard-toggle-input"
                            disabled={notificationsSubmitting}
                            onChange={(event) => {
                              const checked = event.target.checked;
                              const previous = userNotifications ?? {
                                billing: false,
                                newFeedback: false,
                                dataExports: false,
                              };
                              const next: UserNotifications = {
                                ...previous,
                                [item.id]: checked,
                              };
                              setUserNotifications(next);
                              setNotificationsSubmitting(true);
                              setNotificationsError(null);
                              void withHandler(async (authInstance) => {
                                const signedInUser = authInstance.currentUser;
                                if (!signedInUser) {
                                  throw new Error("You are not signed in.");
                                }
                                const token = await signedInUser.getIdToken();
                                const response = await fetch(
                                  `${getFeedchatApiBase()}/user/notifications`,
                                  {
                                    method: "POST",
                                    headers: authJsonHeaders(token),
                                    body: JSON.stringify(next),
                                  },
                                );
                                if (!response.ok) {
                                  const text = await response.text();
                                  throw new Error(
                                    text.trim() ||
                                      "Could not update notification settings.",
                                  );
                                }
                              })
                                .catch((e) => {
                                  setUserNotifications(previous);
                                  setNotificationsError(
                                    e instanceof Error
                                      ? e.message
                                      : "Could not update notification settings.",
                                  );
                                })
                                .finally(() => {
                                  setNotificationsSubmitting(false);
                                });
                            }}
                            type="checkbox"
                          />
                          <span
                            aria-hidden="true"
                            className="dashboard-toggle-track"
                          >
                            <span className="dashboard-toggle-thumb" />
                          </span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : null}
            {!sessionLoading && dashboardTab === "account" ? (
              <>
                <section aria-label="Account details" className="card stack">
                  <h1 className="page-title">Account</h1>
                  <div className="stack">
                    <div className="dashboard-account-row">
                      <p className="dashboard-field-label">Email</p>
                      <p className="dashboard-account-value dashboard-monospace">
                        {sessionUserEmail || "—"}
                      </p>
                    </div>
                    <div className="dashboard-account-row">
                      <p className="dashboard-field-label">Sign up date</p>
                      <p className="dashboard-account-value">
                        {formatLongDateWithOrdinal(sessionUserSignUpDate) || "—"}
                      </p>
                    </div>
                  </div>
                </section>

                <section aria-label="Danger zone" className="card stack">
                  <div className="dashboard-danger-zone">
                    <h2 className="page-title">Danger Zone</h2>
                    <div className="stack dashboard-danger-zone-actions">
                      <div className="dashboard-danger-zone-action">
                        <div className="dashboard-danger-zone-action-header">
                          <p
                            className="dashboard-danger-zone-action-title"
                            style={{ marginTop: 24 }}
                          >
                            Delete Organization
                          </p>
                        </div>
                        <p className="muted dashboard-danger-zone-action-help">
                          Delete all data, users, and accounts.
                        </p>
                        <div className="dashboard-danger-zone-action-top">
                          <Button
                            className="dashboard-danger-zone-btn"
                            onClick={() => {
                              setDangerModalTitle("Delete Organization");
                              setDangerModalInput("");
                              setDangerModalError(null);
                              setDangerModalOpen(true);
                            }}
                            type="button"
                            variant="secondary"
                          >
                            <TrashIcon
                              aria-hidden="true"
                              className="dashboard-danger-zone-btn-icon"
                            />
                            Delete Organization
                          </Button>
                        </div>
                      </div>
                      <div className="dashboard-danger-zone-action">
                        <div className="dashboard-danger-zone-action-header">
                          <p className="dashboard-danger-zone-action-title">
                            Reset All Data
                          </p>
                        </div>
                        <p className="muted dashboard-danger-zone-action-help">
                          Delete all chat data and insights.
                        </p>
                        <div className="dashboard-danger-zone-action-top">
                          <Button
                            className="dashboard-danger-zone-btn"
                            onClick={() => {
                              setDangerModalTitle("Reset All Data");
                              setDangerModalInput("");
                              setDangerModalError(null);
                              setDangerModalOpen(true);
                            }}
                            type="button"
                            variant="secondary"
                          >
                            <TrashIcon
                              aria-hidden="true"
                              className="dashboard-danger-zone-btn-icon"
                            />
                            Reset All Data
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </>
            ) : null}
            {!sessionLoading && dashboardTab === "usage" ? (
              <div className="stack dashboard-overview-insights-stack">
                <section
                  aria-label="Usage versus limits"
                  className="card stack dashboard-details-card dashboard-usage-chart-section"
                >
                  <h1 className="page-title">Usage</h1>
                  <p className="muted">
                    Credit consumption versus your plan limits.
                  </p>
                  {usageLoading ? (
                    <p className="muted">Loading usage…</p>
                  ) : null}
                  {usageError ? (
                    <p className="auth-error">{usageError}</p>
                  ) : null}
                  {!usageLoading && !usageError && usageData ? (
                    <>
                      <UsageLimitsBarChart data={usageData} />
                      <p className="muted dashboard-usage-renewal-line">
                        Resets{" "}
                        {formatRenewalDateLabel(usageData.renewalDate) ||
                          "soon"}
                        .{" "}
                        <button
                          className="dashboard-usage-manage-plan-link"
                          onClick={() => {
                            void openStripePortal();
                          }}
                          type="button"
                        >
                          Manage plan
                        </button>
                        .
                      </p>
                      <div className="stack dashboard-usage-credits-cta">
                        <p className="muted">
                          Need more credits? We offer bulk discounts.
                        </p>
                        <a
                          className="fc-button fc-button-primary dashboard-usage-sales-link"
                          href="https://cal.com/alex-feedchat/bulk-discount"
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <CalendarDaysIcon
                            aria-hidden="true"
                            className="dashboard-usage-sales-link-icon"
                          />
                          Talk to sales
                        </a>
                      </div>
                    </>
                  ) : null}
                </section>
                {!usageLoading && !usageError && usageData ? (
                  <>
                    <section
                      aria-label="Additional usage"
                      className="card stack dashboard-details-card"
                    >
                      <h2 className="page-title">Additional Usage</h2>
                      <p className="muted">
                        If you go over your credit limit. Set additional budget
                        cap.
                      </p>

                      <div className="stack" style={{ gap: 10 }}>
                        <div className="stack" style={{ gap: 6 }}>
                          <p className="muted" style={{ margin: 0 }}>
                            Budget cap
                          </p>
                          <span className="dashboard-plan-text-tooltip">
                            <span
                              aria-label={
                                sessionUserRole === "owner"
                                  ? ""
                                  : "Only account owner can change"
                              }
                              className={
                                sessionUserRole === "owner"
                                  ? ""
                                  : "dashboard-plan-text-tooltip-trigger dashboard-plan-inline-tooltip-trigger dashboard-plan-text-tooltip-trigger--no-underline"
                              }
                              tabIndex={sessionUserRole === "owner" ? -1 : 0}
                              style={{ display: "block" }}
                            >
                              {(() => {
                                const raw = budgetCapInput.replaceAll(",", "");
                                const n = Number(raw);
                                const isOwner = sessionUserRole === "owner";
                                const isValid = Number.isFinite(n);
                                const isDirty =
                                  isOwner &&
                                  budgetCapInput.trim().length > 0 &&
                                  isValid &&
                                  n !== (usageData.budgetCap ?? null);

                                return (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 10,
                                    }}
                                  >
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        border: "1px solid rgba(0,0,0,0.12)",
                                        borderRadius: 10,
                                        overflow: "hidden",
                                        maxWidth: 360,
                                        flex: 1,
                                      }}
                                    >
                                      <span
                                        aria-hidden="true"
                                        style={{
                                          padding: "0 10px",
                                          fontWeight: 600,
                                          opacity: 0.75,
                                          borderRight:
                                            "1px solid rgba(0,0,0,0.08)",
                                          height: 40,
                                          display: "flex",
                                          alignItems: "center",
                                          background: "rgba(0,0,0,0.02)",
                                        }}
                                      >
                                        $
                                      </span>
                                      <div style={{ flex: 1 }}>
                                        <Input
                                          aria-label="Additional budget cap"
                                          disabled={
                                            sessionUserRole !== "owner" ||
                                            budgetCapSaving
                                          }
                                          inputMode="decimal"
                                          onChange={(event) =>
                                            setBudgetCapInput(
                                              event.target.value,
                                            )
                                          }
                                          onBlur={() => {
                                            const nextRaw = budgetCapInput
                                              .replaceAll(",", "")
                                              .trim();
                                            if (!nextRaw) return;
                                            const nextN = Number(nextRaw);
                                            if (!Number.isFinite(nextN)) return;
                                            setBudgetCapInput(
                                              new Intl.NumberFormat(
                                                "en-US",
                                              ).format(nextN),
                                            );
                                          }}
                                          placeholder="Set cap"
                                          style={{
                                            border: "none",
                                            boxShadow: "none",
                                          }}
                                          value={budgetCapInput}
                                        />
                                      </div>
                                    </div>
                                    {isDirty ? (
                                      <Button
                                        disabled={budgetCapSaving}
                                        onClick={() => {
                                          void saveBudgetCap();
                                        }}
                                        type="button"
                                        variant="secondary"
                                      >
                                        {budgetCapSaving ? "Saving..." : "Save"}
                                      </Button>
                                    ) : null}
                                  </div>
                                );
                              })()}
                            </span>
                            {sessionUserRole !== "owner" ? (
                              <span
                                className="dashboard-plan-text-tooltip-panel dashboard-plan-text-tooltip-panel--auto"
                                role="tooltip"
                              >
                                Only account owner can change
                              </span>
                            ) : null}
                          </span>
                        </div>

                        {usageData.additionalCreditRate !== null ? (
                          <p
                            className="muted"
                            style={{
                              margin: 0,
                              maxWidth: 720,
                              fontSize: 12,
                              lineHeight: 1.5,
                            }}
                          >
                            Based on your plan, additional credits are charged
                            at{" "}
                            {new Intl.NumberFormat("en-US", {
                              style: "currency",
                              currency: "USD",
                            }).format(usageData.additionalCreditRate)}{" "}
                            per credit.
                            {usageData.budgetCap !== null &&
                            usageData.additionalCreditLimit !== null &&
                            usageData.totalCreditLimit !== null ? (
                              <>
                                {" "}
                                With a budget cap of{" "}
                                {new Intl.NumberFormat("en-US", {
                                  style: "currency",
                                  currency: "USD",
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0,
                                }).format(usageData.budgetCap)}
                                , that means you can consume an additional{" "}
                                {new Intl.NumberFormat("en-US").format(
                                  usageData.additionalCreditLimit,
                                )}{" "}
                                credits. With your plan allowance, that totals{" "}
                                {new Intl.NumberFormat("en-US").format(
                                  usageData.totalCreditLimit,
                                )}{" "}
                                credits in a month.
                              </>
                            ) : null}
                          </p>
                        ) : null}
                      </div>
                    </section>
                    <section
                      aria-label="Fallback URL"
                      className="card stack dashboard-details-card"
                    >
                      <h2 className="page-title">Fallback URL</h2>
                      <p className="muted">
                        The link you want your Feedchat to redirect to if you
                        run out of credits.
                      </p>
                      <span className="dashboard-plan-text-tooltip">
                        <span
                          aria-label={
                            sessionUserRole === "owner"
                              ? ""
                              : "Only account owner can change"
                          }
                          className={
                            sessionUserRole === "owner"
                              ? ""
                              : "dashboard-plan-text-tooltip-trigger dashboard-plan-inline-tooltip-trigger dashboard-plan-text-tooltip-trigger--no-underline"
                          }
                          tabIndex={sessionUserRole === "owner" ? -1 : 0}
                          style={{ display: "block" }}
                        >
                          {(() => {
                            const normalizedInput =
                              normalizeOrgFallbackUrl(fallbackUrlInput);
                            const normalizedInitial =
                              normalizeOrgFallbackUrl(initialFallbackUrl);
                            const isOwner = sessionUserRole === "owner";
                            const isDirty =
                              isOwner && normalizedInput !== normalizedInitial;

                            return (
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    flex: 1,
                                    maxWidth: 480,
                                  }}
                                >
                                  <Input
                                    aria-label="Fallback URL"
                                    disabled={
                                      sessionUserRole !== "owner" ||
                                      fallbackUrlSaving
                                    }
                                    onChange={(event) =>
                                      setFallbackUrlInput(event.target.value)
                                    }
                                    placeholder="Fallback URL"
                                    type="url"
                                    value={fallbackUrlInput}
                                  />
                                </div>
                                {isDirty ? (
                                  <Button
                                    disabled={fallbackUrlSaving}
                                    onClick={() => {
                                      void saveFallbackUrl();
                                    }}
                                    type="button"
                                    variant="secondary"
                                  >
                                    {fallbackUrlSaving ? "Saving..." : "Save"}
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })()}
                        </span>
                        {sessionUserRole !== "owner" ? (
                          <span
                            className="dashboard-plan-text-tooltip-panel dashboard-plan-text-tooltip-panel--auto"
                            role="tooltip"
                          >
                            Only account owner can change
                          </span>
                        ) : null}
                      </span>
                    </section>
                  </>
                ) : null}
              </div>
            ) : null}
            {dashboardTab === "insights" ? (
              <>
                <h1 className="page-title">Overview</h1>
                {insightsError ? (
                  <p className="auth-error">{insightsError}</p>
                ) : null}
                {insightsLoading ? <OverviewInsightsSkeleton /> : null}
                {!insightsLoading && !insightsError && insightsData ? (
                  <div className="dashboard-overview-insights-stack">
                    <div className="dashboard-insights-grid">
                      <section
                        className="dashboard-metric-card"
                        aria-label="Average sentiment"
                      >
                        <p className="dashboard-metric-label">
                          Average sentiment
                        </p>
                        <p className="dashboard-metric-value">
                          {(insightsData.sentimentAverageTotal ?? 0).toFixed(2)}
                        </p>
                        <MonthlyLineChart
                          series={insightsData.sentimentAverage ?? {}}
                          valueFormatter={(value) =>
                            (Number.isFinite(value) ? value : 0).toFixed(2)
                          }
                          yDomain={{ min: -1, max: 1 }}
                        />
                      </section>

                      <section
                        className="dashboard-metric-card"
                        aria-label="Total conversations"
                      >
                        <p className="dashboard-metric-label">
                          Total conversations
                        </p>
                        <p className="dashboard-metric-value">
                          {insightsData.chatCountTotal ?? 0}
                        </p>
                        <MonthlyLineChart
                          chartType="bar"
                          colorClassName="is-secondary"
                          series={insightsData.chatCount ?? {}}
                          valueFormatter={(value) =>
                            String(
                              Math.round(Number.isFinite(value) ? value : 0),
                            )
                          }
                        />
                      </section>
                    </div>
                    <section
                      aria-label="Smart summary"
                      className={
                        smartSummaryLongContent === true
                          ? "dashboard-smart-summary-card dashboard-smart-summary-card--has-expand-toggle"
                          : "dashboard-smart-summary-card"
                      }
                    >
                      <div className="dashboard-smart-summary-header">
                        <SparklesIcon
                          aria-hidden="true"
                          className="dashboard-smart-summary-heading-icon"
                        />
                        <p className="dashboard-metric-label">Smart summary</p>
                      </div>
                      {overviewSummaryMarkdown ? (
                        <>
                          <div className="dashboard-smart-summary-expandable">
                            <div
                              className={
                                smartSummaryLongContent === true &&
                                !smartSummaryExpanded
                                  ? "dashboard-smart-summary-markdown dashboard-smart-summary-markdown--clamped"
                                  : "dashboard-smart-summary-markdown"
                              }
                              id="dashboard-smart-summary-markdown"
                              ref={smartSummaryMarkdownBodyRef}
                            >
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {stripBoldFromMarkdown(overviewSummaryMarkdown)}
                              </ReactMarkdown>
                            </div>
                          </div>
                          {(smartSummaryLongContent !== true ||
                            smartSummaryExpanded) && (
                            <div className="dashboard-smart-summary-footer">
                              <span className="dashboard-smart-summary-copy-wrap">
                                {smartSummaryCopyStatus === "success" ? (
                                  <span
                                    className="dashboard-recharts-tooltip dashboard-smart-summary-copy-tooltip"
                                    role="status"
                                  >
                                    Copied to clipboard
                                  </span>
                                ) : null}
                                <button
                                  className="dashboard-smart-summary-action-btn"
                                  onClick={() =>
                                    void copySmartSummaryToClipboard()
                                  }
                                  type="button"
                                >
                                  <ClipboardDocumentIcon
                                    aria-hidden="true"
                                    className="dashboard-smart-summary-action-btn-icon"
                                  />
                                  Copy
                                </button>
                              </span>
                              <button
                                className="dashboard-smart-summary-action-btn"
                                onClick={() => setDashboardTab("conversations")}
                                type="button"
                              >
                                <ChatBubbleBottomCenterTextIcon
                                  aria-hidden="true"
                                  className="dashboard-smart-summary-action-btn-icon"
                                />
                                View insights
                              </button>
                            </div>
                          )}
                          {smartSummaryLongContent === true &&
                          !smartSummaryExpanded ? (
                            <div
                              aria-hidden="true"
                              className="dashboard-smart-summary-fade-overlay"
                            />
                          ) : null}
                          {smartSummaryLongContent === true ? (
                            <div className="dashboard-smart-summary-expand-toggle-row">
                              <button
                                aria-controls="dashboard-smart-summary-markdown"
                                aria-expanded={smartSummaryExpanded}
                                className="dashboard-recharts-tooltip dashboard-smart-summary-expand-toggle"
                                onClick={() =>
                                  setSmartSummaryExpanded((prev) => !prev)
                                }
                                type="button"
                              >
                                {smartSummaryExpanded ? (
                                  <>
                                    Less
                                    <ChevronUpIcon
                                      aria-hidden="true"
                                      className="dashboard-smart-summary-expand-toggle-icon"
                                    />
                                  </>
                                ) : (
                                  <>
                                    More
                                    <ChevronDownIcon
                                      aria-hidden="true"
                                      className="dashboard-smart-summary-expand-toggle-icon"
                                    />
                                  </>
                                )}
                              </button>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <p className="dashboard-smart-summary-placeholder muted">
                          An overview of key insights will be updated here every
                          day, based on real user feedback.
                        </p>
                      )}
                    </section>
                    {showOverviewDelayedEntriesHint ? (
                      <DelayedEntriesHint className="dashboard-delayed-entries-hint--overview" />
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
            {!sessionLoading && dashboardTab === "conversations" ? (
              <>
                <div className="dashboard-insights-header">
                  <h1 className="page-title">Feedback</h1>
                  {analysisData &&
                  !analysisHasMore &&
                  !analysisLoading &&
                  !analysisError ? (
                    <div className="dashboard-feedback-export-menu">
                      <button
                        aria-haspopup="menu"
                        aria-label="Export options"
                        className="dashboard-feedback-export-menu-trigger"
                        type="button"
                      >
                        {analysisExportStatus === "processing" ? (
                          <ArrowPathIcon
                            aria-hidden="true"
                            className="dashboard-nav-icon dashboard-conversation-modal-icon-spin"
                          />
                        ) : (
                          <ArrowDownTrayIcon
                            aria-hidden="true"
                            className="dashboard-nav-icon"
                          />
                        )}
                      </button>
                      <div
                        className="dashboard-feedback-export-menu-panel"
                        role="menu"
                      >
                        <Button
                          className="dashboard-insights-export-button dashboard-feedback-export-menu-item"
                          disabled={analysisExportStatus === "processing"}
                          onClick={() => {
                            void exportAnalysisToCsv();
                          }}
                          role="menuitem"
                          type="button"
                          variant="secondary"
                        >
                          {analysisExportStatus === "processing" ? (
                            <ArrowPathIcon
                              aria-hidden="true"
                              className="dashboard-nav-icon dashboard-conversation-modal-icon-spin"
                            />
                          ) : (
                            <TableCellsIcon
                              aria-hidden="true"
                              className="dashboard-nav-icon"
                            />
                          )}
                          {analysisExportStatus === "processing"
                            ? "Exporting all to CSV"
                            : "Export all to CSV"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="dashboard-feedback-split">
                  <div className="dashboard-feedback-results-shell">
                    <div className="dashboard-feedback-results-toolbar">
                      <Input
                        aria-label="Search insights"
                        className="dashboard-conversations-search-input dashboard-feedback-search-input"
                        disabled={addTagSubmitting}
                        onChange={(event) =>
                          setAnalysisSearchQuery(event.target.value)
                        }
                        placeholder="Search date, summary, or sentiment score"
                        value={analysisSearchQuery}
                      />
                      <div className="dashboard-feedback-sort-wrap">
                        <BarsArrowDownIcon
                          aria-hidden="true"
                          className="dashboard-feedback-sort-icon"
                        />
                        <select
                          aria-label="Sort insights"
                          className="fc-input dashboard-feedback-sort-select"
                          disabled={addTagSubmitting}
                          onChange={(event) =>
                            setAnalysisSort(
                              event.target.value as
                                | "newest"
                                | "oldest"
                                | "best_sentiment"
                                | "worst_sentiment",
                            )
                          }
                          value={analysisSort}
                        >
                          <option value="newest">Newest First</option>
                          <option value="oldest">Oldest First</option>
                          <option value="best_sentiment">Best Sentiment</option>
                          <option value="worst_sentiment">
                            Worst Sentiment
                          </option>
                        </select>
                      </div>
                    </div>
                    {!analysisError ? (
                      <div
                        aria-label="Filter by tag"
                        className="dashboard-feedback-tag-filter-row"
                        role="tablist"
                      >
                        <button
                          className={`dashboard-feedback-tag-filter-chip${
                            analysisTagFilter === "all" ? " is-selected" : ""
                          }`}
                          disabled={addTagSubmitting}
                          onClick={() => setAnalysisTagFilter("all")}
                          role="tab"
                          type="button"
                          aria-selected={analysisTagFilter === "all"}
                        >
                          All
                        </button>
                        {deferredUniqueAnalysisTags.map((tag) => (
                          <button
                            key={tag}
                            className={`dashboard-feedback-tag-filter-chip${
                              analysisTagFilter === tag ? " is-selected" : ""
                            }`}
                            disabled={addTagSubmitting}
                            onClick={() => setAnalysisTagFilter(tag)}
                            role="tab"
                            type="button"
                            aria-selected={analysisTagFilter === tag}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {analysisError ? (
                      <p className="auth-error">{analysisError}</p>
                    ) : null}
                    {analysisExportError ? (
                      <p className="auth-error">{analysisExportError}</p>
                    ) : null}
                    {(() => {
                      const normalizedQuery = analysisSearchQuery
                        .trim()
                        .toLowerCase();
                      const chats = analysisData?.chats ?? [];
                      const isAnalysisEmpty =
                        !!analysisData &&
                        !analysisLoading &&
                        !analysisError &&
                        chats.length === 0;
                      const effectiveChats = isAnalysisEmpty
                        ? [analysisEmptyPlaceholderChat]
                        : chats;
                      const tagFiltered =
                        analysisTagFilter === "all"
                          ? effectiveChats
                          : effectiveChats.filter((chat) =>
                              chatHasTag(chat.tags, analysisTagFilter),
                            );
                      const filteredChats = normalizedQuery
                        ? tagFiltered.filter((chat) => {
                            const dateLabel = formatDashboardDate(
                              chat.dateTime,
                            );
                            const sentimentLabel =
                              typeof chat.sentimentScore === "number"
                                ? formatSentimentScore(chat.sentimentScore)
                                : String(chat.sentimentScore);
                            const tagStr = chatTagValues(chat.tags).join(" ");
                            const haystack = [
                              chat.dateTime,
                              dateLabel,
                              chat.summary,
                              sentimentLabel,
                              tagStr,
                            ]
                              .join(" ")
                              .toLowerCase();
                            return haystack.includes(normalizedQuery);
                          })
                        : tagFiltered;

                      const sentimentValue = (value: unknown) => {
                        if (typeof value === "number") return value;
                        if (typeof value === "string") {
                          const parsed = Number(value);
                          return Number.isFinite(parsed) ? parsed : 0;
                        }
                        return 0;
                      };

                      const sortedChats = [...filteredChats].sort((a, b) => {
                        if (analysisSort === "oldest") {
                          return (
                            new Date(a.dateTime).getTime() -
                            new Date(b.dateTime).getTime()
                          );
                        }
                        if (analysisSort === "best_sentiment") {
                          return (
                            sentimentValue(b.sentimentScore) -
                            sentimentValue(a.sentimentScore)
                          );
                        }
                        if (analysisSort === "worst_sentiment") {
                          return (
                            sentimentValue(a.sentimentScore) -
                            sentimentValue(b.sentimentScore)
                          );
                        }
                        return (
                          new Date(b.dateTime).getTime() -
                          new Date(a.dateTime).getTime()
                        );
                      });

                      const showInitialFeedbackSkeleton =
                        analysisLoading &&
                        analysisRequestCursor === undefined &&
                        !analysisError &&
                        (!analysisData || analysisData.chats.length === 0);

                      return (
                        <>
                          {!analysisLoading &&
                          !analysisError &&
                          analysisData &&
                          sortedChats.length === 0 &&
                          chats.length > 0 ? (
                            <p className="muted">
                              {analysisTagFilter !== "all" &&
                              tagFiltered.length === 0
                                ? "No conversations with this tag."
                                : "Nothing matches search."}
                            </p>
                          ) : null}
                          {showInitialFeedbackSkeleton ? (
                            <FeedbackInsightListSkeleton />
                          ) : (
                            <ul className="dashboard-insights-list dashboard-conversations-scroll-list">
                              {sortedChats.map((chat) => (
                                <li
                                  className="dashboard-insight-card-wrap"
                                  key={chat.chatId}
                                >
                                  <button
                                    className={`dashboard-insight-card dashboard-insight-card--selectable${
                                      selectedChatId === chat.chatId
                                        ? " is-selected"
                                        : ""
                                    }`}
                                    disabled={addTagSubmitting}
                                    onClick={() =>
                                      setSelectedChatId(chat.chatId)
                                    }
                                    type="button"
                                  >
                                    {selectedChatId === chat.chatId ? (
                                      <>
                                        <SelectedInsightMetaRow
                                          dateTime={chat.dateTime}
                                          sentimentScore={chat.sentimentScore}
                                        />
                                        <p className="dashboard-insight-summary">
                                          {chat.summary}
                                        </p>
                                      </>
                                    ) : (
                                      <>
                                        <div className="dashboard-insight-meta">
                                          <time
                                            className="dashboard-insight-date"
                                            dateTime={chat.dateTime}
                                          >
                                            {formatDashboardDate(chat.dateTime)}
                                          </time>
                                          <span className="dashboard-insight-score">
                                            <SparklesIcon
                                              aria-hidden="true"
                                              className="dashboard-insight-score-icon"
                                            />
                                            Sentiment{" "}
                                            {typeof chat.sentimentScore ===
                                            "number"
                                              ? formatSentimentScore(
                                                  chat.sentimentScore,
                                                )
                                              : String(chat.sentimentScore)}
                                          </span>
                                        </div>
                                        <p className="dashboard-insight-summary">
                                          {chat.summary}
                                        </p>
                                      </>
                                    )}
                                  </button>
                                </li>
                              ))}
                              {showFeedbackDelayedEntriesHint ? (
                                <li
                                  className="dashboard-insight-list-delayed-hint-item"
                                  key="__feedback-delayed-entries-hint__"
                                >
                                  <DelayedEntriesHint className="dashboard-delayed-entries-hint--feedback" />
                                </li>
                              ) : null}
                            </ul>
                          )}
                          {analysisLoading && filteredChats.length > 0 ? (
                            <InsightsListLoadingEllipsis />
                          ) : null}
                          {analysisData && analysisHasMore && !analysisError ? (
                            <div
                              aria-hidden="true"
                              ref={analysisLoadMoreRef}
                              style={{ height: "1px" }}
                            />
                          ) : null}
                        </>
                      );
                    })()}
                  </div>

                  {isDesktop ? (
                    <div className="dashboard-feedback-conversation-shell">
                      {conversationCopyStatus === "success" ||
                      userIdCopyStatus === "success" ? (
                        <span
                          className="dashboard-recharts-tooltip dashboard-conversation-modal-copy-tooltip"
                          role="status"
                        >
                          {userIdCopyStatus === "success"
                            ? "User ID copied to clipboard"
                            : "Screenshot copied"}
                        </span>
                      ) : null}
                      <section
                        aria-label="Conversation"
                        className="dashboard-feedback-conversation-panel"
                      >
                        <div className="dashboard-conversation-modal-header">
                          <div>
                            <h2 className="dashboard-subsection-title">
                              Conversation
                            </h2>
                            {selectedChatId &&
                            conversationDetail?.userId !== null &&
                            conversationDetail?.userId !== undefined ? (
                              <div className="dashboard-feedback-userid-wrap">
                                <p className="muted">
                                  User ID:{" "}
                                  <button
                                    type="button"
                                    className="dashboard-conversation-userid-copy-btn"
                                    onClick={() =>
                                      void copyUserIdToClipboard(
                                        conversationDetail.userId!,
                                      )
                                    }
                                  >
                                    {conversationDetail.userId}
                                  </button>
                                </p>
                              </div>
                            ) : null}
                          </div>
                          <div className="dashboard-conversation-modal-actions">
                            {selectedChatId ? (
                              <button
                                aria-label="Close conversation"
                                className="dashboard-conversation-modal-icon-btn"
                                disabled={addTagSubmitting}
                                onClick={() => setSelectedChatId(null)}
                                type="button"
                              >
                                <XMarkIcon
                                  aria-hidden="true"
                                  className="dashboard-nav-icon"
                                />
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {selectedChatId && selectedAnalysisChat ? (
                          <SelectedInsightMetaRow
                            dateTime={selectedAnalysisChat.dateTime}
                            sentimentScore={selectedAnalysisChat.sentimentScore}
                          />
                        ) : null}
                        <div className="dashboard-conversation-modal-body">
                          {!selectedChatId ? (
                            <p className="muted">
                              Select an insight to view the conversation.
                            </p>
                          ) : null}
                          {selectedChatId && conversationDetailLoading ? (
                            <p className="muted">Loading conversation…</p>
                          ) : null}
                          {selectedChatId && conversationDetailError ? (
                            <p className="auth-error">
                              {conversationDetailError}
                            </p>
                          ) : null}
                          {selectedChatId &&
                          !conversationDetailLoading &&
                          !conversationDetailError &&
                          conversationDetail &&
                          (conversationDetail.index?.length ?? 0) > 0 ? (
                            <div
                              ref={conversationThreadRef}
                              className="dashboard-conversation-thread"
                            >
                              {(conversationDetail.index ?? []).map(
                                (turn, turnIdx) => (
                                  <Fragment
                                    key={`${conversationDetail.chatId}-${turnIdx}`}
                                  >
                                    <FeedbackConversationTurnMarkdown
                                      content={turn.user}
                                      role="user"
                                    />
                                    <FeedbackConversationTurnMarkdown
                                      content={turn.assistant}
                                      role="assistant"
                                    />
                                  </Fragment>
                                ),
                              )}
                            </div>
                          ) : null}
                          {selectedChatId &&
                          !conversationDetailLoading &&
                          !conversationDetailError &&
                          conversationDetail &&
                          (conversationDetail.index?.length ?? 0) === 0 ? (
                            <p className="muted">
                              No messages in this conversation.
                            </p>
                          ) : null}
                        </div>
                        {selectedChatId ? (
                          <FeedbackConversationActionBar
                            addTagError={addTagError}
                            addTagInlineOpen={addTagInlineOpen}
                            addTagInput={addTagInput}
                            addTagSubmitting={addTagSubmitting}
                            addTagsDisabled={
                              selectedChatId ===
                                ANALYSIS_EMPTY_PLACEHOLDER_CHAT_ID &&
                              (analysisData?.chats?.length ?? 0) === 0
                            }
                            conversationCopyStatus={conversationCopyStatus}
                            conversationDetail={conversationDetail}
                            conversationDetailLoading={
                              conversationDetailLoading
                            }
                            insightTitle={selectedAnalysisChat?.summary ?? ""}
                            onAddTagInputChange={setAddTagInput}
                            onAddTagsClick={() => {
                              if (addTagSubmitting) return;
                              setAddTagError(null);
                              setAddTagInlineOpen((open) => {
                                if (open) setAddTagInput("");
                                return !open;
                              });
                            }}
                            onRemoveTag={(tag) => {
                              if (selectedChatId) {
                                void removeTagFromChat(selectedChatId, tag);
                              }
                            }}
                            onScreenshotChat={copyConversationThreadToClipboard}
                            onSubmitAddTag={() => void submitAddChatTag()}
                            tagRemoveBusy={tagRemoveBusy}
                            tags={selectedAnalysisChat?.tags}
                          />
                        ) : null}
                      </section>
                    </div>
                  ) : null}
                </div>

                {!isDesktop && selectedChatId ? (
                  <div
                    className="dashboard-conversation-modal-overlay"
                    onClick={() => setSelectedChatId(null)}
                    role="presentation"
                  >
                    <div className="dashboard-conversation-modal-shell">
                      {conversationCopyStatus === "success" ||
                      userIdCopyStatus === "success" ? (
                        <span
                          className="dashboard-recharts-tooltip dashboard-conversation-modal-copy-tooltip"
                          role="status"
                        >
                          {userIdCopyStatus === "success"
                            ? "User ID copied to clipboard"
                            : "Screenshot copied"}
                        </span>
                      ) : null}
                      <section
                        aria-label="Conversation"
                        className="dashboard-conversation-modal"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="dashboard-conversation-modal-header">
                          <div>
                            <h2 className="dashboard-subsection-title">
                              Conversation
                            </h2>
                            {conversationDetail?.userId !== null &&
                            conversationDetail?.userId !== undefined ? (
                              <p className="muted">
                                User ID:{" "}
                                <button
                                  type="button"
                                  className="dashboard-conversation-userid-copy-btn"
                                  onClick={() =>
                                    void copyUserIdToClipboard(
                                      conversationDetail.userId!,
                                    )
                                  }
                                >
                                  {conversationDetail.userId}
                                </button>
                              </p>
                            ) : null}
                          </div>
                          <div className="dashboard-conversation-modal-actions">
                            <button
                              aria-label="Close conversation"
                              className="dashboard-conversation-modal-icon-btn"
                              disabled={addTagSubmitting}
                              onClick={() => setSelectedChatId(null)}
                              type="button"
                            >
                              <XMarkIcon
                                aria-hidden="true"
                                className="dashboard-nav-icon"
                              />
                            </button>
                          </div>
                        </div>
                        {selectedAnalysisChat ? (
                          <SelectedInsightMetaRow
                            dateTime={selectedAnalysisChat.dateTime}
                            sentimentScore={selectedAnalysisChat.sentimentScore}
                          />
                        ) : null}
                        <div className="dashboard-conversation-modal-body">
                          {conversationDetailLoading ? (
                            <p className="muted">Loading conversation…</p>
                          ) : null}
                          {conversationDetailError ? (
                            <p className="auth-error">
                              {conversationDetailError}
                            </p>
                          ) : null}
                          {!conversationDetailLoading &&
                          !conversationDetailError &&
                          conversationDetail &&
                          (conversationDetail.index?.length ?? 0) > 0 ? (
                            <div
                              ref={conversationThreadRef}
                              className="dashboard-conversation-thread"
                            >
                              {(conversationDetail.index ?? []).map(
                                (turn, turnIdx) => (
                                  <Fragment
                                    key={`${conversationDetail.chatId}-${turnIdx}`}
                                  >
                                    <FeedbackConversationTurnMarkdown
                                      content={turn.user}
                                      role="user"
                                    />
                                    <FeedbackConversationTurnMarkdown
                                      content={turn.assistant}
                                      role="assistant"
                                    />
                                  </Fragment>
                                ),
                              )}
                            </div>
                          ) : null}
                          {!conversationDetailLoading &&
                          !conversationDetailError &&
                          conversationDetail &&
                          (conversationDetail.index?.length ?? 0) === 0 ? (
                            <p className="muted">
                              No messages in this conversation.
                            </p>
                          ) : null}
                        </div>
                        {selectedChatId ? (
                          <FeedbackConversationActionBar
                            addTagError={addTagError}
                            addTagInlineOpen={addTagInlineOpen}
                            addTagInput={addTagInput}
                            addTagSubmitting={addTagSubmitting}
                            addTagsDisabled={
                              selectedChatId ===
                                ANALYSIS_EMPTY_PLACEHOLDER_CHAT_ID &&
                              (analysisData?.chats?.length ?? 0) === 0
                            }
                            conversationCopyStatus={conversationCopyStatus}
                            conversationDetail={conversationDetail}
                            conversationDetailLoading={
                              conversationDetailLoading
                            }
                            insightTitle={selectedAnalysisChat?.summary ?? ""}
                            onAddTagInputChange={setAddTagInput}
                            onAddTagsClick={() => {
                              if (addTagSubmitting) return;
                              setAddTagError(null);
                              setAddTagInlineOpen((open) => {
                                if (open) setAddTagInput("");
                                return !open;
                              });
                            }}
                            onRemoveTag={(tag) => {
                              if (selectedChatId) {
                                void removeTagFromChat(selectedChatId, tag);
                              }
                            }}
                            onScreenshotChat={copyConversationThreadToClipboard}
                            onSubmitAddTag={() => void submitAddChatTag()}
                            tagRemoveBusy={tagRemoveBusy}
                            tags={selectedAnalysisChat?.tags}
                          />
                        ) : null}
                      </section>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}
            {!sessionLoading && dashboardTab === "team" ? (
              <>
                <h1 className="page-title">Team</h1>
                <p className="muted">
                  {canManageTeam
                    ? "Add team members for free."
                    : "Only account owners can manage members."}
                </p>
                <section
                  aria-label="Team members"
                  className="card stack dashboard-details-card dashboard-team-card"
                >
                  <div className="dashboard-team-table">
                    <div
                      aria-hidden="true"
                      className="dashboard-team-table-header"
                    >
                      <span>Email</span>
                      <span>Role</span>
                      <span>Action</span>
                    </div>
                    <ul className="dashboard-team-list">
                      {teamMembers.map((member) => {
                        const isOwner = member.role === "owner";
                        const isRemoving = teamRemovingEmail === member.email;
                        return (
                          <li
                            className={`dashboard-team-item${
                              isOwner ? " dashboard-team-item-owner" : ""
                            }`}
                            key={`${member.email}-${member.role}`}
                          >
                            <span className="dashboard-team-cell-label">
                              Email
                            </span>
                            <span className="dashboard-team-cell-value">
                              {member.email}
                            </span>
                            <span className="dashboard-team-cell-label">
                              Role
                            </span>
                            <span className="dashboard-team-cell-value dashboard-team-role">
                              {formatRoleLabel(member.role)}
                            </span>
                            {!isOwner ? (
                              <span className="dashboard-team-cell-label">
                                Action
                              </span>
                            ) : null}
                            <span className="dashboard-team-cell-value">
                              {!isOwner ? (
                                <Button
                                  className="dashboard-team-action-btn"
                                  disabled={
                                    teamAddSubmitting ||
                                    isRemoving ||
                                    !canManageTeam
                                  }
                                  onClick={() => {
                                    if (!canManageTeam) return;
                                    void removeTeamMember(member.email);
                                  }}
                                  type="button"
                                  variant="secondary"
                                >
                                  <TrashIcon
                                    aria-hidden="true"
                                    className="dashboard-custom-domain-remove-icon"
                                  />
                                  {isRemoving ? "Removing..." : "Remove"}
                                </Button>
                              ) : null}
                            </span>
                          </li>
                        );
                      })}
                      {canManageTeam && teamMembers.length < 50 ? (
                        <li className="dashboard-team-item dashboard-team-item-add">
                          <span className="dashboard-team-cell-label">
                            Email
                          </span>
                          <span className="dashboard-team-cell-value">
                            <Input
                              aria-label="Add member email"
                              autoCapitalize="none"
                              autoComplete="email"
                              disabled={teamAddSubmitting || teamLoading}
                              onChange={(event) =>
                                setTeamAddEmail(event.target.value)
                              }
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  void addTeamMember();
                                }
                              }}
                              placeholder="name@company.com"
                              spellCheck={false}
                              type="email"
                              value={teamAddEmail}
                            />
                          </span>
                          <span className="dashboard-team-cell-label">
                            Role
                          </span>
                          <span className="dashboard-team-cell-value dashboard-team-role">
                            Viewer
                          </span>
                          <span className="dashboard-team-cell-label">
                            Action
                          </span>
                          <span className="dashboard-team-cell-value">
                            <Button
                              className="dashboard-team-action-btn"
                              disabled={
                                teamAddSubmitting ||
                                teamLoading ||
                                !isValidEmail(teamAddEmail)
                              }
                              onClick={() => {
                                void addTeamMember();
                              }}
                              type="button"
                              variant="secondary"
                            >
                              <EnvelopeOpenIcon
                                aria-hidden="true"
                                className="dashboard-custom-domain-remove-icon"
                              />
                              {teamAddSubmitting ? "Inviting..." : "Invite"}
                            </Button>
                          </span>
                        </li>
                      ) : null}
                    </ul>
                  </div>
                </section>
              </>
            ) : null}
            {false ? (
              <>
                {(() => {
                  const previewDark = colorPalette === "dark";
                  const previewAccent = accentColorPresentOnOrg
                    ? accentColor.trim()
                    : "#0A80FE";
                  const userMsgColor = accentColorPresentOnOrg
                    ? pickAccessibleTextOnBackground(previewAccent)
                    : "#ffffff";
                  const sendButtonBg = accentColorPresentOnOrg
                    ? previewAccent
                    : previewDark
                      ? "#ffffff"
                      : "#111111";
                  const sendIconColor =
                    pickAccessibleTextOnBackground(sendButtonBg);
                  const websiteTrim = website.trim();
                  const supportTrim = supportLink.trim();

                  return (
                    <div className="dashboard-appearance-layout">
                      <div className="dashboard-appearance-left stack">
                        <section
                          className="card stack dashboard-details-card"
                          aria-label="Profile pic"
                        >
                          <h2 className="page-title">Profile pic</h2>
                          <p className="muted">Brand your chat profile.</p>
                          {profilePicLoading ? (
                            <p className="muted">Loading profile pic…</p>
                          ) : null}
                          <div className="stack">
                            <label
                              htmlFor="profile-pic-upload-input"
                              style={{
                                alignItems: "center",
                                background: "#ffffff",
                                border: profilePicUrl
                                  ? "1px solid #111111"
                                  : "1px dashed #d4d4d4",
                                borderRadius: "9999px",
                                cursor: profilePicSaving
                                  ? "not-allowed"
                                  : "pointer",
                                display: "flex",
                                height: "48px",
                                justifyContent: "center",
                                overflow: "hidden",
                                position: "relative",
                                width: "48px",
                                opacity: profilePicSaving ? 0.7 : 1,
                              }}
                            >
                              {profilePicUrl ? (
                                <img
                                  alt="Profile pic"
                                  src={profilePicUrl ?? undefined}
                                  style={{
                                    height: "100%",
                                    left: 0,
                                    objectFit: "cover",
                                    position: "absolute",
                                    top: 0,
                                    width: "100%",
                                  }}
                                />
                              ) : (
                                <UserIcon
                                  aria-hidden="true"
                                  className="dashboard-profile-pic-placeholder-icon"
                                />
                              )}
                            </label>
                            <input
                              accept=".png,.jpg,.jpeg,.webp"
                              disabled={profilePicSaving}
                              id="profile-pic-upload-input"
                              onChange={(event) => {
                                const file = event.target.files?.[0] ?? null;
                                void handleProfilePicSelection(file);
                                event.currentTarget.value = "";
                              }}
                              style={{ display: "none" }}
                              type="file"
                            />
                            {profilePicSaving ? (
                              <p className="muted">Uploading…</p>
                            ) : null}
                            {profilePicError ? (
                              <p className="auth-error">{profilePicError}</p>
                            ) : null}
                          </div>
                        </section>
                        <section
                          className="card stack dashboard-details-card"
                          aria-label="Company name"
                        >
                          <h2 className="page-title">Company Name</h2>
                          <p className="muted">Tell users who you are.</p>
                          <form
                            className="stack"
                            onSubmit={(event) => event.preventDefault()}
                          >
                            <div>
                              <h3 className="dashboard-details-heading">
                                Brand Name
                              </h3>
                              <div className="dashboard-details-input-row">
                                <Input
                                  aria-label="Brand name"
                                  autoCapitalize="words"
                                  autoComplete="organization"
                                  disabled={brandNameSaving}
                                  onChange={(event) =>
                                    setBrandName(event.target.value)
                                  }
                                  placeholder="Your company or product name"
                                  spellCheck={true}
                                  type="text"
                                  value={brandName}
                                />
                                {brandName.trim() !==
                                  initialBrandName.trim() && (
                                  <Button
                                    className="dashboard-details-save-btn"
                                    disabled={brandNameSaving}
                                    onClick={() => {
                                      void saveBrandName();
                                    }}
                                    type="button"
                                  >
                                    {brandNameSaving ? "Saving…" : "Save"}
                                  </Button>
                                )}
                              </div>
                              {brandNameError ? (
                                <p className="auth-error">{brandNameError}</p>
                              ) : null}
                            </div>
                          </form>
                        </section>
                        <section
                          className="card stack dashboard-details-card"
                          aria-label="Links"
                        >
                          <h2 className="page-title">Links</h2>
                          <p className="muted">
                            Add useful links to your chat app.
                          </p>
                          <form
                            className="stack"
                            onSubmit={(event) => event.preventDefault()}
                          >
                            <div>
                              <h3 className="dashboard-details-heading">
                                Website
                              </h3>
                              <div className="dashboard-details-input-row">
                                <Input
                                  autoCapitalize="none"
                                  autoComplete="url"
                                  disabled={websiteSaving}
                                  onChange={(event) =>
                                    setWebsite(event.target.value)
                                  }
                                  placeholder="https://example.com/"
                                  spellCheck={false}
                                  type="url"
                                  value={website}
                                />
                                {(initialWebsite.length === 0 ||
                                  website !== initialWebsite) && (
                                  <Button
                                    className="dashboard-details-save-btn"
                                    disabled={websiteSaving}
                                    onClick={() => {
                                      void saveWebsite();
                                    }}
                                    type="button"
                                  >
                                    {websiteSaving ? "Saving…" : "Save"}
                                  </Button>
                                )}
                              </div>
                              {websiteError ? (
                                <p className="auth-error">{websiteError}</p>
                              ) : null}
                            </div>
                            <div>
                              <h3 className="dashboard-details-heading">
                                Support Link
                              </h3>
                              <div className="dashboard-details-input-row">
                                <Input
                                  autoCapitalize="none"
                                  autoComplete="url"
                                  disabled={supportLinkSaving}
                                  onChange={(event) =>
                                    setSupportLink(event.target.value)
                                  }
                                  placeholder="https://example.com/support"
                                  spellCheck={false}
                                  type="url"
                                  value={supportLink}
                                />
                                {(initialSupportLink.length === 0 ||
                                  supportLink !== initialSupportLink) && (
                                  <Button
                                    className="dashboard-details-save-btn"
                                    disabled={supportLinkSaving}
                                    onClick={() => {
                                      void saveSupportLink();
                                    }}
                                    type="button"
                                  >
                                    {supportLinkSaving ? "Saving…" : "Save"}
                                  </Button>
                                )}
                              </div>
                              {supportLinkError ? (
                                <p className="auth-error">{supportLinkError}</p>
                              ) : null}
                            </div>
                          </form>
                        </section>
                        <section
                          className="card stack dashboard-details-card"
                          aria-label="Initial message"
                        >
                          <h2 className="page-title">Initial Message</h2>
                          <p className="muted">
                            Provide a greeting or instructions to users.
                          </p>
                          <form
                            className="stack"
                            onSubmit={(event) => event.preventDefault()}
                          >
                            <div>
                              <h3 className="dashboard-details-heading">
                                Message
                              </h3>
                              <div className="dashboard-details-input-row">
                                <Input
                                  aria-label="Initial message"
                                  autoCapitalize="sentences"
                                  autoComplete="off"
                                  className="dashboard-initial-message-input"
                                  disabled={defaultMessageSaving}
                                  onChange={(event) =>
                                    setDefaultMessage(event.target.value)
                                  }
                                  placeholder={
                                    DEFAULT_INITIAL_MESSAGE_PLACEHOLDER
                                  }
                                  spellCheck={true}
                                  type="text"
                                  value={defaultMessage}
                                />
                                {defaultMessage !== initialDefaultMessage && (
                                  <Button
                                    className="dashboard-details-save-btn"
                                    disabled={defaultMessageSaving}
                                    onClick={() => {
                                      void saveDefaultMessage();
                                    }}
                                    type="button"
                                  >
                                    {defaultMessageSaving ? "Saving…" : "Save"}
                                  </Button>
                                )}
                              </div>
                              {defaultMessageError ? (
                                <p className="auth-error dashboard-initial-message-status">
                                  {defaultMessageError}
                                </p>
                              ) : null}
                            </div>
                          </form>
                        </section>
                        <section
                          className="card stack dashboard-details-card"
                          aria-label="Style"
                        >
                          <h2 className="page-title">Style</h2>
                          <p className="muted">Customize your chat UI.</p>
                          <div className="stack">
                            <div>
                              <h3 className="dashboard-details-heading">
                                Color Palette
                              </h3>
                              <div className="dashboard-style-palette-row">
                                <button
                                  aria-pressed={colorPalette === "light"}
                                  className={`dashboard-style-option-btn dashboard-style-option-btn-light${colorPalette === "light" ? " is-selected" : ""}`}
                                  disabled={colorPaletteSaving}
                                  onClick={() => {
                                    if (colorPalette !== "light") {
                                      void saveColorPalette("light");
                                    }
                                  }}
                                  type="button"
                                >
                                  <SunIcon
                                    aria-hidden="true"
                                    className="dashboard-style-option-btn-icon"
                                  />
                                  <span>Light</span>
                                </button>
                                <button
                                  aria-pressed={colorPalette === "dark"}
                                  className={`dashboard-style-option-btn dashboard-style-option-btn-dark${colorPalette === "dark" ? " is-selected" : ""}`}
                                  disabled={colorPaletteSaving}
                                  onClick={() => {
                                    if (colorPalette !== "dark") {
                                      void saveColorPalette("dark");
                                    }
                                  }}
                                  type="button"
                                >
                                  <MoonIcon
                                    aria-hidden="true"
                                    className="dashboard-style-option-btn-icon"
                                  />
                                  <span>Dark</span>
                                </button>
                              </div>
                              {colorPaletteError ? (
                                <p className="auth-error">
                                  {colorPaletteError}
                                </p>
                              ) : null}
                            </div>
                            <div>
                              <h3 className="dashboard-details-heading">
                                Accent Color
                              </h3>
                              <div className="dashboard-style-accent-row">
                                <input
                                  aria-label="Accent Color"
                                  className="dashboard-style-color-input"
                                  disabled={accentColorSaving}
                                  onChange={(event) =>
                                    setAccentColor(event.target.value)
                                  }
                                  type="color"
                                  value={accentColor}
                                />
                                <span className="dashboard-style-color-hex">
                                  {accentColor}
                                </span>
                                {accentColor !== initialAccentColor && (
                                  <Button
                                    className="dashboard-details-save-btn"
                                    disabled={accentColorSaving}
                                    onClick={() => {
                                      void saveAccentColor();
                                    }}
                                    type="button"
                                  >
                                    {accentColorSaving ? "Saving…" : "Save"}
                                  </Button>
                                )}
                              </div>
                              {accentColorError ? (
                                <p className="auth-error">{accentColorError}</p>
                              ) : null}
                            </div>
                          </div>
                        </section>
                      </div>
                      <aside
                        className="dashboard-appearance-preview"
                        aria-label="Preview"
                      >
                        <section
                          className={`card dashboard-appearance-preview-card${previewDark ? " dashboard-appearance-preview-card--dark" : ""}`}
                        >
                          <div className="dashboard-appearance-preview-header">
                            <div className="dashboard-appearance-preview-header-lead">
                              <div className="dashboard-appearance-preview-menu-wrap">
                                <button
                                  aria-expanded={appearancePreviewMenuOpen}
                                  aria-haspopup="menu"
                                  aria-label="Feedback menu"
                                  className="dashboard-appearance-preview-menu-trigger"
                                  onClick={() =>
                                    setAppearancePreviewMenuOpen(
                                      (prev) => !prev,
                                    )
                                  }
                                  type="button"
                                >
                                  <EllipsisVerticalIcon
                                    aria-hidden="true"
                                    className="dashboard-nav-icon"
                                  />
                                </button>
                                {appearancePreviewMenuOpen ? (
                                  <>
                                    <div
                                      className="dashboard-appearance-preview-menu-overlay"
                                      onClick={() =>
                                        setAppearancePreviewMenuOpen(false)
                                      }
                                      role="presentation"
                                    />
                                    <div
                                      className="dashboard-appearance-preview-menu"
                                      onClick={(event) =>
                                        event.stopPropagation()
                                      }
                                      role="menu"
                                    >
                                      <a
                                        className="dashboard-appearance-preview-menu-link"
                                        href={websiteTrim || "#"}
                                        onClick={(event) => {
                                          if (!websiteTrim)
                                            event.preventDefault();
                                          setAppearancePreviewMenuOpen(false);
                                        }}
                                        rel="noopener noreferrer"
                                        role="menuitem"
                                        target="_blank"
                                      >
                                        <ArchiveBoxXMarkIcon
                                          aria-hidden="true"
                                          className="dashboard-appearance-preview-menu-icon"
                                        />
                                        Close Feedback
                                      </a>
                                      <a
                                        className="dashboard-appearance-preview-menu-link"
                                        href={supportTrim || "#"}
                                        onClick={(event) => {
                                          if (!supportTrim)
                                            event.preventDefault();
                                          setAppearancePreviewMenuOpen(false);
                                        }}
                                        rel="noopener noreferrer"
                                        role="menuitem"
                                        target="_blank"
                                      >
                                        <DocumentMagnifyingGlassIcon
                                          aria-hidden="true"
                                          className="dashboard-appearance-preview-menu-icon"
                                        />
                                        Support
                                      </a>
                                    </div>
                                  </>
                                ) : null}
                              </div>
                              <div className="dashboard-appearance-preview-avatar">
                                {profilePicUrl ? (
                                  <img
                                    alt="Profile pic preview"
                                    src={profilePicUrl ?? undefined}
                                  />
                                ) : (
                                  <UserIcon aria-hidden="true" />
                                )}
                              </div>
                            </div>
                            <div className="dashboard-appearance-preview-title">
                              {(brandName.trim()
                                ? brandName.trim()
                                : "Your Company") + " Feedback"}
                            </div>
                          </div>
                          <div className="dashboard-appearance-preview-chat">
                            <div className="dashboard-appearance-preview-msg dashboard-appearance-preview-msg--agent">
                              {defaultMessage.trim()
                                ? defaultMessage.trim()
                                : "Hey! Any feedback to share?"}
                            </div>
                            <div
                              className="dashboard-appearance-preview-msg dashboard-appearance-preview-msg--user"
                              style={{
                                background: previewAccent,
                                color: userMsgColor,
                              }}
                            >
                              This is an example
                            </div>
                          </div>
                          <form
                            className="dashboard-appearance-preview-input-row"
                            onSubmit={(event) => event.preventDefault()}
                          >
                            <input
                              aria-label="Write a message"
                              className="dashboard-appearance-preview-input"
                              placeholder="Write a message..."
                              type="text"
                            />
                            <button
                              aria-label="Send message"
                              className="dashboard-appearance-preview-send"
                              style={{
                                background: sendButtonBg,
                                borderColor: sendButtonBg,
                                color: sendIconColor,
                              }}
                              type="submit"
                            >
                              <PaperAirplaneIcon aria-hidden="true" />
                            </button>
                          </form>
                        </section>
                      </aside>
                    </div>
                  );
                })()}
              </>
            ) : null}
          </div>
          {showDomainsPanel && !sessionLoading && orgId && existingHostname ? (
            <section
              className="card stack dashboard-details-card"
              aria-label="Custom domain"
            >
                <div className="dashboard-custom-domain-header">
                  <h2 className="page-title">Custom Domain</h2>
                  {customDomainValue ? (
                    <div className="dashboard-custom-domain-menu-wrap">
                      <button
                        aria-expanded={customDomainMenuOpen}
                        aria-haspopup="dialog"
                        aria-label="Custom domain actions"
                        className="dashboard-conversation-modal-icon-btn"
                        disabled={customDomainRemoving}
                        onClick={() => setCustomDomainMenuOpen((prev) => !prev)}
                        type="button"
                      >
                        <EllipsisVerticalIcon
                          aria-hidden="true"
                          className="dashboard-nav-icon"
                        />
                      </button>
                      {customDomainMenuOpen ? (
                        <>
                          <div
                            className="dashboard-custom-domain-menu-overlay"
                            onClick={() => setCustomDomainMenuOpen(false)}
                            role="presentation"
                          />
                          <div
                            className="dashboard-custom-domain-menu"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <Button
                              className="dashboard-custom-domain-remove-btn"
                              disabled={customDomainRemoving}
                              onClick={() => {
                                void removeCustomDomain();
                              }}
                              type="button"
                              variant="secondary"
                            >
                              <TrashIcon
                                aria-hidden="true"
                                className="dashboard-custom-domain-remove-icon"
                              />
                              {customDomainRemoving ? "Removing..." : "Remove"}
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {!customDomainValue ? (
                  <form
                    className="stack"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void addCustomDomain();
                    }}
                  >
                    <div className="dashboard-custom-domain-add-row">
                      <Input
                        autoCapitalize="none"
                        autoComplete="off"
                        disabled={customDomainSubmitting}
                        id="custom-domain-input"
                        onChange={(event) =>
                          setCustomDomainInput(event.target.value)
                        }
                        placeholder="e.g. feedback.company.com"
                        spellCheck={false}
                        value={customDomainInput}
                      />
                      <Button
                        disabled={
                          customDomainSubmitting || !customDomainInput.trim()
                        }
                        type="submit"
                      >
                        {customDomainSubmitting ? "Adding..." : "Add domain"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="stack">
                    {!customDomainVerified ? (
                      <p className="dashboard-custom-domain-readonly-value dashboard-monospace">
                        {customDomainValue}
                      </p>
                    ) : null}
                    {customDomainVerified ? (
                      <a
                        className="dashboard-app-link-card"
                        href={`https://${customDomainValue.replace(/^https?:\/\//, "")}`}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        <span className="dashboard-app-link-url">
                          {customDomainValue.replace(/^https?:\/\//, "")}
                        </span>
                        <span
                          className="dashboard-app-link-lottie"
                          aria-hidden="true"
                        >
                          <Lottie
                            animationData={liveAnimation}
                            loop
                            style={{ height: 40, width: 40 }}
                          />
                        </span>
                      </a>
                    ) : null}
                  </div>
                )}
                {customDomainError ? (
                  <p className="auth-error">{customDomainError}</p>
                ) : null}
                {customDomainSuccess ? (
                  <p className="muted">{customDomainSuccess}</p>
                ) : null}
                {!customDomainVerified && customDomainDns.length > 0 ? (
                  <div className="stack dashboard-custom-domain-dns-wrap">
                    {customDomainDnsCopyStatus === "success" ? (
                      <span
                        className="dashboard-recharts-tooltip dashboard-custom-domain-dns-copy-tooltip"
                        role="status"
                      >
                        Copied to clipboard
                      </span>
                    ) : null}
                    <p className="dashboard-field-label">DNS records to add</p>
                    <div className="dashboard-custom-domain-dns-table">
                      <div
                        aria-hidden="true"
                        className="dashboard-custom-domain-dns-table-header"
                      >
                        <span>Type</span>
                        <span>Name</span>
                        <span>Value</span>
                      </div>
                      <ul className="dashboard-custom-domain-dns-list">
                        {customDomainDns.map((record, idx) => (
                          <li
                            className="dashboard-custom-domain-dns-item"
                            key={`${record.type}-${record.name}-${idx}`}
                          >
                            <span className="dashboard-custom-domain-dns-cell-label">
                              Type
                            </span>
                            <span className="dashboard-monospace dashboard-custom-domain-dns-cell-value">
                              {record.type}
                            </span>
                            <span className="dashboard-custom-domain-dns-cell-label">
                              Name
                            </span>
                            <span className="dashboard-monospace dashboard-custom-domain-dns-cell-value">
                              {record.name}
                            </span>
                            <span className="dashboard-custom-domain-dns-cell-label">
                              Value
                            </span>
                            <span className="dashboard-monospace dashboard-custom-domain-dns-cell-value">
                              <button
                                className="dashboard-custom-domain-dns-copy-btn"
                                onClick={() => {
                                  void copyCustomDomainDnsValue(record.value);
                                }}
                                type="button"
                              >
                                {record.value}
                              </button>
                              {customDomainDnsCopyStatus === "success" &&
                              customDomainDnsCopiedValue === record.value ? (
                                <span
                                  className="dashboard-recharts-tooltip dashboard-custom-domain-dns-copy-tooltip"
                                  role="status"
                                >
                                  Copied to clipboard
                                </span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <p className="muted">
                      {`Verifying (don't refresh)${".".repeat(customDomainDnsStatusDots)}`}
                    </p>
                  </div>
                ) : !customDomainVerified && customDomainValue ? (
                  <div className="stack">
                    <p className="muted">
                      DNS verification records are not available yet. Add your
                      custom domain in your DNS provider and we will keep
                      checking.
                    </p>
                    <p className="muted">
                      {`Verifying (don't refresh)${".".repeat(customDomainDnsStatusDots)}`}
                    </p>
                  </div>
                ) : null}
              </section>
          ) : null}
          {showDomainsPanel && !sessionLoading && orgId && existingHostname ? (
            <section
              aria-label="Bot protection"
              className="card stack dashboard-details-card"
            >
              <h2 className="page-title">Bot Protection</h2>
              <p className="muted">
                We enforce IP screening and safety limits on all tiers. Need
                bespoke protection?
              </p>
              <a
                className="fc-button fc-button-primary dashboard-usage-sales-link"
                href="https://cal.com/alex-feedchat/intro"
                rel="noopener noreferrer"
                target="_blank"
              >
                <CalendarDaysIcon
                  aria-hidden="true"
                  className="dashboard-usage-sales-link-icon"
                />
                Talk to sales
              </a>
            </section>
          ) : null}
        </section>
        {dangerModalOpen && dangerModalTitle ? (
          <div
            className="dashboard-plan-modal-overlay"
            onClick={() => {
              if (dangerModalSubmitting) return;
              setDangerModalOpen(false);
              setDangerModalTitle(null);
              setDangerModalInput("");
              setDangerModalError(null);
            }}
            role="presentation"
          >
            <div className="dashboard-plan-modal-shell dashboard-danger-zone-modal-shell">
              <section
                aria-labelledby="danger-zone-modal-title"
                aria-modal="true"
                className="dashboard-plan-modal dashboard-danger-zone-modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <div className="dashboard-plan-modal-header">
                  <h2
                    className="dashboard-plan-modal-title"
                    id="danger-zone-modal-title"
                  >
                    {dangerModalTitle}
                  </h2>
                  <button
                    aria-label="Close"
                    className="dashboard-conversation-modal-icon-btn"
                    disabled={dangerModalSubmitting}
                    onClick={() => {
                      setDangerModalOpen(false);
                      setDangerModalTitle(null);
                      setDangerModalInput("");
                      setDangerModalError(null);
                    }}
                    type="button"
                  >
                    <XMarkIcon
                      aria-hidden="true"
                      className="dashboard-nav-icon"
                    />
                  </button>
                </div>
                <div className="stack dashboard-danger-zone-modal-body">
                  <p className="muted">
                    Are you sure? Type the following to confirm.
                  </p>
                  <Input
                    autoCapitalize="none"
                    autoComplete="off"
                    disabled={dangerModalSubmitting}
                    onChange={(event) =>
                      setDangerModalInput(event.target.value)
                    }
                    placeholder={dangerModalTitle}
                    spellCheck={false}
                    value={dangerModalInput}
                  />
                  {dangerModalError ? (
                    <p className="auth-error">{dangerModalError}</p>
                  ) : null}
                  <div className="dashboard-danger-zone-modal-actions">
                    <Button
                      disabled={dangerModalSubmitting}
                      onClick={() => {
                        setDangerModalOpen(false);
                        setDangerModalTitle(null);
                        setDangerModalInput("");
                        setDangerModalError(null);
                      }}
                      type="button"
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                    <Button
                      className="dashboard-danger-zone-submit"
                      disabled={
                        dangerModalSubmitting ||
                        dangerModalInput.trim() !== dangerModalTitle
                      }
                      onClick={() => {
                        const endpoint =
                          dangerModalTitle === "Delete Organization"
                            ? "/org/delete"
                            : "/org/wipe";
                        setDangerModalSubmitting(true);
                        setDangerModalError(null);
                        void withHandler(async (authInstance) => {
                          const signedInUser = authInstance.currentUser;
                          if (!signedInUser) {
                            throw new Error("You are not signed in.");
                          }
                          const token = await signedInUser.getIdToken();
                          const response = await fetch(
                            `${getFeedchatApiBase()}${endpoint}`,
                            {
                              method: "POST",
                              headers: authJsonHeaders(token),
                            },
                          );
                          if (!response.ok) {
                            const text = await response.text().catch(() => "");
                            let json: unknown = null;
                            try {
                              json = text
                                ? (JSON.parse(text) as unknown)
                                : null;
                            } catch {
                              json = null;
                            }
                            if (
                              response.status === 403 &&
                              json &&
                              typeof json === "object" &&
                              "error" in json &&
                              (json as { error?: unknown }).error ===
                                "Must be account owner to do this action."
                            ) {
                              setDangerModalError(
                                "Must be account owner to do this action.",
                              );
                              return;
                            }
                            setDangerModalError(
                              text.trim() || "Request failed.",
                            );
                            return;
                          }
                          if (dangerModalTitle === "Delete Organization") {
                            await signOut(authInstance);
                          }
                          setDangerModalOpen(false);
                          setDangerModalTitle(null);
                          setDangerModalInput("");
                          setDangerModalError(null);
                        })
                          .catch((e) => {
                            setDangerModalError(
                              e instanceof Error
                                ? e.message
                                : "Request failed.",
                            );
                          })
                          .finally(() => {
                            setDangerModalSubmitting(false);
                          });
                      }}
                      type="button"
                    >
                      {dangerModalSubmitting ? "Submitting…" : "Submit"}
                    </Button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        ) : null}
        {null}
        {showCancelledRestartSetupFloat ? (
          <div
            aria-label="Restart plan checklist"
            className="dashboard-setup-float"
            role="region"
          >
            <div className="dashboard-setup-float-panel">
              <h2 className="page-title dashboard-setup-float-title">
                Restart Plan
              </h2>
              <ul className="dashboard-setup-checklist">
                <li>
                  <button
                    aria-label="Choose plan, not completed"
                    className="dashboard-setup-checklist-btn"
                    onClick={() => {
                      void openStripePortal();
                      closeMobileMenu();
                    }}
                    type="button"
                  >
                    <span className="dashboard-setup-checklist-left">
                      <CreditCardIcon
                        aria-hidden="true"
                        className="dashboard-setup-checklist-icon"
                      />
                      <span className="dashboard-setup-checklist-label">
                        Choose plan
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="dashboard-setup-checklist-checkbox"
                    />
                  </button>
                </li>
              </ul>
            </div>
          </div>
        ) : null}
        {showPaidEmptySetupFloat ? (
          <div
            aria-label="Gather feedback checklist"
            className="dashboard-setup-float"
            role="region"
          >
            <div className="dashboard-setup-float-panel">
              <h2 className="page-title dashboard-setup-float-title">
                Gather Feedback
              </h2>
              <ul className="dashboard-setup-checklist">
                <li>
                  <button
                    aria-label={
                      setupChecklistAppearanceDone
                        ? "Choose appearance, completed"
                        : "Choose appearance, not completed"
                    }
                    className="dashboard-setup-checklist-btn"
                    onClick={() => {
                      setIsSettingsSidebarOpen(true);
                      setDashboardTab("usage");
                      closeMobileMenu();
                    }}
                    type="button"
                  >
                    <span className="dashboard-setup-checklist-left">
                      <SwatchIcon
                        aria-hidden="true"
                        className="dashboard-setup-checklist-icon"
                      />
                      <span className="dashboard-setup-checklist-label">
                        Choose appearance
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`dashboard-setup-checklist-checkbox${setupChecklistAppearanceDone ? " is-checked" : ""}`}
                    >
                      {setupChecklistAppearanceDone ? (
                        <CheckIcon className="dashboard-setup-checklist-check-icon" />
                      ) : null}
                    </span>
                  </button>
                </li>
                <li>
                  <button
                    aria-label="Share link, not completed"
                    className="dashboard-setup-checklist-btn"
                    onClick={() => {
                      setIsSettingsSidebarOpen(true);
                      setDashboardTab("usage");
                      closeMobileMenu();
                    }}
                    type="button"
                  >
                    <span className="dashboard-setup-checklist-left">
                      <LinkIcon
                        aria-hidden="true"
                        className="dashboard-setup-checklist-icon"
                      />
                      <span className="dashboard-setup-checklist-label">
                        Share link
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="dashboard-setup-checklist-checkbox"
                    />
                  </button>
                </li>
                <li
                  aria-hidden="true"
                  className="dashboard-setup-checklist-divider"
                  role="presentation"
                >
                  <div className="dashboard-setup-checklist-divider-line" />
                </li>
                <li>
                  <button
                    aria-label={
                      setupChecklistTeamDone
                        ? "Add team (optional), completed"
                        : "Add team (optional), not completed"
                    }
                    className="dashboard-setup-checklist-btn"
                    onClick={() => {
                      setIsSettingsSidebarOpen(true);
                      setDashboardTab("team");
                      closeMobileMenu();
                    }}
                    type="button"
                  >
                    <span className="dashboard-setup-checklist-left">
                      <UserGroupIcon
                        aria-hidden="true"
                        className="dashboard-setup-checklist-icon"
                      />
                      <span className="dashboard-setup-checklist-label">
                        Add team (optional)
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`dashboard-setup-checklist-checkbox${setupChecklistTeamDone ? " is-checked" : ""}`}
                    >
                      {setupChecklistTeamDone ? (
                        <CheckIcon className="dashboard-setup-checklist-check-icon" />
                      ) : null}
                    </span>
                  </button>
                </li>
              </ul>
            </div>
          </div>
        ) : null}
        {null}
      </main>
    );
  }

  if (isFinalizingSignUp) {
    return (
      <main className="page-shell page-shell--auth">
        <div className="page-auth-layout">
          <section className="page-auth-left">
            <section className="card stack">
              <div
                aria-label="Account setup progress"
                className="page-auth-setup-progress"
                role="progressbar"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={signupSetupProgress}
              >
                <div
                  className="page-auth-setup-progress-fill"
                  style={{ width: `${signupSetupProgress}%` }}
                />
              </div>
              <h1>Setting up your account...</h1>
              <p className="muted">Won't take too long.</p>
            </section>
          </section>
          <aside className="page-auth-right">
            <figure className="page-auth-quote-wrap">
              <blockquote className="page-auth-quote">
                <p>{authQuote}</p>
                <figcaption className="page-auth-quote-attribution"></figcaption>
              </blockquote>
            </figure>
          </aside>
        </div>
      </main>
    );
  }

  function goToStep(nextStep: OnboardingStep) {
    setError(null);
    setStep(nextStep);
  }

  function renderOnboardingStep() {
    function renderStepDots() {
      const steps: OnboardingStep[] = [1, 2, 3, 4];

      return (
        <div
          aria-label={`Onboarding step ${step} of 4`}
          className="onboarding-step-dots"
          role="img"
        >
          {steps.map((stepNumber) => (
            <span
              key={stepNumber}
              className={`onboarding-step-dot${stepNumber === step ? " is-active" : ""}`}
            />
          ))}
        </div>
      );
    }

    if (step === 1) {
      return (
        <form
          className="stack onboarding-stack"
          onSubmit={(event) => {
            event.preventDefault();
            goToStep(2);
          }}
        >
          {renderStepDots()}
          <h1 className="page-title">What's your company called?</h1>
          <Input
            autoFocus
            onChange={(event) => setCompanyName(event.target.value)}
            placeholder="Company name"
            required
            value={companyName}
          />
          <Button type="submit">Continue</Button>
        </form>
      );
    }

    if (step === 2) {
      return (
        <form
          className="stack onboarding-stack"
          onSubmit={(event) => {
            event.preventDefault();
            goToStep(3);
          }}
        >
          {renderStepDots()}
          <h1 className="page-title">What best describes you?</h1>
          <select
            className="fc-input"
            onChange={(event) => setCategory(event.target.value)}
            required
            value={category}
          >
            <option value="">Select one...</option>
            {ORG_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <Button type="submit">Continue</Button>
        </form>
      );
    }

    if (step === 3) {
      return (
        <form
          className="stack onboarding-stack"
          onSubmit={(event) => {
            event.preventDefault();
            goToStep(4);
          }}
        >
          {renderStepDots()}
          <h1 className="page-title">How many users do you have?</h1>
          <select
            className="fc-input"
            onChange={(event) => setSize(event.target.value)}
            required
            value={size}
          >
            <option value="">Select one...</option>
            {ORG_SIZES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <Button type="submit">Continue</Button>
        </form>
      );
    }

    const signUpPasswordMinCharsOk = signUpPassword.trim().length >= 6;
    const signUpPasswordUppercaseOk = /[A-Z]/.test(signUpPassword);
    const signUpPasswordNumberOk = /\d/.test(signUpPassword);

    return (
      <div className="stack onboarding-stack">
        {renderStepDots()}
        <h1 className="page-title">Create account</h1>
        <Button
          className="google-button"
          disabled={isLoading}
          onClick={() =>
            withHandler(async (authInstance) =>
              continueWithGoogleSignUp(authInstance),
            )
          }
          variant="secondary"
        >
          <img
            alt=""
            aria-hidden="true"
            className="google-icon"
            src="/assets/google.svg"
          />
          Continue with Google
        </Button>
        <div className="divider">
          <span>Or</span>
        </div>
        <Input
          autoComplete="email"
          onChange={(event) => setSignUpEmail(event.target.value)}
          placeholder="Email address"
          required
          type="email"
          value={signUpEmail}
        />
        <Input
          autoComplete="new-password"
          onChange={(event) => setSignUpPassword(event.target.value)}
          onBlur={() => {
            signUpPasswordBlurTimeoutRef.current = setTimeout(() => {
              signUpPasswordBlurTimeoutRef.current = null;
              setIsSignUpPasswordFocused(false);
            }, 0);
          }}
          onFocus={() => {
            if (signUpPasswordBlurTimeoutRef.current) {
              clearTimeout(signUpPasswordBlurTimeoutRef.current);
              signUpPasswordBlurTimeoutRef.current = null;
            }
            setIsSignUpPasswordFocused(true);
          }}
          placeholder="Password"
          required
          type="password"
          value={signUpPassword}
        />
        {isSignUpPasswordFocused || signUpPassword.length > 0 ? (
          <div className="stack" style={{ gap: 6, marginTop: -4 }}>
            {[
              { ok: signUpPasswordMinCharsOk, label: "Min 6 characters" },
              { ok: signUpPasswordUppercaseOk, label: "At least 1 Uppercase" },
              { ok: signUpPasswordNumberOk, label: "At least 1 Number" },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 18,
                }}
              >
                {item.ok ? (
                  <CheckIcon
                    aria-hidden="true"
                    style={{ width: 16, height: 16 }}
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    style={{ width: 16, textAlign: "center" }}
                  >
                    -
                  </span>
                )}
                <span className="muted">{item.label}</span>
              </div>
            ))}
          </div>
        ) : null}
        <Button
          onClick={() => {
            if (!hasValidCredentials(signUpEmail, signUpPassword)) {
              setError("Please provide valid credentials");
              return;
            }

            withHandler(async (authInstance) =>
              createEmailPasswordAccount(authInstance),
            );
          }}
        >
          Continue
        </Button>
        <p className="auth-legal-footnote">
          By continuing you agree to our{" "}
          <a
            className="auth-legal-footnote-link"
            href="https://feedchat.io/terms"
            rel="noopener noreferrer"
            target="_blank"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            className="auth-legal-footnote-link"
            href="https://feedchat.io/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            Privacy Policy
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <main className="page-shell page-shell--auth">
      <div className="page-auth-layout">
        <section className="page-auth-left">
          <div className="auth-container">
            <section className="card stack">
              {authMode === "onboarding" ? (
                renderOnboardingStep()
              ) : authMode === "resetPassword" ? (
                <form
                  className="stack onboarding-stack"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setResetPasswordMessage(null);
                    const email = resetPasswordEmail.trim();
                    if (!/^\S+@\S+\.\S+$/.test(email)) {
                      setError("Please enter a valid email address");
                      return;
                    }
                    setIsLoading(true);
                    setError(null);
                    if (!auth) {
                      setError("Firebase auth is not configured.");
                      setIsLoading(false);
                      return;
                    }
                    try {
                      await sendPasswordResetEmail(auth, email);
                      setResetPasswordMessage(
                        "Check your email for a link to reset your password.",
                      );
                    } catch (nextError) {
                      setError(
                        nextError instanceof Error
                          ? nextError.message
                          : "Could not send reset email.",
                      );
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                >
                  <h1 className="page-title">Reset Password</h1>
                  <Input
                    autoComplete="email"
                    onChange={(event) =>
                      setResetPasswordEmail(event.target.value)
                    }
                    placeholder="Email address"
                    required
                    type="email"
                    value={resetPasswordEmail}
                  />
                  <Button disabled={isLoading} type="submit">
                    {isLoading ? "Sending…" : "Send link"}
                  </Button>
                  {resetPasswordMessage ? (
                    <p className="muted">{resetPasswordMessage}</p>
                  ) : null}
                </form>
              ) : (
                <form
                  className="stack onboarding-stack"
                  onSubmit={(event) => {
                    event.preventDefault();

                    if (!hasValidCredentials(signInEmail, signInPassword)) {
                      setError("Please provide valid credentials");
                      return;
                    }

                    withHandler(async (authInstance) => {
                      if (isInviteRoute) {
                        await createUserWithEmailAndPassword(
                          authInstance,
                          signInEmail,
                          signInPassword,
                        );
                        return;
                      }
                      await signInWithEmailAndPassword(
                        authInstance,
                        signInEmail,
                        signInPassword,
                      );
                    });
                  }}
                >
                  <h1 className="page-title">
                    {isInviteRoute ? "Join your team." : "Welcome back"}
                  </h1>
                  <Button
                    className="google-button"
                    disabled={isLoading}
                    onClick={() =>
                      withHandler(async (authInstance) => {
                        const credential = await signInWithPopup(
                          authInstance,
                          new GoogleAuthProvider(),
                        );

                        // On the Log in path, prevent creating/keeping a session for
                        // users who don't already exist in our system.
                        if (!isInviteRoute) {
                          const token = await credential.user.getIdToken();
                          const res = await fetch(
                            `${getFeedchatApiBase()}/userCheck`,
                            { headers: authHeaders(token) },
                          );
                          if (res.status === 403) {
                            await signOut(authInstance);
                            resetAuthAndOnboardingAfterLogout();
                            setError("Create an account first.");
                            return;
                          }
                          if (!res.ok) {
                            throw new Error(
                              "Could not verify your account. Please try again.",
                            );
                          }
                        }
                      })
                    }
                    type="button"
                    variant="secondary"
                  >
                    <img
                      alt=""
                      aria-hidden="true"
                      className="google-icon"
                      src="/assets/google.svg"
                    />
                    Continue with Google
                  </Button>
                  <div className="divider">
                    <span>Or</span>
                  </div>
                  <Input
                    autoComplete="email"
                    onChange={(event) => setSignInEmail(event.target.value)}
                    placeholder="Email address"
                    required
                    type="email"
                    value={signInEmail}
                  />
                  <Input
                    autoComplete="current-password"
                    onChange={(event) => setSignInPassword(event.target.value)}
                    onBlur={() => {
                      invitePasswordBlurTimeoutRef.current = setTimeout(() => {
                        invitePasswordBlurTimeoutRef.current = null;
                        setIsInvitePasswordFocused(false);
                      }, 0);
                    }}
                    onFocus={() => {
                      if (invitePasswordBlurTimeoutRef.current) {
                        clearTimeout(invitePasswordBlurTimeoutRef.current);
                        invitePasswordBlurTimeoutRef.current = null;
                      }
                      setIsInvitePasswordFocused(true);
                    }}
                    placeholder="Password"
                    required
                    type="password"
                    value={signInPassword}
                  />
                  {isInviteRoute &&
                  (isInvitePasswordFocused || signInPassword.length > 0) ? (
                    <div className="stack" style={{ gap: 6, marginTop: -4 }}>
                      {[
                        {
                          ok: signInPassword.trim().length >= 6,
                          label: "Min 6 characters",
                        },
                        {
                          ok: /[A-Z]/.test(signInPassword),
                          label: "At least 1 Uppercase",
                        },
                        {
                          ok: /\d/.test(signInPassword),
                          label: "At least 1 Number",
                        },
                      ].map((item) => (
                        <div
                          key={item.label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            minHeight: 18,
                          }}
                        >
                          {item.ok ? (
                            <CheckIcon
                              aria-hidden="true"
                              style={{ width: 16, height: 16 }}
                            />
                          ) : (
                            <span
                              aria-hidden="true"
                              style={{ width: 16, textAlign: "center" }}
                            >
                              -
                            </span>
                          )}
                          <span className="muted">{item.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <Button disabled={isProvisioningInviteUser} type="submit">
                    {isProvisioningInviteUser
                      ? "Joining..."
                      : isInviteRoute
                        ? "Create account"
                        : "Log in"}
                  </Button>
                  {isInviteRoute ? (
                    <p className="auth-legal-footnote">
                      By continuing you agree to our{" "}
                      <a
                        className="auth-legal-footnote-link"
                        href="https://feedchat.io/terms"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Terms
                      </a>{" "}
                      and{" "}
                      <a
                        className="auth-legal-footnote-link"
                        href="https://feedchat.io/privacy"
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        Privacy Policy
                      </a>
                      .
                    </p>
                  ) : null}
                </form>
              )}
              {error ? <p className="muted auth-error">{error}</p> : null}
            </section>
            {authMode === "onboarding" && (step === 1 || step === 4) ? (
              <p className="muted auth-switch-copy">
                Already have an account?{" "}
                <button
                  className="text-link"
                  onClick={() => setAuthMode("signin")}
                  type="button"
                >
                  Log in
                </button>
              </p>
            ) : null}
            {authMode === "signin" ? (
              <div className="muted auth-switch-copy auth-signin-footer">
                <button
                  className="text-link"
                  onClick={() => {
                    setError(null);
                    setAuthMode("onboarding");
                    setStep(1);
                    if (isInviteRoute) {
                      router.push("/");
                    }
                  }}
                  type="button"
                >
                  {isInviteRoute ? "Create own team" : "Back to onboarding"}
                </button>
                {!isInviteRoute ? (
                  <button
                    className="text-link"
                    onClick={() => {
                      setError(null);
                      setResetPasswordMessage(null);
                      setResetPasswordEmail(signInEmail.trim());
                      setAuthMode("resetPassword");
                    }}
                    type="button"
                  >
                    Forgot password
                  </button>
                ) : null}
              </div>
            ) : null}
            {authMode === "resetPassword" ? (
              <p className="muted auth-switch-copy">
                <button
                  className="text-link"
                  onClick={() => {
                    setError(null);
                    setResetPasswordMessage(null);
                    setAuthMode("signin");
                  }}
                  type="button"
                >
                  Back to login
                </button>
              </p>
            ) : null}
          </div>
        </section>
        <aside className="page-auth-right">
          <figure className="page-auth-quote-wrap">
            <blockquote className="page-auth-quote">
              <p>{authQuote}</p>
              <figcaption className="page-auth-quote-attribution"></figcaption>
            </blockquote>
          </figure>
        </aside>
      </div>
    </main>
  );
}
