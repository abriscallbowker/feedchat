# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: Firebase Firestore + Realtime Database (via firebase-admin)
- **AI**: OpenAI (chat streaming, voice/whisper, summaries)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection (legacy)
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Environment Variables / Secrets Required

- `OPENAI_API_KEY` — OpenAI API key
- `OPENAI_MODERATION_API_KEY` — OpenAI API key used exclusively for image moderation (omni-moderation-latest)
- `FIREBASE_PROJECT_ID` — Firebase project ID
- `FIREBASE_CLIENT_EMAIL` — Firebase service account email
- `FIREBASE_PRIVATE_KEY` — Firebase service account private key
- `FIREBASE_DATABASE_URL` — Firebase Realtime Database URL
- `LOOPS_API_KEY` — Loops.so API key (contact creation + events)
- `TELEGRAM_BOT_TOKEN` — Telegram bot token for signup notifications
- `TELEGRAM_CHAT_ID` — Telegram chat/channel ID to receive notifications
- `VERCEL_EDGE_CONFIG_ID` — Vercel Edge Config store ID (for middleware caching)
- `VERCEL_API_TOKEN` — Vercel API token with read/write access to the Edge Config store

## API Endpoints

All routes are mounted at `/api`. Hosted at `api.lifecycle.inc`.
CORS is restricted to `localhost`, `feedchat.io`, and `lifecycle.inc`.

### No auth required (uses orgId from body)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/chat | Streaming chat via OpenAI; saves to RTDB + updates Firestore usage |
| POST | /api/voice | Voice session via OpenAI audio; saves to RTDB + updates Firestore usage |
| POST | /api/summary | Summarises a chat session (90s idle gate); saves to Firestore |

### Firebase auth required (Bearer token → uid → orgId lookup)

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/analysis | Returns all chat docs (dateTime, sentimentScore, summary) with optional pagination |
| GET | /api/sentiment | Returns sum of all sentimentScore values for the org |
| GET | /api/org | Returns root fields of the org document |
| POST | /api/org | Creates a new org; adds requesting user as owner member |
| GET | /api/members | Returns all members of the org |
| PUT | /api/members | Add, update, or delete a member (action: "add"/"update"/"delete") |
| GET | /api/user | Returns user document from Firestore |
| POST | /api/user | Creates a user document in Firestore |
| GET | /api/checkout | Creates a Stripe Checkout session (embedded); returns clientSecret. Query: ?plan=start|scale|pro |
| POST | /api/subscribe | Verifies completed Stripe session and updates org plan in Firestore. Body: {sessionId} |

### No auth required (Stripe webhook listeners)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/stripe | Live Stripe webhook — handles subscription created/updated/deleted; updates org plan |
| POST | /api/stripe-sandbox | Test Stripe webhook — same logic using test keys/secrets |

## Stripe Config

- `STRIPE_ENV` env var controls which keys are active: `"test"` (default) or `"live"`
- Plan → product ID mapping lives in `artifacts/api-server/src/lib/stripe.ts` via `getPlanConfig()`
- Webhook raw body parsing is handled before JSON middleware in `app.ts`
- Plans: `"start"`, `"scale"`, `"pro"`, `"cancelled"` (set when subscription actually ends)

## Firestore Schema

- `/orgs/{orgId}` — org root fields (id, name, plan, website, usage{inputTokens, outputTokens, voiceMinutes})
- `/orgs/{orgId}/chats/{chatId}` — summarised chat (dateTime, inputTokens, outputTokens, sentimentScore, summary, voiceMinutes)
- `/orgs/{orgId}/members/{memberId}` — member (email, role)
- `/users/{uid}` — user (email, name, signUpDate, org)

## Realtime Database Schema

- `/chats/{orgId}/{chatId}` — live chat session (dateTime, inputTokens, outputTokens, voiceMinutes, summarized, summaryStatus, lastMessageAt, index/{n}/{user, agent, ...})

## Config

- `artifacts/api-server/src/config.ts` — change `OPENAI_CHAT_MODEL` and `OPENAI_SUMMARY_MODEL` here to switch models globally
- Current model: `gpt-4o-mini` for chat and summaries

## Integrations

### Loops.so (`artifacts/api-server/src/lib/loops.ts`)
- `createContact(email, companyName?)` — creates a contact in Loops with optional `companyName` custom property
- `sendEvent(email, eventName, companyName?)` — sends a named event to Loops with optional `companyName`
- Fired non-blocking (fire-and-forget) after successful route responses

### Vercel Edge Config (`artifacts/api-server/src/lib/edgeConfig.ts`)
- `syncOrgToEdgeConfig(orgId)` — fetches the org document + all hostnames/custom domains for the org from Firestore, then batch-upserts an entry per hostname key into the Vercel Edge Config store
- `removeHostnamesFromEdgeConfig(hostnames[])` — batch-deletes the given hostname keys from the Edge Config store
- Both have `…Async` fire-and-forget wrappers used in routes
- Triggered after every update to: `website`, `supportLink`, `colorPalette`, `accentColor`, `plan` (Stripe webhook + subscribe), hostname assignment, custom domain add/delete
- Requires `VERCEL_EDGE_CONFIG_ID` and `VERCEL_API_TOKEN` env vars; logs a warning and skips gracefully if unset

### Telegram (`artifacts/api-server/src/lib/telegram.ts`)
- `sendTelegramMessage(text)` — sends a message to the configured chat via the bot
- Fired non-blocking after successful POST /user

### Trigger summary

| Route | Loops | Telegram |
|-------|-------|----------|
| POST /user (success) | `createContact(email, orgName)` | `sendTelegramMessage("User signed up ✨")` |
| POST /team/add (success) | `createContact(email, orgName)` + `sendEvent(email, "teamAdd", orgName)` | — |
| POST /team/remove (success) | `sendEvent(email, "teamRemove", orgName)` | — |

## Key Files

- `artifacts/api-server/src/lib/firebase.ts` — Firebase Admin SDK init
- `artifacts/api-server/src/config.ts` — model names, CORS origins, idle timeout
- `artifacts/api-server/src/middlewares/cors.ts` — CORS restriction
- `artifacts/api-server/src/middlewares/firebaseAuth.ts` — Firebase token verification
- `artifacts/api-server/src/routes/` — all route handlers
