import OpenAI from "openai";
import { firestore } from "./firebase";
import { OPENAI_LLM_SUMMARY_MODEL } from "../config";
import { invalidateSummary } from "./summaryCache";
import type { Logger } from "pino";

const openaiKey =
  process.env.OPENAI_LLM_API_KEY?.trim() ??
  process.env.OPENAI_SUMMARY_KEY?.trim() ??
  process.env.OPENAI_API_KEY?.trim() ??
  process.env.OPENAI_SECRET_KEY?.trim() ??
  "";
const openai = openaiKey ? new OpenAI({ apiKey: openaiKey }) : null;

export type LlmSummaryResult =
  | { status: "skipped"; reason: string }
  | { status: "ok"; body: string }
  | { status: "error"; reason: string };

export async function generateOrgSummary(
  orgId: string,
  companyName: string,
  log: Logger,
): Promise<LlmSummaryResult> {
  if (!openai) {
    return { status: "skipped", reason: "Missing OpenAI API key" };
  }
  const chatsSnapshot = await firestore
    .collection("orgs")
    .doc(orgId)
    .collection("chats")
    .orderBy("dateTime", "desc")
    .limit(25)
    .get();

  if (chatsSnapshot.empty) {
    return { status: "skipped", reason: "No chats found for org" };
  }

  const summaries: string[] = [];
  for (const doc of chatsSnapshot.docs) {
    const data = doc.data();
    if (data?.summary) {
      summaries.push(data.summary as string);
    }
  }

  if (summaries.length === 0) {
    return { status: "skipped", reason: "No chat summaries available" };
  }

  const summaryList = summaries
    .map((s, i) => `${i + 1}. ${s}`)
    .join("\n");

  let body: string;

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_LLM_SUMMARY_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You're a user feedback analyst. Your goal is to summarize the conversations the user sends into a short overview of key themes. Format your response using markdown with clear headings. Be succinct. Only talk about what the users mentioned, not what the agent or platform or company could do.",
        },
        {
          role: "user",
          content: `Here are the customer feedback conversation summaries for the company ${companyName}:\n\n${summaryList}`,
        },
      ],
    });

    body = completion.choices[0]?.message?.content ?? "";

    if (!body) {
      return { status: "error", reason: "Empty response from LLM" };
    }
  } catch (err) {
    log.error({ err, orgId }, "LLM summary OpenAI error");
    return { status: "error", reason: "LLM summary generation failed" };
  }

  const dateSubmitted = new Date().toISOString();

  await firestore
    .collection("orgs")
    .doc(orgId)
    .collection("summary")
    .add({ body, dateSubmitted });

  invalidateSummary(orgId);

  log.info({ orgId }, "Org LLM summary generated and saved");

  return { status: "ok", body };
}
