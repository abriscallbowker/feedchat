import { Router, type IRouter, Response } from "express";
import { auth, firestore } from "../lib/firebase.js";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
  invalidateUserCache,
} from "../middlewares/firebaseAuth.js";
import { getOrgDoc } from "../lib/orgCache.js";
import { createContact, sendEvent } from "../lib/loops.js";
import { sendTelegramMessage } from "../lib/telegram.js";

const router: IRouter = Router();

router.get(
  "/user",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.uid!;

    const doc = await firestore.collection("users").doc(uid).get();
    if (!doc.exists) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ uid, ...doc.data() });
  },
);

router.post(
  "/user",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.uid!;
    const { email, signUpDate, org, role } = req.body as {
      email?: string;
      signUpDate?: string;
      org?: string;
      role?: string;
    };

    if (!email || !signUpDate) {
      res.status(400).json({ error: "email and signUpDate are required" });
      return;
    }

    const userData: Record<string, unknown> = {
      email,
      signUpDate,
      notifications: {
        billing: true,
        newFeedback: true,
        dataExports: true,
      },
    };

    if (role) {
      userData.role = role;
    }

    let orgName: string | undefined;

    if (org) {
      userData.org = org;
      const orgData = await getOrgDoc(org);
      orgName = orgData?.name as string | undefined;
    } else {
      const normalizedEmail = email.trim().toLowerCase();
      const draftDoc = await firestore.collection("users").doc(normalizedEmail).get();

      if (draftDoc.exists && draftDoc.data()?.org) {
        userData.org = draftDoc.data()!.org;
        const orgData = await getOrgDoc(userData.org as string);
        orgName = orgData?.name as string | undefined;
        firestore.collection("users").doc(normalizedEmail).delete().catch(() => {});
      } else {
        await auth.deleteUser(uid);
        res.status(403).json({ error: "User is not associated with any organization" });
        return;
      }
    }

    await firestore.collection("users").doc(uid).set(userData, { merge: true });
    invalidateUserCache(uid);

    res.status(201).json({ uid, ...userData });

    createContact(email, orgName);
    sendEvent(email, "signUp", orgName ? { orgName } : undefined);
    sendTelegramMessage("User signed up ✨");
  },
);

router.post(
  "/user/notifications",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.uid!;
    const { billing, newFeedback, dataExports } = req.body as {
      billing?: boolean;
      newFeedback?: boolean;
      dataExports?: boolean;
    };

    const updates: Record<string, boolean> = {};

    if (typeof billing === "boolean") updates["notifications.billing"] = billing;
    if (typeof newFeedback === "boolean") updates["notifications.newFeedback"] = newFeedback;
    if (typeof dataExports === "boolean") updates["notifications.dataExports"] = dataExports;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "At least one notification field (billing, newFeedback, dataExports) must be provided" });
      return;
    }

    if (!req.userData) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userRef = firestore.collection("users").doc(uid);
    await userRef.update(updates);
    invalidateUserCache(uid);

    const updatedDoc = await userRef.get();
    res.json({ uid, notifications: updatedDoc.data()?.notifications ?? {} });
  },
);

export default router;
