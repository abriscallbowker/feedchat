"use client";

import {
  type CSSProperties,
  FormEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArchiveBoxXMarkIcon,
  EllipsisVerticalIcon,
  InformationCircleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import {
  DocumentCheckIcon,
  DocumentMagnifyingGlassIcon,
} from "@heroicons/react/24/solid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Lottie from "lottie-react";
import { Button } from "@feedchat/ui";
import submittedAnimation from "../assets/submitted.json";
import {
  fetchOrgDefaultMessage,
  fetchOrgProfilePicUrl,
  withOptionalLocalDevOrgId,
} from "../lib/feedchat-api";
import { createSseDeltaAccumulator } from "../lib/sse-chat-delta";

/** Survives full page reload so we can restore the draft after a stale-chat refresh. */
const PENDING_MESSAGE_STORAGE_KEY = "feedchat.pendingMessage";

function isStaleChatNotFoundError(serverMessage: string): boolean {
  const m = serverMessage.toLowerCase();
  return (
    m.includes("can't find chat") ||
    m.includes("cannot find chat") ||
    m.includes("no chatid found") ||
    m.includes("chatid not found")
  );
}

const FORM_DISABLED_SERVER_TEXT = "This form has been disabled";
const FORM_DISABLED_USER_MESSAGE = "This form has been disabled.";

function isFormDisabledApiMessage(raw: string): boolean {
  const t = raw.trim();
  if (t === FORM_DISABLED_SERVER_TEXT) return true;
  try {
    const parsed = JSON.parse(t) as { error?: unknown };
    return (
      typeof parsed.error === "string" &&
      parsed.error.trim() === FORM_DISABLED_SERVER_TEXT
    );
  } catch {
    return t.includes(FORM_DISABLED_SERVER_TEXT);
  }
}

function userFacingErrorMessage(raw: string, emptyFallback: string): string {
  if (isFormDisabledApiMessage(raw)) return FORM_DISABLED_USER_MESSAGE;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : emptyFallback;
}

/** Shown while the assistant reply is in flight but no streamed text has arrived yet. */
function AssistantStreamingDots() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % 3);
    }, 140);
    return () => window.clearInterval(id);
  }, []);
  const text = phase === 0 ? "." : phase === 1 ? ".." : "...";
  return (
    <span className="msg-streaming-dots" aria-label="Assistant is replying">
      {text}
    </span>
  );
}

type Message = {
  role: "user" | "assistant";
  content: string;
};

function timeOfDayGreeting(
  now: Date,
): "Good morning" | "Good afternoon" | "Good evening" {
  const h = now.getHours(); // device local time
  if (h >= 5 && h <= 11) return "Good morning";
  if (h >= 12 && h <= 16) return "Good afternoon";
  return "Good evening";
}

function preferredContrastTextColor(hex: string): "#000000" | "#FFFFFF" {
  const normalized = hex.trim().replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return "#FFFFFF";

  const r = Number.parseInt(expanded.slice(0, 2), 16);
  const g = Number.parseInt(expanded.slice(2, 4), 16);
  const b = Number.parseInt(expanded.slice(4, 6), 16);

  const toLinear = (channel: number) => {
    const srgb = channel / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };

  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;

  return contrastWithBlack > contrastWithWhite ? "#000000" : "#FFFFFF";
}

export function ChatPageClient({
  companyName,
  initialColorPalette,
  initialAccentColor,
  initialWebsiteLink,
  initialSupportLink,
  initialDefaultMessageFromEdge,
}: {
  companyName: string | null;
  initialColorPalette: "light" | "dark" | null;
  initialAccentColor: string | null;
  initialWebsiteLink: string | null;
  initialSupportLink: string | null;
  /** Set from Edge Config via middleware when configured. */
  initialDefaultMessageFromEdge: string | null;
}) {
  const MIN_INPUT_CHARS = 10;
  const MAX_INPUT_CHARS = 2_000;
  const MAX_USER_MESSAGES_PER_SESSION = 5;

  const [input, setInput] = useState("");
  const [inputAlert, setInputAlert] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [navMenuOpen, setNavMenuOpen] = useState(false);
  const [chatId, setChatId] = useState<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const [hasSubmittedAtLeastOnce, setHasSubmittedAtLeastOnce] = useState(false);
  const [submitFeedbackCelebrationOpen, setSubmitFeedbackCelebrationOpen] =
    useState(false);
  const [websiteLink, setWebsiteLink] = useState<string | null>(
    initialWebsiteLink,
  );
  const [supportLink, setSupportLink] = useState<string | null>(
    initialSupportLink,
  );
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [colorPalette, setColorPalette] = useState<"light" | "dark" | null>(
    initialColorPalette,
  );
  const [accentColor, setAccentColor] = useState<string | null>(
    initialAccentColor,
  );
  const trimmedEdgeDefaultMessage = initialDefaultMessageFromEdge?.trim() ?? "";
  const [resolvedEmptyPrompt, setResolvedEmptyPrompt] = useState<string | null>(
    trimmedEdgeDefaultMessage.length > 0 ? trimmedEdgeDefaultMessage : null,
  );

  const inactivityTimeoutMs = 90_000;
  const lastUserSubmitAtRef = useRef<number | null>(null);
  const inactivityTimerRef = useRef<number | null>(null);
  const navMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const navMenuPanelRef = useRef<HTMLDivElement | null>(null);
  const controlsFormRef = useRef<HTMLFormElement | null>(null);
  const inputTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(false);
  const submitCelebrationReloadRef = useRef(false);

  const hostname = useMemo(() => {
    if (typeof window === "undefined") return "";
    return window.location.hostname;
  }, []);

  const isProbablyMobileDevice = useMemo(() => {
    if (typeof window === "undefined") return false;
    const nav = window.navigator;
    const ua = (nav.userAgent || "").toLowerCase();
    if (
      ua.includes("android") ||
      ua.includes("iphone") ||
      ua.includes("ipad")
    ) {
      return true;
    }
    if (ua.includes("mobile")) return true;
    if (nav.maxTouchPoints && nav.maxTouchPoints > 1) return true;
    return false;
  }, []);

  const queryUserId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const value = new URLSearchParams(window.location.search).get("userId");
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, []);

  useEffect(() => {
    if (!infoModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setInfoModalOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [infoModalOpen]);

  useEffect(() => {
    if (!navMenuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavMenuOpen(false);
    }

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (navMenuButtonRef.current?.contains(target)) return;
      if (navMenuPanelRef.current?.contains(target)) return;
      setNavMenuOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [navMenuOpen]);

  useEffect(() => {
    if (!infoModalOpen) return;
    setNavMenuOpen(false);
  }, [infoModalOpen]);

  async function clearClientCachesBestEffort() {
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // best-effort
    }

    try {
      window.sessionStorage.clear();
    } catch {
      // best-effort
    }

    try {
      window.localStorage.clear();
    } catch {
      // best-effort
    }
  }

  async function refreshChatSession() {
    await clearClientCachesBestEffort();
    window.location.reload();
  }

  function onSubmitFeedbackCelebrationComplete() {
    if (submitCelebrationReloadRef.current) return;
    submitCelebrationReloadRef.current = true;
    void refreshChatSession();
  }

  function getOrCreateChatId(): string {
    if (chatIdRef.current) return chatIdRef.current;
    const id = crypto.randomUUID();
    chatIdRef.current = id;
    setChatId(id);
    return id;
  }

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_MESSAGE_STORAGE_KEY);
      if (raw != null && raw !== "") {
        sessionStorage.removeItem(PENDING_MESSAGE_STORAGE_KEY);
        const next = raw.slice(0, MAX_INPUT_CHARS);
        setInput(next);
        if (next.trim().length >= MIN_INPUT_CHARS) {
          setInputAlert(null);
        }
      }
    } catch {
      // best-effort
    }

    getOrCreateChatId();
    void fetchOrgProfilePicUrl(hostname)
      .then((profilePic) => setProfilePicUrl(profilePic))
      .catch(() => setProfilePicUrl(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasSubmittedAtLeastOnce) return;

    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }

    const last = lastUserSubmitAtRef.current;
    if (!last) return;

    const msRemaining = Math.max(0, inactivityTimeoutMs - (Date.now() - last));
    inactivityTimerRef.current = window.setTimeout(() => {
      void refreshChatSession();
    }, msRemaining);

    return () => {
      if (inactivityTimerRef.current) {
        window.clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
    };
  }, [hasSubmittedAtLeastOnce]);

  function revertPendingMessagePair() {
    setMessages((prev) => {
      if (prev.length < 2) return prev;
      const last = prev[prev.length - 1];
      const secondLast = prev[prev.length - 2];
      if (
        secondLast?.role === "user" &&
        last?.role === "assistant" &&
        last.content === ""
      ) {
        return prev.slice(0, -2);
      }
      return prev;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = input.trim();
    if (isSending) return;

    if (
      messages.filter((m) => m.role === "user").length >=
      MAX_USER_MESSAGES_PER_SESSION
    ) {
      return;
    }

    if (message.length < MIN_INPUT_CHARS) {
      setInputAlert(`Enter at least ${MIN_INPUT_CHARS} characters`);
      return;
    }

    if (message.length > MAX_INPUT_CHARS) {
      setInputAlert("Maximum character limit reached");
      return;
    }

    const ensuredChatId = getOrCreateChatId();

    setInput("");
    setInputAlert(null);
    setError(null);
    setIsSending(true);
    setHasSubmittedAtLeastOnce(true);
    lastUserSubmitAtRef.current = Date.now();

    // reset inactivity timer on each user submission
    if (inactivityTimerRef.current) {
      window.clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    inactivityTimerRef.current = window.setTimeout(() => {
      void refreshChatSession();
    }, inactivityTimeoutMs);

    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    shouldAutoScrollRef.current = true;

    try {
      const requestBody = queryUserId
        ? { message, chatId: ensuredChatId, userId: queryUserId }
        : { message, chatId: ensuredChatId };
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(withOptionalLocalDevOrgId(requestBody)),
      });

      if (!response.ok) {
        const bodyText = await response.text();
        let serverMessage = bodyText.trim();
        try {
          const parsed = JSON.parse(bodyText) as {
            message?: string;
            error?: string;
          };
          serverMessage = (parsed.message ?? parsed.error ?? bodyText).trim();
        } catch {
          /* use bodyText */
        }
        revertPendingMessagePair();
        if (response.status === 403) {
          setError(
            userFacingErrorMessage(
              serverMessage,
              "This organization has disabled Feedchat.",
            ),
          );
        } else if (isStaleChatNotFoundError(serverMessage)) {
          try {
            sessionStorage.setItem(
              PENDING_MESSAGE_STORAGE_KEY,
              message.slice(0, MAX_INPUT_CHARS),
            );
          } catch {
            // best-effort
          }
          window.location.reload();
          return;
        } else {
          setError(
            userFacingErrorMessage(serverMessage, "Chat request failed."),
          );
        }
        return;
      }

      if (!response.body) {
        revertPendingMessagePair();
        setError("Chat request failed.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const sse = createSseDeltaAccumulator();

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          const tail = sse.flush();
          if (tail) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === "assistant") {
                next[next.length - 1] = {
                  ...last,
                  content: `${last.content}${tail}`,
                };
              }
              return next;
            });
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;

        const deltaText = sse.append(chunk);
        if (!deltaText) continue;

        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === "assistant") {
            next[next.length - 1] = {
              ...last,
              content: `${last.content}${deltaText}`,
            };
          }
          return next;
        });
      }
    } catch (nextError) {
      revertPendingMessagePair();
      const raw =
        nextError instanceof Error
          ? nextError.message
          : "Unable to stream chat response.";
      setError(userFacingErrorMessage(raw, "Unable to stream chat response."));
    } finally {
      setIsSending(false);
    }
  }

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distanceFromBottom < 96;

    if (!shouldAutoScrollRef.current && !isNearBottom) return;

    const behavior: ScrollBehavior = shouldAutoScrollRef.current
      ? "smooth"
      : "auto";
    shouldAutoScrollRef.current = false;

    // Wait for DOM to paint after React updates.
    const id = window.requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior });
    });
    return () => window.cancelAnimationFrame(id);
  }, [messages, isSending]);

  const chatTitle = companyName ? `${companyName} Feedback` : "Feedback";
  const websiteLabel = "Close Feedback";
  const supportLabel = "Support";
  const userMessageCount = useMemo(
    () => messages.filter((m) => m.role === "user").length,
    [messages],
  );
  const atUserMessageLimit = userMessageCount >= MAX_USER_MESSAGES_PER_SESSION;
  const canSubmit = !!chatId && !isSending && !atUserMessageLimit;
  const showNavMenu = Boolean(websiteLink || supportLink);
  const isDarkPalette = colorPalette === "dark";
  const accentTextColor = accentColor
    ? preferredContrastTextColor(accentColor)
    : null;
  const fallbackEmptyPrompt = useMemo(() => {
    const greeting = timeOfDayGreeting(new Date());
    return `${greeting}! Any feedback to share?`;
  }, []);

  useEffect(() => {
    const fromEdge = initialDefaultMessageFromEdge?.trim() ?? "";
    if (fromEdge.length > 0) return;

    if (!hostname) {
      setResolvedEmptyPrompt(fallbackEmptyPrompt);
      return;
    }
    let cancelled = false;
    void (async () => {
      const fromApi = await fetchOrgDefaultMessage(hostname);
      if (cancelled) return;
      const trimmed = typeof fromApi === "string" ? fromApi.trim() : "";
      setResolvedEmptyPrompt(
        trimmed.length > 0 ? trimmed : fallbackEmptyPrompt,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [hostname, fallbackEmptyPrompt, initialDefaultMessageFromEdge]);

  const showEndSession = useMemo(() => {
    const assistantMsgs = messages.filter((m) => m.role === "assistant");
    if (assistantMsgs.length < 2 || assistantMsgs[1].content.length === 0) {
      return false;
    }
    const last = messages[messages.length - 1];
    const streamingSecondAssistant =
      isSending && last?.role === "assistant" && messages.length === 4;
    return !streamingSecondAssistant;
  }, [messages, isSending]);
  const chatPageClassName = isDarkPalette
    ? "chat-page chat-page-dark"
    : "chat-page";
  const chatPageStyle = {
    "--chat-accent-color": accentColor ?? undefined,
    "--chat-user-text-color": accentTextColor ?? undefined,
  } as CSSProperties;
  const sendButtonStyle = {
    backgroundColor: accentColor ?? (isDarkPalette ? "#FFFFFF" : undefined),
    color: accentTextColor ?? (isDarkPalette ? "#000000" : undefined),
  };
  const sendIconStyle = accentTextColor
    ? ({ color: accentTextColor } as CSSProperties)
    : undefined;

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.toggle("chat-page-dark-body", isDarkPalette);
    document.documentElement.classList.toggle(
      "chat-page-dark-root",
      isDarkPalette,
    );
    document.body.classList.add("chat-page-no-scroll");
    return () => {
      document.body.classList.remove("chat-page-dark-body");
      document.documentElement.classList.remove("chat-page-dark-root");
      document.body.classList.remove("chat-page-no-scroll");
    };
  }, [isDarkPalette]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    function onTouchMove(event: TouchEvent) {
      const scrollEl = messagesContainerRef.current;
      if (!scrollEl) return;
      const target = event.target as Node | null;
      if (!target) return;
      if (scrollEl.contains(target)) return;
      event.preventDefault();
    }

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const markerAttr = "data-feedchat-dynamic-favicon";
    const existing = document.head.querySelector<HTMLLinkElement>(
      `link[rel="icon"][${markerAttr}="true"]`,
    );

    if (!profilePicUrl) {
      existing?.remove();
      return;
    }

    const next = existing ?? document.createElement("link");
    next.setAttribute("rel", "icon");
    next.setAttribute("type", "image/webp");
    next.setAttribute(markerAttr, "true");
    next.setAttribute("href", profilePicUrl);

    if (!existing) {
      document.head.appendChild(next);
    }
  }, [profilePicUrl]);

  function autosizeInputTextarea() {
    const el = inputTextareaRef.current;
    if (!el) return;

    el.style.height = "auto";

    const styles = window.getComputedStyle(el);
    const fontSizePx = Number.parseFloat(styles.fontSize || "16") || 16;
    const lineHeightRaw = styles.lineHeight;
    const lineHeightPx =
      lineHeightRaw && lineHeightRaw !== "normal"
        ? Number.parseFloat(lineHeightRaw)
        : fontSizePx * 1.45;
    const paddingTopPx = Number.parseFloat(styles.paddingTop || "0") || 0;
    const paddingBottomPx = Number.parseFloat(styles.paddingBottom || "0") || 0;
    const borderTopPx = Number.parseFloat(styles.borderTopWidth || "0") || 0;
    const borderBottomPx =
      Number.parseFloat(styles.borderBottomWidth || "0") || 0;

    const maxHeightPx =
      lineHeightPx * 4 +
      paddingTopPx +
      paddingBottomPx +
      borderTopPx +
      borderBottomPx;

    const nextHeightPx = Math.min(el.scrollHeight, maxHeightPx);
    el.style.height = `${nextHeightPx}px`;
    el.style.overflowY = el.scrollHeight > maxHeightPx ? "auto" : "hidden";
  }

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    autosizeInputTextarea();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  return (
    <main className={chatPageClassName} style={chatPageStyle}>
      <div className="chat-title-row">
        <div className="chat-title-menu">
          {showNavMenu ? (
            <button
              aria-expanded={navMenuOpen}
              aria-haspopup="menu"
              aria-label="Open menu"
              className="chat-title-menu-button"
              ref={navMenuButtonRef}
              type="button"
              onClick={() => setNavMenuOpen((prev) => !prev)}
            >
              <EllipsisVerticalIcon
                aria-hidden
                className="chat-title-menu-icon"
              />
            </button>
          ) : null}
          {showNavMenu && navMenuOpen ? (
            <div
              className="chat-title-menu-popout"
              ref={navMenuPanelRef}
              role="menu"
            >
              {websiteLink ? (
                <a
                  className="chat-title-menu-item"
                  href={websiteLink}
                  role="menuitem"
                  onClick={() => setNavMenuOpen(false)}
                >
                  <ArchiveBoxXMarkIcon
                    aria-hidden
                    className="chat-title-menu-item-icon"
                  />
                  <span>{websiteLabel}</span>
                </a>
              ) : null}
              {supportLink ? (
                <a
                  className="chat-title-menu-item"
                  href={supportLink}
                  role="menuitem"
                  onClick={() => setNavMenuOpen(false)}
                >
                  <DocumentMagnifyingGlassIcon
                    aria-hidden
                    className="chat-title-menu-item-icon"
                  />
                  <span>{supportLabel}</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        <h1 className="chat-title">
          {profilePicUrl ? (
            <img
              alt=""
              aria-hidden
              className="chat-title-profile-pic"
              src={profilePicUrl}
            />
          ) : null}
          <span>
            {companyName && websiteLink ? (
              <>
                <a className="chat-title-org-link" href={websiteLink}>
                  {companyName}
                </a>{" "}
                Feedback
              </>
            ) : (
              chatTitle
            )}
          </span>
        </h1>
        <button
          aria-label="About this feedback chat"
          className="chat-title-info"
          type="button"
          onClick={() => setInfoModalOpen(true)}
        >
          <InformationCircleIcon aria-hidden className="chat-title-info-icon" />
        </button>
      </div>
      {infoModalOpen ? (
        <div className="chat-info-overlay">
          <div
            aria-labelledby="chat-info-modal-title"
            aria-modal="true"
            className="chat-info-modal"
            role="dialog"
          >
            <h2 className="chat-info-modal-title" id="chat-info-modal-title">
              Share your feedback
            </h2>
            <p className="chat-info-modal-subtitle">
              We take feedback very seriously. Share your thoughts and it will
              be shared with our team.
            </p>
            <Button
              className="chat-info-modal-okay"
              onClick={() => setInfoModalOpen(false)}
              type="button"
            >
              Okay
            </Button>
          </div>
        </div>
      ) : null}
      {submitFeedbackCelebrationOpen ? (
        <div
          aria-busy="true"
          aria-live="polite"
          className="chat-submitted-overlay"
          role="status"
        >
          <Lottie
            animationData={submittedAnimation}
            className="chat-submitted-lottie"
            loop={false}
            onComplete={onSubmitFeedbackCelebrationComplete}
          />
        </div>
      ) : null}
      <div className="chat-main">
        <section className="chat-shell">
          <div className="chat-messages" ref={messagesContainerRef}>
            {messages.length === 0 ? (
              <div
                className={
                  resolvedEmptyPrompt === null
                    ? "msg-assistant msg-assistant--streaming"
                    : "msg-assistant"
                }
              >
                {resolvedEmptyPrompt === null ? (
                  <AssistantStreamingDots />
                ) : (
                  <p className="msg-empty-prompt">{resolvedEmptyPrompt}</p>
                )}
              </div>
            ) : null}
            {messages.map((message, index) => {
              const isLast = index === messages.length - 1;
              const showStreamingDots =
                message.role === "assistant" &&
                message.content.length === 0 &&
                isSending &&
                isLast;

              if (
                message.role === "assistant" &&
                message.content.length === 0
              ) {
                if (!showStreamingDots) return null;
                return (
                  <div
                    className="msg-assistant msg-assistant--streaming"
                    key={`${message.role}-${index}`}
                  >
                    <AssistantStreamingDots />
                  </div>
                );
              }

              return (
                <div
                  className={
                    message.role === "user" ? "msg-user" : "msg-assistant"
                  }
                  key={`${message.role}-${index}`}
                >
                  {message.role === "user" ? (
                    <span className="msg-plain">{message.content}</span>
                  ) : (
                    <div className="msg-markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {showEndSession ? (
            <button
              className="chat-end-session"
              disabled={submitFeedbackCelebrationOpen}
              type="button"
              onClick={() => setSubmitFeedbackCelebrationOpen(true)}
            >
              <DocumentCheckIcon
                aria-hidden
                className="chat-end-session-icon"
              />
              <span>End Session</span>
            </button>
          ) : null}
          <form
            className="chat-controls"
            onSubmit={handleSubmit}
            ref={controlsFormRef}
          >
            {atUserMessageLimit ? (
              <p className="chat-message-limit-notice" role="status">
                You have reached the maximum of {MAX_USER_MESSAGES_PER_SESSION}{" "}
                messages for this session.
              </p>
            ) : (
              <>
                {inputAlert ? (
                  <p className="chat-input-alert" role="alert">
                    {inputAlert}
                  </p>
                ) : null}
                <textarea
                  className="fc-input chat-input chat-input--multiline"
                  disabled={!chatId}
                  maxLength={MAX_INPUT_CHARS}
                  onChange={(event) => {
                    const next = event.target.value;
                    const trimmedLen = next.trim().length;

                    if (next.length >= MAX_INPUT_CHARS) {
                      setInputAlert("Maximum character limit reached");
                    } else if (trimmedLen >= MIN_INPUT_CHARS) {
                      setInputAlert(null);
                    }

                    setInput(next.slice(0, MAX_INPUT_CHARS));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    if (event.shiftKey) return;
                    if (event.nativeEvent.isComposing) return;
                    if (isProbablyMobileDevice) return;
                    event.preventDefault();
                    controlsFormRef.current?.requestSubmit();
                  }}
                  placeholder="Write a message..."
                  ref={inputTextareaRef}
                  required
                  rows={1}
                  value={input}
                />
                <Button
                  aria-busy={isSending}
                  aria-label={isSending ? "Sending" : "Send"}
                  className="chat-send-button"
                  disabled={!canSubmit}
                  style={sendButtonStyle}
                  type="submit"
                >
                  <PaperAirplaneIcon
                    aria-hidden
                    className="chat-send-icon"
                    style={sendIconStyle}
                  />
                </Button>
              </>
            )}
          </form>
          {error ? <p className="chat-error">{error}</p> : null}
        </section>
        <p className="chat-footnote">
          Powered by{" "}
          <a href="" rel="noopener noreferrer" target="_blank">
            feedchat
          </a>
          .{" "}
          <a href="" rel="noopener noreferrer" target="_blank">
            Privacy policy
          </a>
          .
        </p>
      </div>
    </main>
  );
}
