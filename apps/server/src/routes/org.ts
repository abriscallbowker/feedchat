import { Router, type IRouter, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import sharp from "sharp";
import { auth, firestore, rtdb, storage } from "../lib/firebase";
import {
  requireAuthWithRateLimit,
  AuthenticatedRequest,
  getCachedUserData,
  invalidateUserCache,
} from "../middlewares/firebaseAuth";
import { publicCorsMiddleware } from "../middlewares/cors";
import { moderateAndEnforceProfilePic } from "../lib/moderationService";
import { getOrgDoc, invalidateOrg } from "../lib/orgCache";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const router: IRouter = Router();

router.post(
  "/org/profilePic",
  requireAuthWithRateLimit,
  upload.any(),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const files = req.files as Express.Multer.File[] | undefined;
    const uploadedFile = files?.[0] ?? req.file;

    if (!uploadedFile) {
      res.status(400).json({ error: "image file is required" });
      return;
    }

    const mimeType = uploadedFile.mimetype;
    const originalName = uploadedFile.originalname ?? "";
    const ext = originalName.includes(".")
      ? originalName.slice(originalName.lastIndexOf(".")).toLowerCase()
      : "";

    const isMimeAllowed = mimeType in ALLOWED_MIME_TYPES;
    const isExtAllowed = ext === "" || ALLOWED_EXTENSIONS.has(ext);

    if (!isMimeAllowed || !isExtAllowed) {
      res.status(400).json({
        error: "Only .png, .jpg, .jpeg, and .webp files are allowed",
      });
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

    const imageBuffer = await sharp(uploadedFile.buffer)
      .resize(256, 256, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const contentType = "image/webp";

    const storagePath = `profilePics/${orgId}/profile`;
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    await file.save(imageBuffer, {
      metadata: { contentType },
      resumable: false,
    });

    res.json({ success: true, orgId, path: storagePath });

    moderateAndEnforceProfilePic(imageBuffer, storagePath, req.log).catch(
      (err) => req.log.error({ err }, "Unexpected error in moderation task"),
    );
  },
);

router.get(
  "/org/profilePic",
  publicCorsMiddleware,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "A valid Authorization header is required" });
      return;
    }

    const token = authHeader.slice(7);
    let uid: string;
    try {
      const decoded = await auth.verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      res.status(401).json({ error: "Invalid or expired Firebase token" });
      return;
    }

    const userData = await getCachedUserData(uid);
    if (!userData) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const orgId = (userData.org as string | undefined) ?? "";
    if (!orgId) {
      res.status(400).json({ error: "User has no associated org" });
      return;
    }

    const storagePath = `profilePics/${orgId}/profile`;
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).json({ error: "Profile picture not found" });
      return;
    }

    const [metadata] = await file.getMetadata();
    const contentType = (metadata.contentType as string | undefined) ?? "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");

    file.createReadStream().pipe(res);
  },
);

router.get(
  "/org",
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

    const orgDoc = await firestore.collection("orgs").doc(orgId).get();
    if (!orgDoc.exists) {
      res.status(404).json({ error: "Org not found" });
      return;
    }

    const { chats: _chats, members: _members, stripeCustomerId: _stripeCustomerId, stripeSubscriptionId: _stripeSubscriptionId, ...rootFields } = orgDoc.data()!;

    res.json({ ...rootFields });
  },
);

router.post(
  "/org/website",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { website } = req.body as { website?: string };

    if (!website) {
      res.status(400).json({ error: "website is required" });
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

    await firestore.collection("orgs").doc(orgId).update({ website });

    res.json({ orgId, website });

    invalidateOrg(orgId);
  },
);

router.post(
  "/org/supportLink",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { supportLink } = req.body as { supportLink?: string };

    if (!supportLink) {
      res.status(400).json({ error: "supportLink is required" });
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

    await firestore.collection("orgs").doc(orgId).update({ supportLink });

    res.json({ orgId, supportLink });

    invalidateOrg(orgId);
  },
);

router.post(
  "/org/fallbackUrl",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { url } = req.body as { url?: string };

    if (!url) {
      res.status(400).json({ error: "url is required" });
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

    await firestore.collection("orgs").doc(orgId).update({ fallbackUrl: url });

    res.json({ orgId, fallbackUrl: url });

    invalidateOrg(orgId);
  },
);

router.post(
  "/org/colorPalette",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { colorPalette } = req.body as { colorPalette?: string };

    if (!colorPalette) {
      res.status(400).json({ error: "colorPalette is required" });
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

    await firestore.collection("orgs").doc(orgId).update({ colorPalette });

    res.json({ orgId, colorPalette });

    invalidateOrg(orgId);
  },
);

router.post(
  "/org/accentColor",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { accentColor } = req.body as { accentColor?: string };

    if (!accentColor) {
      res.status(400).json({ error: "accentColor is required" });
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

    await firestore.collection("orgs").doc(orgId).update({ accentColor });

    res.json({ orgId, accentColor });

    invalidateOrg(orgId);
  },
);

router.post(
  "/org/name",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { name } = req.body as { name?: string };

    if (!name) {
      res.status(400).json({ error: "name is required" });
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

    await firestore.collection("orgs").doc(orgId).update({ name });

    res.json({ orgId, name });

    invalidateOrg(orgId);
  },
);

router.post(
  "/org/defaultMessage",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { defaultMessage } = req.body as { defaultMessage?: string };

    if (defaultMessage === undefined || defaultMessage === null) {
      res.status(400).json({ error: "defaultMessage is required" });
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

    await firestore.collection("orgs").doc(orgId).update({ defaultMessage });

    res.json({ orgId, defaultMessage });

    invalidateOrg(orgId);
  },
);

router.get(
  "/org/defaultMessage",
  publicCorsMiddleware,
  async (req: Request, res: Response): Promise<void> => {
    res.status(404).json({ error: "Not available in OSS single-tenant mode" });
  },
);

router.post(
  "/org",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.uid!;
    const { name, category, size } = req.body as {
      name?: string;
      category?: string;
      size?: string;
    };

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    let userEmail = "";
    try {
      const userRecord = await auth.getUser(uid);
      userEmail = userRecord.email ?? "";
    } catch {
      res.status(400).json({ error: "Could not retrieve user from Firebase Auth" });
      return;
    }

    const orgId = uuidv4();

    const orgRef = firestore.collection("orgs").doc(orgId);
    await orgRef.set({
      id: orgId,
      name,
      category: category ?? "",
      size: size ?? "",
      plan: "free",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        voiceMinutes: 0,
      },
    });

    await orgRef.collection("members").add({
      email: userEmail,
      role: "owner",
    });

    await firestore.collection("users").doc(uid).set({ org: orgId }, { merge: true });
    invalidateUserCache(uid);

    res.status(201).json({ orgId, name, category, size, plan: "free" });
  },
);

router.post(
  "/org/budgetCap",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.uid!;
    const { budgetCap } = req.body as { budgetCap?: unknown };

    if (budgetCap === undefined || budgetCap === null) {
      res.status(400).json({ error: "budgetCap is required" });
      return;
    }

    const cap = Number(budgetCap);
    if (!Number.isFinite(cap) || cap < 0) {
      res.status(400).json({ error: "budgetCap must be a non-negative number" });
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

    let userEmail = "";
    try {
      const userRecord = await auth.getUser(uid);
      userEmail = userRecord.email ?? "";
    } catch {
      res.status(400).json({ error: "Could not retrieve user from Firebase Auth" });
      return;
    }

    const membersSnap = await firestore
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .where("email", "==", userEmail)
      .where("role", "==", "owner")
      .limit(1)
      .get();

    if (membersSnap.empty) {
      res.status(403).json({ error: "Must be account owner to do this action." });
      return;
    }

    const orgData = await getOrgDoc(orgId);
    if (!orgData) {
      res.status(404).json({ error: "Org not found" });
      return;
    }
    const plan = (orgData.plan as string | undefined) ?? "";
    const sub = (orgData.subscription as Record<string, unknown> | undefined) ?? {};
    const creditLimit = (sub.creditLimit as number | undefined) ?? 0;
    const existingRate = (sub.additionalCreditRate as number | undefined) ?? 1;

    const PLAN_ADDITIONAL_CREDIT_RATES: Record<string, number> = {
      start: 0.1,
      scale: 0.05,
      pro: 0.25,
    };
    const additionalCreditRate = PLAN_ADDITIONAL_CREDIT_RATES[plan] ?? existingRate;

    const additionalCreditLimit = additionalCreditRate > 0 ? cap / additionalCreditRate : 0;
    const totalCreditLimit = creditLimit + additionalCreditLimit;

    await firestore.collection("orgs").doc(orgId).update({
      "subscription.budgetCap": cap,
      "subscription.additionalCreditRate": additionalCreditRate,
      "subscription.additionalCreditLimit": additionalCreditLimit,
      "subscription.totalCreditLimit": totalCreditLimit,
    });

    res.json({ budgetCap: cap, additionalCreditRate, additionalCreditLimit, totalCreditLimit });

    invalidateOrg(orgId);
  },
);

router.post(
  "/org/delete",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.uid!;

    if (!req.userData) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const orgId = req.orgId;
    if (!orgId) {
      res.status(400).json({ error: "User has no associated org" });
      return;
    }

    let ownerEmail = "";
    try {
      const userRecord = await auth.getUser(uid);
      ownerEmail = userRecord.email ?? "";
    } catch {
      res.status(400).json({ error: "Could not retrieve user from Firebase Auth" });
      return;
    }

    const membersSnap = await firestore
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .where("email", "==", ownerEmail)
      .where("role", "==", "owner")
      .limit(1)
      .get();

    if (membersSnap.empty) {
      res.status(403).json({ error: "Must be account owner to do this action." });
      return;
    }

    const orgData = await getOrgDoc(orgId);
    const plan = orgData?.plan as string | undefined;

    const orgUsersSnap = await firestore
      .collection("users")
      .where("org", "==", orgId)
      .get();

    const memberUids = orgUsersSnap.docs.map((d: any) => d.id);

    const allMembersSnap = await firestore
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .get();

    const memberEmails = allMembersSnap.docs
      .map((d: any) => d.data()?.email as string | undefined)
      .filter((e: any): e is string => !!e);

    await Promise.all([
      rtdb.ref(`chats/${orgId}`).remove(),
      rtdb.ref(`pendingSummaries/${orgId}`).remove(),
    ]);

    const orgRef = firestore.collection("orgs").doc(orgId);
    await firestore.recursiveDelete(orgRef);

    invalidateOrg(orgId);

    const userDeleteBatch = firestore.batch();
    for (const doc of orgUsersSnap.docs) {
      userDeleteBatch.delete(doc.ref);
    }
    await userDeleteBatch.commit();

    for (const memberUid of memberUids as any[]) {
      invalidateUserCache(memberUid);
    }

    await Promise.allSettled((memberUids as any[]).map((memberUid) => auth.deleteUser(memberUid)));

    res.json({ success: true });
  },
);

router.post(
  "/org/wipe",
  requireAuthWithRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const uid = req.uid!;

    if (!req.userData) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const orgId = req.orgId;
    if (!orgId) {
      res.status(400).json({ error: "User has no associated org" });
      return;
    }

    let ownerEmail = "";
    try {
      const userRecord = await auth.getUser(uid);
      ownerEmail = userRecord.email ?? "";
    } catch {
      res.status(400).json({ error: "Could not retrieve user from Firebase Auth" });
      return;
    }

    const membersSnap = await firestore
      .collection("orgs")
      .doc(orgId)
      .collection("members")
      .where("email", "==", ownerEmail)
      .where("role", "==", "owner")
      .limit(1)
      .get();

    if (membersSnap.empty) {
      res.status(403).json({ error: "Must be account owner to do this action." });
      return;
    }

    const orgRef = firestore.collection("orgs").doc(orgId);

    await Promise.all([
      rtdb.ref(`chats/${orgId}`).remove(),
      rtdb.ref(`pendingSummaries/${orgId}`).remove(),
    ]);

    await Promise.all([
      firestore.recursiveDelete(orgRef.collection("chats")),
      firestore.recursiveDelete(orgRef.collection("summary")),
    ]);

    await orgRef.update({
      inputTokens: 0,
      outputTokens: 0,
      creditsUsed: 0,
    });

    res.json({ success: true });

    invalidateOrg(orgId);
  },
);

export default router;
