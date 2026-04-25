import { Request, Response, NextFunction } from "express";
import { auth, firestore } from "../lib/firebase.js";
import { authenticatedApiLimiter } from "./rateLimiter.js";

export interface AuthenticatedRequest extends Request {
  uid?: string;
  orgId?: string;
  userData?: Record<string, unknown>;
}

const USER_CACHE_TTL_MS = 60_000;

interface CachedUser {
  data: Record<string, unknown> | null;
  expiresAt: number;
}

const userCache = new Map<string, CachedUser>();

export async function getCachedUserData(uid: string): Promise<Record<string, unknown> | null> {
  const cached = userCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  const doc = await firestore.collection("users").doc(uid).get();
  const data = doc.exists ? ((doc.data() as Record<string, unknown>) ?? null) : null;
  userCache.set(uid, { data, expiresAt: Date.now() + USER_CACHE_TTL_MS });
  return data;
}

export function invalidateUserCache(uid: string): void {
  userCache.delete(uid);
}

export async function requireFirebaseAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = await auth.verifyIdToken(token);
    req.uid = decoded.uid;
    const userData = await getCachedUserData(decoded.uid);
    req.userData = userData ?? undefined;
    req.orgId = userData?.org as string | undefined;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired Firebase token" });
  }
}

export function requireAuthWithRateLimit(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): void {
  requireFirebaseAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    authenticatedApiLimiter(req, res, next);
  });
}
