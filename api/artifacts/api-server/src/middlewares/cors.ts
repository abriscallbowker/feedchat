import cors from "cors";
import { Request, Response, NextFunction } from "express";
import { resolveOrgIdFromHostname } from "../lib/hostnameCache.js";
import { ALLOWED_ORIGINS } from "../config.js";

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

async function isTenantOrigin(
  origin: string,
): Promise<{ allowed: boolean; orgId: string | null }> {
  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return { allowed: false, orgId: null };
  }

  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return { allowed: true, orgId: null };
  }

  const orgId = await resolveOrgIdFromHostname(hostname);
  return { allowed: orgId !== null, orgId };
}

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

  isTenantOrigin(origin)
    .then(({ allowed, orgId }) => {
      if (allowed) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type, Authorization",
        );
        res.setHeader("Vary", "Origin");

        if (orgId && !req.resolvedOrg) {
          req.resolvedOrg = { orgId };
        }

        if (req.method === "OPTIONS") {
          res.status(204).end();
          return;
        }
      }
      next();
    })
    .catch(() => next());
}
