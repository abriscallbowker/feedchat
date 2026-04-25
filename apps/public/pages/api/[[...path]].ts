import type { NextApiRequest, NextApiResponse } from "next";
import handler from "@feedchat/server/vercel-app";

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

export default function feedchatApiCatchAll(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  return handler(req, res);
}
