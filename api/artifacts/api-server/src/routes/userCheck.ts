import { Router, type IRouter, Response } from "express";
import { auth, firestore } from "../lib/firebase.js";
import { requireFirebaseAuth, AuthenticatedRequest } from "../middlewares/firebaseAuth.js";

const router: IRouter = Router();

router.get(
  "/userCheck",
  requireFirebaseAuth,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.uid!;

    const doc = await firestore.collection("users").doc(uid).get();

    if (!doc.exists) {
      try {
        await auth.deleteUser(uid);
      } catch {
      }
      res.status(403).json({ error: "User must create an account first" });
      return;
    }

    res.status(200).json({ uid, exists: true });
  },
);

export default router;
