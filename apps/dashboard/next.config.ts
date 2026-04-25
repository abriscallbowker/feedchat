import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(process.cwd(), "../..");
// Next loads env from the app dir first; @next/env caches that. Force reload so
// variables from the monorepo root `.env.local` are merged (see Next.js + @next/env).
loadEnvConfig(monorepoRoot, process.env.NODE_ENV !== "production", undefined, true);

const nextConfig: NextConfig = {
  transpilePackages: ["@feedchat/api-base", "@feedchat/ui"]
};

export default nextConfig;
