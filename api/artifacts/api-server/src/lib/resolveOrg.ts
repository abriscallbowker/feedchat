import { Request } from "express";
import { resolveOrgIdFromHostname } from "./hostnameCache.js";

declare global {
  namespace Express {
    interface Request {
      resolvedOrg?: { orgId: string };
    }
  }
}

export function hostnameToDocId(hostname: string): string {
  return hostname.replace(/\./g, "_");
}

function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export async function resolveOrgIdFromRequest(
  req: Request,
): Promise<{ orgId: string } | { error: string; status: number }> {
  if (req.resolvedOrg) {
    return { orgId: req.resolvedOrg.orgId };
  }

  const origin = req.headers.origin as string | undefined;

  if (!origin) {
    return { error: "Missing Origin header", status: 400 };
  }

  let hostname: string;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return { error: "Invalid Origin header", status: 400 };
  }

  if (isLocalhost(hostname)) {
    const orgId = req.body?.orgId as string | undefined;
    if (!orgId) {
      return {
        error: "orgId is required in request body for localhost requests",
        status: 400,
      };
    }
    req.resolvedOrg = { orgId };
    return { orgId };
  }

  const orgId = await resolveOrgIdFromHostname(hostname);

  if (!orgId) {
    return {
      error: `No organisation found for hostname: ${hostname}`,
      status: 404,
    };
  }

  req.resolvedOrg = { orgId };
  return { orgId };
}
