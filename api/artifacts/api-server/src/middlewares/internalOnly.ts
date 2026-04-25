import { Request, Response, NextFunction } from "express";

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function internalOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ip = req.socket.remoteAddress ?? "";
  if (LOOPBACK.has(ip)) {
    next();
    return;
  }
  res.status(403).json({ error: "Forbidden" });
}
