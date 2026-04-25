import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export function internalJwt(req: Request, res: Response, next: NextFunction): void {
  const secret =
    process.env.INTERNAL_JWT_SECRET ??
    (process.env.NODE_ENV !== "production" ? "dev-internal-jwt-secret" : undefined);
  if (!secret) {
    req.log.error("internalJwt: INTERNAL_JWT_SECRET is not configured");
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or malformed Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    jwt.verify(token, secret, { algorithms: ["HS256"] });
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
