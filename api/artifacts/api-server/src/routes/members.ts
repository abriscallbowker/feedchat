import { Router, type IRouter, Response } from "express";
import { firestore } from "../lib/firebase.js";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth.js";

const router: IRouter = Router();

router.get(
  "/members",
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

    const snapshot = await firestore
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .get();

    const members = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json({ orgId, members });
  },
);

export default router;
