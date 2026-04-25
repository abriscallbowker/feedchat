import { Router, type IRouter, Request, Response } from "express";
import OpenAI from "openai";
import { v4 as uuidv4 } from "uuid";
import { rtdb } from "../lib/firebase";
import { OPENAI_CHAT_MODEL } from "../config";
import { resolveOrgIdFromRequest } from "../lib/resolveOrg";
import { getOrgDoc } from "../lib/orgCache";

import { chatRateLimiter, chatCooldown } from "../middlewares/rateLimiter";
import { dynamicTenantCors } from "../middlewares/cors";
import { internalJwt } from "../middlewares/internalJwt";

const router: IRouter = Router();

const openaiKey =
  process.env.OPENAI_API_KEY?.trim() ??
  process.env.OPENAI_SECRET_KEY?.trim() ??
  "";
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

router.options("/chat", dynamicTenantCors);

router.post("/chat", dynamicTenantCors, internalJwt, chatRateLimiter, chatCooldown, async (req: Request, res: Response): Promise<void> => {
  const { message, chatId, userId } = req.body as { message?: string; chatId?: string; userId?: string };

  if (!message) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (message.length < 1) {
    res.status(400).json({ error: "Message must be at least 1 character" });
    return;
  }

  if (message.length > 2000) {
    res.status(400).json({ error: "Message must be no more than 2,000 characters" });
    return;
  }

  if (!chatId) {
    res.status(400).json({ error: "chatId is required" });
    return;
  }

  const orgResult = await resolveOrgIdFromRequest(req);
  if ("error" in orgResult) {
    res.status(orgResult.status).json({ error: orgResult.error });
    return;
  }
  const { orgId } = orgResult;

  const orgData = await getOrgDoc(orgId);
  if (!orgData) {
    res.status(404).json({ error: "orgId not found" });
    return;
  }

  const chatRef = rtdb.ref(`/chats/${orgId}/${chatId}`);
  const chatSnapshot = await chatRef.get();

  let chatData: { createdAt: string; index: Record<string, { user: string; agent: string }> | null };

  if (!chatSnapshot.exists()) {
    const createdAt = new Date().toISOString();
    await chatRef.set({
      createdAt,
      lastMessageAt: createdAt,
      summarized: false,
      summaryStatus: "pending",
      index: {},
    });
    chatData = { createdAt, index: null };
  } else {
    chatData = chatSnapshot.val() as {
      createdAt: string;
      index: Record<string, { user: string; agent: string }> | null;
    };
  }

  type MessageParam = { role: "user" | "assistant"; content: string };
  const history: MessageParam[] = [];
  const existingIndex = chatData.index ?? {};
  const sortedKeys = Object.keys(existingIndex).sort((a, b) => Number(a) - Number(b));

  if (sortedKeys.length >= 6) {
    res.status(403).json({ error: "Message limit reached for this chat" });
    return;
  }

  for (const key of sortedKeys) {
    const turn = existingIndex[key];
    history.push({ role: "user", content: turn.user });
    history.push({ role: "assistant", content: turn.agent });
  }
  history.push({ role: "user", content: message });

  const nextIndex = sortedKeys.length;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  let fullResponse = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const companyName = orgData.name as string;
  const supportLink = orgData.supportLink as string | undefined;
  const supportClause = supportLink
    ? `suggest they contact ${companyName} support directly at ${supportLink}`
    : `suggest they contact ${companyName} support directly`;
  const systemMessage = `You are a user feedback tool for ${companyName}. Their users have been prompted to provide feedback (good or bad) to you for their company. You are to respond as an AI agent supporting ${companyName} in collecting feedback. Ask follow-up questions, trying to get to the root of the problem or user need. Follow user interview best practices (no leading questions, open-ended etc.). After you have got some insight (or max five back-and-forth messages), provide a summary of what have learned and thank the user for their time and say this will be shared with the team. If the user has any questions related to the business that you can't assist them with, ${supportClause}. Don't engage or support unrelated or unnecessary conversations.`;

  if (!openai) {
    const fallback =
      "Thanks for the feedback — could you share one more detail about what happened (what you expected vs what you saw)?";
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ delta: fallback })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();

    const lastMessageAt = new Date().toISOString();
    await rtdb.ref("/").update({
      [`chats/${orgId}/${chatId}/lastMessageAt`]: lastMessageAt,
      ...(userId ? { [`chats/${orgId}/${chatId}/userId`]: userId } : {}),
      [`chats/${orgId}/${chatId}/index/${nextIndex}`]: {
        user: message,
        agent: fallback,
        inputTokens: 0,
        outputTokens: 0,
        lastMessageAt,
        type: "text",
      },
      [`pendingSummaries/${orgId}/${chatId}`]: { lastMessageAt },
    });
    return;
  }

  try {
    const stream = await openai.responses.create({
      model: OPENAI_CHAT_MODEL,
      instructions: systemMessage,
      input: history,
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "response.output_text.delta" && event.delta) {
        fullResponse += event.delta;
        res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`);
      }
      if (event.type === "response.completed" && event.response?.usage) {
        inputTokens = event.response.usage.input_tokens ?? 0;
        outputTokens = event.response.usage.output_tokens ?? 0;
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "OpenAI streaming error");
    if (!res.headersSent) {
      res.status(500).json({ error: "OpenAI request failed" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream error" })}\n\n`);
      res.end();
    }
    return;
  }

  const lastMessageAt = new Date().toISOString();

  await rtdb.ref("/").update({
    [`chats/${orgId}/${chatId}/lastMessageAt`]: lastMessageAt,
    ...(userId ? { [`chats/${orgId}/${chatId}/userId`]: userId } : {}),
    [`chats/${orgId}/${chatId}/index/${nextIndex}`]: {
      user: message,
      agent: fullResponse,
      inputTokens,
      outputTokens,
      lastMessageAt,
      type: "text",
    },
    [`pendingSummaries/${orgId}/${chatId}`]: { lastMessageAt },
  });
});

export default router;
