# Feedchat monorepo

Self-contained workspace: **public chat** (`apps/public`), **admin dashboard** (`apps/dashboard`), **HTTP API** (`@feedchat/server`, mounted under `/api` on the public app), and shared UI (`packages/ui`).

## Prerequisites

- Node.js 20+
- npm 10+

## Quick start

```bash
npm install
cp .env.example .env.local
# Edit `.env.local`.
# - For full functionality: set Firebase `NEXT_PUBLIC_*` keys + Firebase Admin keys, plus OpenAI keys.
# - For OSS/local demo mode: you can omit Firebase/OpenAI; the dashboard will use a local user and the API will use in-memory storage with mock chat replies.
# - `INTERNAL_JWT_SECRET` is optional in dev (defaults to a safe local value).
npm run dev
```

- **Dashboard:** [http://localhost:3001](http://localhost:3001) (`apps/dashboard`)
- **Public app + API:** [http://localhost:3002](http://localhost:3002) (`apps/public`; Express API at `/api`)

Environment variables live in the **repository root** `.env.local`. Both Next apps load it via `loadEnvConfig` in their `next.config.ts`.

### API base URL (no remote host by default)

- **Public app:** browser calls use **same origin** + `/api` unless `NEXT_PUBLIC_FEEDCHAT_API_URL` is set.
- **Dashboard:** defaults to `NEXT_PUBLIC_PUBLIC_APP_ORIGIN` + `/api` (see `.env.example`), which matches the public dev server in this monorepo.

Override `NEXT_PUBLIC_FEEDCHAT_API_URL` if the API is hosted elsewhere.

### CORS in production

The API’s global CORS allowlist is localhost-oriented by default. For a production dashboard on another origin, set **`FEEDCHAT_ALLOWED_ORIGIN_REGEX`** (see `.env.example`). Tenant-scoped routes (e.g. chat) still validate the browser `Origin` against your org hostnames.

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Turbo dev (all apps) |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |

## Layout

| Path | Role |
|------|------|
| `apps/public` | Next.js widget + `pages/api/*` → `@feedchat/server` |
| `apps/dashboard` | Next.js admin UI |
| `apps/server` | Express API implementation (`@feedchat/server`) |
| `packages/ui` | Shared React components |
| `packages/api-base` | Shared `resolveFeedchatApiBase()` for clients |

## Open source

This repository includes an MIT `LICENSE` (see file header). Replace placeholder marketing/legal links in the dashboard UI before publishing your fork if they still point at third-party domains.
