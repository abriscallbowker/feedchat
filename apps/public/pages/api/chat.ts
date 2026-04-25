import type { NextApiRequest, NextApiResponse } from "next";
import jwt from "jsonwebtoken";
import { checkBotId } from "botid/server";
import handler from "@feedchat/server/vercel-app";

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default async function chatApi(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "OPTIONS") {
    return handler(req, res);
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).end();
  }

  const { isBot } = await checkBotId({
    advancedOptions: { headers: req.headers },
  });
  if (isBot) {
    return res.status(403).json({ error: "Access denied" });
  }

  const secret =
    process.env.INTERNAL_JWT_SECRET?.trim() ||
    (process.env.NODE_ENV !== "production" ? "dev-internal-jwt-secret" : "");
  if (!secret) {
    return res.status(500).json({ error: "Server misconfigured" });
  }

  const token = jwt.sign({ source: "vercel" }, secret, {
    algorithm: "HS256",
    expiresIn: "30s",
  });
  req.headers.authorization = `Bearer ${token}`;

  return handler(req, res);
}
