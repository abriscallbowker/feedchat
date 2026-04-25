import { Router, type IRouter, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { firestore } from "../lib/firebase";
import { getOrgDoc } from "../lib/orgCache";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
} from "../middlewares/firebaseAuth";

const router: IRouter = Router();

router.post(
  "/team/add",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { email, role } = req.body as { email?: string; role?: string };

    if (!email || !role) {
      res.status(400).json({ error: "email and role are required" });
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

    const orgData = await getOrgDoc(orgId);
    const orgName = orgData?.name as string | undefined;

    const membersRef = firestore
      .collection("orgs")
      .doc(orgId)
      .collection("members");

    const membersSnapshot = await membersRef.count().get();
    if (membersSnapshot.data().count >= 50) {
      res
        .status(403)
        .json({ error: "Team member limit reached. A maximum of 50 members is allowed per organisation." });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    const docId = uuidv4();
    await Promise.all([
      firestore
        .collection("orgs")
        .doc(orgId)
        .collection("members")
        .doc(docId)
        .set({ email, role }),
      firestore
        .collection("users")
        .doc(normalizedEmail)
        .set({ email: normalizedEmail, org: orgId }),
    ]);

    res.json({ message: "Member added", id: docId });
  },
);

router.post(
  "/team/remove",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({ error: "email is required" });
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

    const orgData = await getOrgDoc(orgId);
    const orgName = orgData?.name as string | undefined;

    const membersRef = firestore
      .collection("orgs")
      .doc(orgId)
      .collection("members");

    const snapshot = await membersRef
      .where("email", "==", email)
      .limit(1)
      .get();

    if (snapshot.empty) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    await Promise.all([
      snapshot.docs[0].ref.delete(),
      firestore.collection("users").doc(normalizedEmail).delete(),
    ]);

    res.json({ message: "Member removed" });
  },
);

export default router;
