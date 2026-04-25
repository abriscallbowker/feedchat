import { Request, Response, NextFunction } from "express";

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers["x-api-key"];

  if (!process.env.SUMMARY_API_KEY) {
    req.log.error("apiKeyAuth: SUMMARY_API_KEY is not configured");
    res.status(500).json({ error: "Server misconfiguration" });
    return;
  }

  if (!key || key !== process.env.SUMMARY_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}
