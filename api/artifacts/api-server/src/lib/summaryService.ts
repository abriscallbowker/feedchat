import OpenAI from "openai";
import { FieldValue } from "firebase-admin/firestore";
import { firestore, rtdb } from "./firebase.js";
import { OPENAI_SUMMARY_MODEL, SUMMARY_IDLE_SECONDS } from "../config.js";
import { notifyCreditsUsage, notifyNewFeedback } from "./notificationsService.js";
import { updateOrgChatAggregates } from "./orgAggregates.js";
import type { Logger } from "pino";

const openai = new OpenAI({ apiKey: process.env.OPENAI_SUMMARY_API_KEY });

export type SummaryResult =
  | { status: "skipped"; reason: string }
  | { status: "ok"; chatId: string; sentimentScore: number; summary: string }
  | { status: "error"; reason: string };

export async function summarizeChat(
  orgId: string,
  chatId: string,
  log: Logger,
): Promise<SummaryResult> {
  const chatRef = rtdb.ref(`/chats/${orgId}/${chatId}`);
  const snapshot = await chatRef.once("value");
  const chatData = snapshot.val();

  if (!chatData) {
    return { status: "skipped", reason: "Chat not found" };
  }

  if (chatData.summarized === true) {
    return { status: "skipped", reason: "Already summarized" };
  }

  if (chatData.summaryStatus === "running") {
    return { status: "skipped", reason: "Summary already running" };
  }

  const indexMap = chatData.index ?? {};
  const hasUserMessage = Object.values(indexMap).some(
    (turn: { user?: string }) => !!turn.user,
  );
  if (!hasUserMessage) {
    return { status: "skipped", reason: "No user messages in chat" };
  }

  const lastMessageAt = new Date(chatData.lastMessageAt).getTime();
  const idleMs = Date.now() - lastMessageAt;
  if (idleMs < SUMMARY_IDLE_SECONDS * 1000) {
    return {
      status: "skipped",
      reason: `Chat must be idle for ${SUMMARY_IDLE_SECONDS}s before summarizing`,
    };
  }

  await chatRef.update({ summaryStatus: "running" });

  const messagesJson = JSON.stringify(chatData.index ?? {});

  let sentimentScore = 0;
  let summary = "";
  let summaryInputTokens = 0;
  let summaryOutputTokens = 0;

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_SUMMARY_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are a conversation analyzer. Respond with strict JSON only: {"sentimentScore": <double from -1 to 1>, "summary": "<a few words summarizing what the topic(s) discussed was>"}',
        },
        {
          role: "user",
          content: `Analyze this conversation and return JSON:\n${messagesJson}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    sentimentScore = parsed.sentimentScore ?? 0;
    summary = parsed.summary ?? "";
    summaryInputTokens = completion.usage?.prompt_tokens ?? 0;
    summaryOutputTokens = completion.usage?.completion_tokens ?? 0;
  } catch (err) {
    log.error({ err, orgId, chatId }, "Summary OpenAI error");
    await chatRef.update({ summaryStatus: "failed" });
    return { status: "error", reason: "Summary generation failed" };
  }

  const dateTime = chatData.dateTime ?? chatData.createdAt;
  const totalVoiceMinutes = chatData.voiceMinutes ?? 0;
  const inputTokens = (chatData.inputTokens ?? 0) + summaryInputTokens;
  const outputTokens = (chatData.outputTokens ?? 0) + summaryOutputTokens;

  await chatRef.update({ summarized: true, summaryStatus: "complete" });

  await rtdb.ref(`/pendingSummaries/${orgId}/${chatId}`).remove();

  await Promise.all([
    firestore
      .collection("orgs")
      .doc(orgId)
      .collection("chats")
      .doc(chatId)
      .set({
        dateTime,
        inputTokens,
        outputTokens,
        sentimentScore,
        summary,
        voiceMinutes: totalVoiceMinutes,
      }),
    firestore
      .collection("orgs")
      .doc(orgId)
      .update({ "subscription.creditsUsed": FieldValue.increment(1) }),
  ]);

  log.info({ orgId, chatId, sentimentScore }, "Chat summarized");

  // Non-blocking: update running aggregates on org doc
  updateOrgChatAggregates(orgId, sentimentScore, dateTime).catch((err) =>
    log.error({ err, orgId, chatId }, "updateOrgChatAggregates error"),
  );

  // Non-blocking notifications (creditsUsed already incremented above)
  notifyNewFeedback(orgId).catch((err) =>
    log.error({ err, orgId }, "notifyNewFeedback error"),
  );
  notifyCreditsUsage(orgId).catch((err) =>
    log.error({ err, orgId }, "notifyCreditsUsage error"),
  );

  return { status: "ok", chatId, sentimentScore, summary };
}
