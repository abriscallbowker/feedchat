import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      resolvedOrg?: { orgId: string };
    }
  }
}

export async function resolveOrgIdFromRequest(
  req: Request,
): Promise<{ orgId: string } | { error: string; status: number }> {
  if (req.resolvedOrg) {
    return { orgId: req.resolvedOrg.orgId };
  }

  // OSS single-tenant mode:
  // - If the client provides orgId (optional), use it.
  // - Otherwise fall back to a single local org.
  const orgId =
    (req.body?.orgId as string | undefined)?.trim() ||
    ((req.headers["x-feedchat-org-id"] as string | undefined) ?? "").trim() ||
    "local-org";

  req.resolvedOrg = { orgId };
  return { orgId };
}
