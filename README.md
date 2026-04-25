# Feedchat

An interactive chatbot to collect _better feedback_ from your users. 

Feedchat asks _follow-up questions_ to understand what users actually think. 

All feedback is captured and summarized in your private dashboard. 

Search, tag, and export feedback. Turning messy user input into actionable insights.

Feedchat can be used for:

- Bug report workflows
- Feature request workflows
- User cancellation flows
- An alternative to static surveys and forms

<img width="3830" height="2086" alt="dashboard" src="https://github.com/user-attachments/assets/d4f5db5b-4927-4508-98bc-89acff36f625" />
<p align="center"><em>Your private dashboard overview</em></p>
<img width="3830" height="2086" alt="chat-light" src="https://github.com/user-attachments/assets/a1dab53e-1e61-441e-a7c9-07785177f33b" />
<p align="center"><em>Example Feedchat in default light UI</em></p>
<img width="3830" height="2086" alt="chat-dark" src="https://github.com/user-attachments/assets/33b6b72c-3748-4d95-93f2-5f474eb75fb9" />
<p align="center"><em>Example Feedback in dark mode UI</em></p>
<img width="3830" height="2086" alt="chat-dark-example" src="https://github.com/user-attachments/assets/9450cf31-43e6-463c-a031-35eb143b3b14" />
<p align="center"><em>Example conversation between a user and Feedchat</em></p>
<img width="3830" height="2086" alt="feedback" src="https://github.com/user-attachments/assets/32dfdb35-6cde-4716-814d-0529fea78ee3" />
<p align="center"><em>Search, tag and export feedback</em></p>


# About the code

This code is **open source**. Use it as a launchpad to create a custom feedback chatbot. 

This codebase contains a self-contained workspace: **public chat** (`apps/public`), **admin dashboard** (`apps/dashboard`), **HTTP API** (`@feedchat/server`, mounted under `/api` on the public app), and shared UI (`packages/ui`).

## Prerequisites

- Node.js 20+
- npm 10+

Currently, the code integrates with OpenAI APIs for LLM functionality and Firebase for authentication and data storage. 

To integrate with OpenAI, you will need to create an account at [https://platform.openai.com](https://platform.openai.com) and create two API keys: one for powering Feedchat responses and another for chat summarisation and sentiment scoring -> see `.env.example`

To integrate with Firebase, you will need to create a project at [https://console.firebase.google.com/](https://console.firebase.google.com/) and create the following apps/tools inside your project: 

- Authentication (add the Sign-in methods: email/password and Google)
- Firestore (simply follow the instructions to create a production database in the region you desire)
- Realtime Database (simply follow the instructions to create a production database in the region you desire)

You do not need to mess with rules or any other logic inside Firebase. The server code handles all document logic. 

# Quick start

1. Clone/fork repo
2. Install dependencies at root of project
```bash
npm install
```
3. Create a local .env file
```bash
cp .env.example .env.local
```
4. Follow instructions in the file to create keys
5. Paste required keys into .env.local file
6. Run development (local) mode
```bash
npm run dev
```

## App structure
- **Dashboard:** [http://localhost:3001](http://localhost:3001) (`apps/dashboard`)
- **Public app + API:** [http://localhost:3002](http://localhost:3002) (`apps/public`)

Environment variables live in the **repository root** `.env.local`. Both Next apps load it via `loadEnvConfig` in their `next.config.ts`.

## Using a remote API

By default, browser calls on both the Public & Dashboard apps use http://localhost:3002/api (Express API at `apps/public/api`). 

You can set the value `NEXT_PUBLIC_FEEDCHAT_API_URL` in your .env to use a remote API endpoint, allowing you to migrate the server-side code away from Next.js if desired. 

## CORS in production

The API’s global CORS allowlist is localhost-oriented by default. 

For a production dashboard on another origin, set **`FEEDCHAT_ALLOWED_ORIGIN_REGEX`** (see `.env.example`). 

Tenant-scoped routes (e.g. feedback.example.com) still validate the browser `Origin` against your org hostnames.

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Turbo dev (all apps) |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript check |

## Layout

| Path | Role |
|------|------|
| `apps/public` | Feedback page |
| `apps/public/api` | API logic + routes |
| `apps/dashboard` | Admin dashboard |
| `apps/server` | Express API implementation (`@feedchat/server`) |
| `packages/ui` | Shared React components |
| `packages/api-base` | Shared `resolveFeedchatApiBase()` for clients |

## Licence

This repository includes an MIT `LICENSE` (see file header). Replace placeholder marketing/legal links in the dashboard UI before publishing your fork if they still point at third-party domains.
