import { Router, type IRouter, Response } from "express";
import admin from "firebase-admin";
import { firestore } from "../lib/firebase.js";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth.js";

const router: IRouter = Router();

router.post(
  "/chat/tag/add",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { chatId, tag } = req.body as { chatId?: string; tag?: string };

    if (!chatId) {
      res.status(400).json({ error: "chatId is required" });
      return;
    }

    if (!tag) {
      res.status(400).json({ error: "tag is required" });
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

    const chatRef = firestore
      .collection("orgs")
      .doc(orgId)
      .collection("chats")
      .doc(chatId);

    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const chatData = chatDoc.data() ?? {};
    const existingTags = (chatData.tags ?? {}) as Record<
      string,
      { index: number; value: string }
    >;

    const existingIndices = Object.values(existingTags).map((t) => t.index);
    const nextIndex =
      existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0;

    await chatRef.update({
      [`tags.${nextIndex}`]: { index: nextIndex, value: tag },
    });

    res.json({ success: true, index: nextIndex, value: tag });
  },
);

router.post(
  "/chat/tag/remove",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { chatId, tag } = req.body as { chatId?: string; tag?: string };

    if (!chatId) {
      res.status(400).json({ error: "chatId is required" });
      return;
    }

    if (!tag) {
      res.status(400).json({ error: "tag is required" });
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

    const chatRef = firestore
      .collection("orgs")
      .doc(orgId)
      .collection("chats")
      .doc(chatId);

    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }

    const chatData = chatDoc.data() ?? {};
    const existingTags = (chatData.tags ?? {}) as Record<
      string,
      { index: number; value: string }
    >;

    const entryKey = Object.keys(existingTags).find(
      (key) => existingTags[key].value === tag,
    );

    if (entryKey === undefined) {
      res.status(404).json({ error: "Tag not found" });
      return;
    }

    await chatRef.update({
      [`tags.${entryKey}`]: admin.firestore.FieldValue.delete(),
    });

    res.json({ success: true, index: existingTags[entryKey].index, value: tag });
  },
);

export default router;
