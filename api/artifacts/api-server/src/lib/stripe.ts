import Stripe from "stripe";
import type { Request } from "express";

const globalIsLive = process.env.STRIPE_ENV === "live";

function makeClient(live: boolean): Stripe | null {
  const key = live
    ? process.env.STRIPE_LIVE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

const liveClient = makeClient(true);
const testClient = makeClient(false);

function clientForMode(live: boolean): Stripe {
  const client = live ? liveClient : testClient;
  if (!client) {
    throw new Error(`Missing Stripe secret key (isLive=${live})`);
  }
  return client;
}

export function isLocalhostRequest(req: Request): boolean {
  const origin = (req.headers.origin ?? req.headers.referer ?? "") as string;
  return /localhost|127\.0\.0\.1/.test(origin);
}

export function getStripeForRequest(req: Request): Stripe {
  const useLive = globalIsLive && !isLocalhostRequest(req);
  return clientForMode(useLive);
}

export function getPlanConfigForRequest(req: Request) {
  const useLive = globalIsLive && !isLocalhostRequest(req);
  return getPlanConfig(useLive);
}

export function getPlanConfig(live = globalIsLive) {
  if (live) {
    return {
      start: {
        productId: process.env.STRIPE_PROD_START_PRODUCT_ID!,
        priceId: process.env.STRIPE_PROD_START_PRICE_ID!,
      },
      scale: {
        productId: process.env.STRIPE_PROD_SCALE_PRODUCT_ID!,
        priceId: process.env.STRIPE_PROD_SCALE_PRICE_ID!,
      },
      pro: {
        productId: process.env.STRIPE_PROD_PRO_PRODUCT_ID!,
        priceId: process.env.STRIPE_PROD_PRO_PRICE_ID!,
      },
    };
  }
  return {
    start: {
      productId: process.env.STRIPE_TEST_START_PRODUCT_ID!,
      priceId: process.env.STRIPE_TEST_START_PRICE_ID!,
    },
    scale: {
      productId: process.env.STRIPE_TEST_SCALE_PRODUCT_ID!,
      priceId: process.env.STRIPE_TEST_SCALE_PRICE_ID!,
    },
    pro: {
      productId: process.env.STRIPE_TEST_PRO_PRODUCT_ID!,
      priceId: process.env.STRIPE_TEST_PRO_PRICE_ID!,
    },
  };
}

export function productIdToPlan(productId: string, live = globalIsLive): string | null {
  const plans = getPlanConfig(live);
  for (const [plan, cfg] of Object.entries(plans)) {
    if (cfg.productId === productId) return plan;
  }
  return null;
}

export const webhookSecret = {
  live: process.env.STRIPE_LIVE_WEBHOOK_SECRET!,
  test: process.env.STRIPE_TEST_WEBHOOK_SECRET!,
};

export const stripe = clientForMode(globalIsLive);
