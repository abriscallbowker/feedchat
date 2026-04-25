import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./firebaseAuth.js";

function resolveIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = Array.isArray(forwarded)
    ? forwarded[0]
    : (forwarded?.split(",")[0] ?? req.socket.remoteAddress ?? "unknown");
  return ip.trim();
}

export const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  keyGenerator: resolveIp,
});

const chatLastRequestTime = new Map<string, number>();

export function chatCooldown(req: Request, res: Response, next: NextFunction): void {
  const ip = resolveIp(req);
  const now = Date.now();
  const last = chatLastRequestTime.get(ip);

  if (last !== undefined && now - last < 2000) {
    res.status(429).json({ error: "Please wait a moment before sending another message" });
    return;
  }

  chatLastRequestTime.set(ip, now);
  next();
}

export const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  keyGenerator: resolveIp,
});

export const authenticatedApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
  keyGenerator: (req: Request) => {
    const uid = (req as AuthenticatedRequest).uid;
    return uid ?? resolveIp(req);
  },
});
