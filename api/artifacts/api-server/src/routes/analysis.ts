import { Router, type IRouter, Response } from "express";
import { firestore } from "../lib/firebase.js";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth.js";

const router: IRouter = Router();

router.get(
  "/analysis",
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

    const limitStr = req.query.limit as string | undefined;
    const cursor = req.query.cursor as string | undefined;
    const pageSize = limitStr ? Math.max(1, parseInt(limitStr, 10)) : undefined;

    let query = firestore
      .collection("orgs")
      .doc(orgId)
      .collection("chats")
      .orderBy("dateTime", "desc");

    if (cursor) {
      query = query.startAfter(cursor) as typeof query;
    }

    if (pageSize) {
      query = query.limit(pageSize) as typeof query;
    }

    const snapshot = await query.get();
    const chats = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        chatId: doc.id,
        dateTime: d.dateTime,
        sentimentScore: d.sentimentScore,
        summary: d.summary,
        tags: d.tags ?? {},
      };
    });

    const nextCursor =
      pageSize && snapshot.docs.length === pageSize
        ? (snapshot.docs[snapshot.docs.length - 1].data().dateTime as string)
        : null;

    res.json({ orgId, chats, nextCursor });
  },
);

export default router;
