# Mikee

The business's marketer, in a conversation. The client talks with Mikee ("צריך יותר פניות", "יש קולקציה חדשה", "מה כדאי לקדם השבוע?"), and Mikee fills in the details from what he knows about the business and its results, prepares the campaign or post, and shows a small card to approve. Ad sets, creatives, IDs and permissions stay behind the scenes.

## How it works

```
Client ──chat──▶ Mikee (Claude) ──tools──▶ Platform server ──▶ Meta / website / store
                    │                         │
                    │  reads freely           │  spending or publishing = card only
                    ▼                         ▼
              The business's brain      One-tap approval ─▶ execution + budget check
```

- **The brain** (`src/lib/brain.ts`): long-term memory about the business: the business, its customers, writing style, products, goals, what worked, and what never to do. Mikee writes it himself, and the client can edit it on the "העסק שלי" (My business) screen.
- **Tools** (`src/lib/agent/tools.ts`): each tool has a schema (zod) that is validated before it runs, with errors returned in plain language. Reading (results, store, website, posts, audiences) is free. Anything that spends money or publishes goes through `propose_campaign` / `propose_change` / `propose_post`, and **only the server** executes it after the client approves (`src/lib/proposals.ts`).
- **The monthly budget** (`src/lib/budget.ts`): a ceiling the client sets by hand. Before every proposal, and again at the moment of approval, the system computes: spent this month + what running campaigns will spend through month end + the new spend. If that exceeds the ceiling, the action is blocked. Only a budget increase the client approves raises the ceiling.
- **Proactive recommendations** (`/api/cron/checkin`): a scheduled check-in. Mikee reviews results, stock and posts, and writes only when there is a business reason: what he noticed, what he suggests, and why it's good for the business, plus a card.
- **Onboarding**: connect Facebook and Instagram, choose the assets, add the website and store, set a budget. Then Mikee scans everything (website, products, orders, campaign history, posts), builds the brain, and opens with a conversation about goals.

Meta calls are checked against the official SDK [facebook-nodejs-business-sdk](https://github.com/facebook/facebook-nodejs-business-sdk) (Graph API v26.0).

## Running locally

```bash
npm install
cp .env.example .env.local    # fill in ANTHROPIC_API_KEY, SESSION_SECRET, MIKEE_ENCRYPTION_KEY
npm run create-user -- "Business name" "Owner name" owner@example.com "password"
npm run dev
```

Without `DATABASE_URL`, an embedded Postgres in `./.data` is used, with no extra installation.

## Deploying to Railway

Mikee's turns (a first scan, building a campaign) can take minutes, so the app runs as a regular server on Railway, which has no time limits like serverless functions.

1. New project on Railway → Deploy from GitHub repo → this repo. `railway.json` already defines build, start and health check.
2. Add Postgres to the project and link `DATABASE_URL` to the service.
3. Variables: everything in `.env.example`. `APP_URL` is the service's public address.
4. Create the user: `railway run npm run create-user -- "..." "..." email "password"`.
5. Proactive recommendations: in the same project, add a Cron service (for example `0 7,15 * * *`) that runs:
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/checkin`
6. In the Meta app, under Facebook Login, add the redirect address: `https://<APP_URL>/api/meta/callback`.

Netlify fits Mikee's public landing page (a separate site). The app itself stays on Railway.

## Meta connection

- `META_APP_ID` + `META_APP_SECRET`: shows a "התחברות עם פייסבוק" (Log in with Facebook) button and gets a long-lived token (about 60 days).
- For the pilot you can also paste a ready System User access token (in onboarding, under "יש לי מפתח גישה מוכן"), which doesn't expire.
- Tokens are stored encrypted (AES-256-GCM) and never reach the model.

## Higgsfield (generating images and video)

Set `HIGGSFIELD_MCP_URL` (and `HIGGSFIELD_MCP_TOKEN` if needed). Mikee will get Higgsfield's tools through Claude's MCP connector and can use the media it creates in posts and ads.

## Code structure

```
src/lib/agent/      prompt.ts (Mikee's constitution) · tools.ts · run.ts (the conversation loop)
src/lib/meta/       graph.ts (API client) · performance.ts (results in plain language) · actions.ts (launch, change, publish)
src/lib/            budget.ts · proposals.ts · brain.ts · website.ts · store.ts · conversation.ts
src/app/(app)/      mikee (main screen) · results · brand · settings
src/app/onboarding  getting connected
```
