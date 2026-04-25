import { Router, type IRouter, Response } from "express";
import { rtdb } from "../lib/firebase";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth";

const router: IRouter = Router();

router.get(
  "/conversations",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const chatId = req.query.chatId as string | undefined;
    if (!chatId) {
      res.status(400).json({ error: "chatId query parameter is required" });
      return;
    }

    if (!req.userData) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const orgId = req.orgId;
    if (!orgId) {
      res.status(400).json({ error: "User has no associated org" });
      return;
    }

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
      summarized?: boolean;
      summaryStatus?: string;
      userId?: string;
      index?: Record<string, IndexEntry>;
    };

    const chatSnapshot = await rtdb.ref(`/chats/${orgId}/${chatId}`).once("value");
    const data = chatSnapshot.val() as ChatData | null;

    if (!data) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const indexMap = data.index ?? {};
    const hasUserMessage = Object.values(indexMap).some((turn) => !!turn.user);
    if (!hasUserMessage) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const index = Object.entries(indexMap)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, turn]) => ({
        user: turn.user ?? null,
        assistant: turn.agent ?? null,
      }));

    res.json({
      orgId,
      conversation: {
        chatId,
        createdAt: data.createdAt ?? null,
        lastMessageAt: data.lastMessageAt ?? null,
        userId: data.userId ?? null,
        index,
      },
    });
  },
);

export default router;
