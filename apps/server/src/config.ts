export const OPENAI_CHAT_MODEL = "gpt-5.4-mini";
export const OPENAI_SUMMARY_MODEL = "gpt-5.4-nano";
export const OPENAI_LLM_SUMMARY_MODEL = "gpt-5.4-nano";

/** Local dev and common self-host patterns. Add `FEEDCHAT_ALLOWED_ORIGIN_REGEX` for your production domain. */
export const ALLOWED_ORIGINS: (string | RegExp)[] = [
  "http://localhost",
  "https://localhost",
  /^http:\/\/localhost(:\d+)?$/,
  /^https:\/\/127\.0\.0\.1(:\d+)?$/,
];

const extraOriginPattern = process.env.FEEDCHAT_ALLOWED_ORIGIN_REGEX?.trim();
if (extraOriginPattern) {
  try {
    ALLOWED_ORIGINS.push(new RegExp(extraOriginPattern));
  } catch {
    // Invalid regex — skip; fix FEEDCHAT_ALLOWED_ORIGIN_REGEX in env.
  }
}

export const SUMMARY_IDLE_SECONDS = 90;
