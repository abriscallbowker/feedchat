import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";

const monorepoRoot = path.resolve(process.cwd(), "../..");
loadEnvConfig(monorepoRoot, process.env.NODE_ENV !== "production", undefined, true);

const nextConfig: NextConfig = {
  transpilePackages: ["@feedchat/api-base", "@feedchat/ui", "@feedchat/server"],
  serverExternalPackages: ["firebase-admin", "sharp", "pino", "pino-pretty"],
};

export default withBotId(nextConfig);
