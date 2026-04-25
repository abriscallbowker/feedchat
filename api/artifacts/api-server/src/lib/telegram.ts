const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export function sendTelegramMessage(text: string): void {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn("[telegram] BOT_TOKEN or CHAT_ID not set, skipping");
    return;
  }
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text }),
  })
    .then((res) => {
      if (!res.ok) {
        res
          .text()
          .then((t) => console.error(`[telegram] sendMessage failed ${res.status}: ${t}`));
      }
    })
    .catch((err) => console.error("[telegram] sendMessage error:", err));
}
