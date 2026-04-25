import cors from "cors";
import { Request, Response, NextFunction } from "express";
import { ALLOWED_ORIGINS } from "../config";

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    const allowed = ALLOWED_ORIGINS.some((pattern) => {
      if (typeof pattern === "string") return pattern === origin;
      return pattern.test(origin);
    });
    if (allowed) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
});

export const publicCorsMiddleware = cors({
  origin: "*",
  credentials: false,
});

export function dynamicTenantCors(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const origin = req.headers.origin;

  if (!origin) {
    next();
    return;
  }

  // OSS single-tenant mode: allow any Origin for public chat endpoint.
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}
