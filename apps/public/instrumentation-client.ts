import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    // Protect the chat POST endpoint (BotID headers attach reliably here).
    { path: "/api/chat", method: "POST" },
  ],
});

