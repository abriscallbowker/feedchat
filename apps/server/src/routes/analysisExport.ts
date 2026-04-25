import { Router, type IRouter, Response } from "express";
import { firestore, rtdb } from "../lib/firebase";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth";
import { notifyDataExport } from "../lib/notificationsService";

const router: IRouter = Router();

type ExportStatus = "processing" | "readyForDownload" | "error";

type ExportJob = {
  status: ExportStatus;
  csv?: string;
  error?: string;
  startedAt: number;
};

const exportJobs = new Map<string, ExportJob>();

type IndexEntry = {
  user?: string;
  agent?: string;
  inputTokens?: number;
  outputTokens?: number;
  type?: string;
};

type ChatData = {
  createdAt?: string;
  lastMessageAt?: string;
  userId?: string;
  index?: Record<string, IndexEntry>;
};

function escapeCsvField(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function buildExportCsv(orgId: string): Promise<string> {
  const [chatsSnapshot, rtdbSnapshot] = await Promise.all([
    firestore
      .collection("orgs")
      .doc(orgId)
      .collection("chats")
      .orderBy("dateTime", "desc")
      .get(),
    rtdb.ref(`/chats/${orgId}`).once("value"),
  ]);

  const summaryMap = new Map<
    string,
    { dateTime: string | null; sentimentScore: number | null; summary: string | null }
  >();
  for (const doc of chatsSnapshot.docs) {
    const d = doc.data();
    summaryMap.set(doc.id, {
      dateTime: d.dateTime ?? null,
      sentimentScore: d.sentimentScore ?? null,
      summary: d.summary ?? null,
    });
  }

  const rawChats = (rtdbSnapshot.val() as Record<string, ChatData> | null) ?? {};

  const rows: string[][] = [];
  let maxTurns = 0;

  const processedChats: Array<{
    chatId: string;
    dateTimeStart: string | null;
    userId: string | null;
    sentimentScore: number | null;
    turns: Array<{ user: string | null; assistant: string | null }>;
  }> = [];

  const allChatIds = new Set([
    ...summaryMap.keys(),
    ...Object.keys(rawChats),
  ]);

  for (const chatId of allChatIds) {
    const summary = summaryMap.get(chatId);
    const chatData = rawChats[chatId];

    const indexMap = chatData?.index ?? {};
    const hasUserMessage = Object.values(indexMap).some((turn) => !!turn.user);
    if (!hasUserMessage && !summary) continue;

    const turns = Object.entries(indexMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, turn]) => ({
        user: turn.user ?? null,
        assistant: turn.agent ?? null,
      }));

    if (turns.length === 0 && !summary) continue;

    if (turns.length > maxTurns) maxTurns = turns.length;

    processedChats.push({
      chatId,
      dateTimeStart: summary?.dateTime ?? chatData?.createdAt ?? null,
      userId: chatData?.userId ?? null,
      sentimentScore: summary?.sentimentScore ?? null,
      turns,
    });
  }

  const headerBase = ["chatId", "dateTimeStart", "userId", "sentimentScore"];
  const turnHeaders: string[] = [];
  for (let i = 1; i <= maxTurns; i++) {
    turnHeaders.push(`userMsg${i}`, `assistantMsg${i}`);
  }
  const header = [...headerBase, ...turnHeaders];
  rows.push(header);

  for (const chat of processedChats) {
    const row: string[] = [
      escapeCsvField(chat.chatId),
      escapeCsvField(chat.dateTimeStart),
      escapeCsvField(chat.userId),
      escapeCsvField(
        chat.sentimentScore != null ? String(chat.sentimentScore) : null
      ),
    ];

    for (let i = 0; i < maxTurns; i++) {
      const turn = chat.turns[i];
      row.push(escapeCsvField(turn?.user ?? null));
      row.push(escapeCsvField(turn?.assistant ?? null));
    }

    rows.push(row);
  }

  return rows.map((r) => r.join(",")).join("\r\n");
}

async function runExportJob(orgId: string, exporterEmail: string): Promise<void> {
  try {
    const csv = await buildExportCsv(orgId);
    exportJobs.set(orgId, {
      status: "readyForDownload",
      csv,
      startedAt: exportJobs.get(orgId)?.startedAt ?? Date.now(),
    });
    notifyDataExport(orgId, exporterEmail).catch((err) =>
      console.error("[notifications] notifyDataExport error:", err),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    exportJobs.set(orgId, {
      status: "error",
      error: msg,
      startedAt: exportJobs.get(orgId)?.startedAt ?? Date.now(),
    });
  }
}

router.get(
  "/analysis/export",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    if (!req.userData) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const orgId = req.orgId;
    if (!orgId) {
      res.status(400).json({ error: "User has no associated org" });
      return;
    }

    const existingJob = exportJobs.get(orgId);

    if (req.query.download === "true") {
      if (!existingJob || existingJob.status !== "readyForDownload") {
        res.setHeader("Cache-Control", "no-store");
        res.status(409).json({
          error: "Export not ready. Poll /analysis/export for status.",
          status: existingJob?.status ?? "none",
        });
        return;
      }
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="export-${orgId}-${Date.now()}.csv"`
      );
      res.send(existingJob.csv);
      exportJobs.delete(orgId);
      return;
    }

    if (existingJob?.status === "processing") {
      res.setHeader("Cache-Control", "no-store");
      res.json({ status: "processing" });
      return;
    }

    if (existingJob?.status === "readyForDownload") {
      res.setHeader("Cache-Control", "no-store");
      res.json({ status: "readyForDownload" });
      return;
    }

    if (existingJob?.status === "error") {
      res.setHeader("Cache-Control", "no-store");
      res.status(500).json({ status: "error", error: existingJob.error });
      exportJobs.delete(orgId);
      return;
    }

    const exporterEmail = (req.userData.email as string | undefined) ?? "";
    exportJobs.set(orgId, { status: "processing", startedAt: Date.now() });
    runExportJob(orgId, exporterEmail);

    res.setHeader("Cache-Control", "no-store");
    res.json({ status: "processing" });
  }
);

export default router;
