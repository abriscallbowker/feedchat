export const OPENAI_CHAT_MODEL = "gpt-5.4-mini";
export const OPENAI_SUMMARY_MODEL = "gpt-5.4-nano";
export const OPENAI_LLM_SUMMARY_MODEL = "gpt-5.4-nano";

export const ALLOWED_ORIGINS = [
  "http://localhost",
  "https://localhost",
  /^http:\/\/localhost(:\d+)?$/,
  /^https?:\/\/([\w-]+\.)*feedchat\.io$/,
];

export const SUMMARY_IDLE_SECONDS = 90;
