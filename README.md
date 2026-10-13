# Mikee

The business's marketer, in a conversation. The client talks with Mikee ("צריך יותר פניות", "יש קולקציה חדשה", "מה כדאי לקדם השבוע?"), and Mikee fills in the details from what he knows about the business and its results, prepares the campaign or post, and shows a small card to approve. Ad sets, creatives, IDs and permissions stay behind the scenes.

## How it works

```
Client ──chat──▶ job queue ──▶ Mikee (Claude) ──tools──▶ Platform server ──▶ Meta / website / store
                                    │                        │
                                    │  reads freely          │  spends or publishes = card only
                                    ▼                        ▼
                             Business brain      One-tap approval of an exact version ─▶ background execution
```

### Approvals (`src/lib/proposals.ts`, `src/lib/executor.ts`)
- **Every tool has an effect** (`read` / `memory` / `setup` / `proposal`). No tool spends money or publishes by itself. The only tool that writes to Meta directly is `meta_write`, and it blocks every path or field that spends, changes what's running, publishes, or touches the account (tested).
- **Mikee has no direct access to Higgsfield or any other external MCP.** Generating media goes through `propose_media`: a price quote first (`get_cost`), then a card, or, within a monthly amount the client approved in advance, it runs immediately.
- **A card is immutable.** The approval carries a `versionHash` of the exact action (media, text, audience, budget, dates, link). Any change from Mikee means a new card (`replaces`), and the old version can no longer be approved.
- **No duplicates.** Approval is a single atomic status change, so a double click or two tabs produce one execution. Execution saves a checkpoint after every object it creates. A retry or a restart resumes from the checkpoint or from an object tagged with the card's ID at Meta (`mk-xxxxxxxx`). For posts, it checks before republishing whether an identical text already went out. For media, a job ID that was already sent is never sent again.
- **No repeated suggestions.** Only one card can wait per topic (a unique index in the database). A suggestion the client declined doesn't come back for a week unless she asks.

### Monthly budget (`src/lib/budget.ts`)
The calculation is a projection. The policy:
- **spent:** what Meta reports for this month. Today is always counted as a full day, which covers the lag in Meta's reporting.
- **committed:** everything that can currently deliver, read live from Meta on every check, so changes made outside Mikee are included. Daily budget × days left in its window (a scheduled campaign counts from its start date). A lifetime budget counts what's left of it, prorated to this month.
- **Paused campaigns don't count.** Resuming one is new spend, requires a card, and passes the check.
- **A 10% safety margin** for daily variation in Meta's delivery.
- **Cards awaiting approval reserve their amount,** so two cards can't exceed the budget together.
- **A second check at the moment of execution,** against live numbers.
- **A hard ceiling at Meta:** the ad account's `spend_cap` is synced to the same ceiling (after a budget change, an increase, an execution, and on every cron run). Meta itself stops charges, including from changes made outside Mikee. The write is read back to verify it; the status appears in Settings. **It needs to be verified once on the real account in the pilot** (the units of the field).

AI costs have a separate monthly cap (Claude in dollars, calculated from `usage`; Higgsfield in credits). Mikee won't start a turn after the cap is reached.

### Background jobs (`src/lib/jobs.ts`, `src/lib/worker.ts`)
Every turn of Mikee's and every execution is a job in the database with a heartbeat. A worker inside the server (`src/instrumentation.ts`) claims jobs atomically (`FOR UPDATE SKIP LOCKED`). A job whose worker died is picked up again, and a turn resumes from its last completed step. The screen follows progress through `/api/jobs/:id` and reconnects after a refresh, a disconnect or a deploy.

### The brain (`src/lib/brain.ts`)
Simple sentences, each with a source (client / website / store / results / Mikee's own inference) and a date. What the client said is confirmed. What Mikee inferred is a suggestion until she approves it. Results become dated "learnings", never permanent rules, and get marked as stale after 60 days. Prices, stock and promotions aren't stored; they're re-checked before use.

### Meta connection
- Onboarding finds the business itself (a page whose website or name matches, the matching ad account, the most recently active pixel) and asks "Is this your business?".
- **Access can be lost at any time**, including with a token that has no planned expiry date (password change, permission removed, removal from the Business). Every Meta access error marks the connection as broken, the screens show "reconnect", and the cron job checks the token and each selected asset.

## Tests

```bash
npm test
```

33 tests against a real database (embedded Postgres) and a simulated Meta that records every call:
- `tests/approvals.test.ts`: tool classification and blocking, the version-bound approval, five simultaneous approvals → one campaign, a failure mid-run and retry without duplicates, adopting an orphaned campaign after a crash, a post retry only on the channel that failed, blocking repeated suggestions.
- `tests/budget.test.ts`: the projection (scheduled, paused, external changes), the ceiling, reservations for pending cards, the check at execution time, increases, and the hard ceiling at Meta.
- `tests/runtime.test.ts`: jobs (one turn at a time, atomic claiming, resuming after a dead worker), a full Mikee turn with a mocked model (no MCP in the request), the AI cap, and gating media generation (no paying twice).

**Not yet tested against the real services:** the actual Meta API, the Claude API, and Higgsfield's real MCP server. That's the first step of the pilot.

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
5. Maintenance and proactive recommendations: in the same project, add a Cron service (for example `0 7,15 * * *`). It checks the connection, syncs the hard ceiling at Meta (including at the start of a month), and queues a check-in:
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/checkin`
6. In the Meta app, under Facebook Login, add the redirect address: `https://<APP_URL>/api/meta/callback`.

Netlify fits Mikee's public landing page (a separate site). The app itself stays on Railway.

## Meta connection

- `META_APP_ID` + `META_APP_SECRET`: shows a "התחברות עם פייסבוק" (Log in with Facebook) button and gets a long-lived token (about 60 days).
- For the pilot you can also paste a ready System User access token (under "יש לי מפתח גישה מוכן", "I already have an access key"). This kind of token has no planned expiry date, but it can still be revoked. That's why there's monitoring and a "reconnect" screen.
- Tokens are stored encrypted (AES-256-GCM) and never reach the model.

## Higgsfield (generating images and video)

Set `HIGGSFIELD_MCP_URL` (and `HIGGSFIELD_MCP_TOKEN`). The **server** connects to Higgsfield as an MCP client (`src/lib/higgsfield.ts`), not the model. Created media is copied into our storage and served from `/api/media/:id`, so the server and Meta can always access it. In Settings: a monthly credit cap, and how many of them can be used without asking (default: 0, everything needs approval).

## Code structure

```
src/lib/agent/      prompt.ts (Mikee's constitution) · tools.ts · run.ts (the conversation loop)
src/lib/meta/       graph.ts (API client) · performance.ts (results in plain language) · actions.ts (launch, change, publish)
src/lib/            budget.ts · proposals.ts · brain.ts · website.ts · store.ts · conversation.ts
src/app/(app)/      mikee (main screen) · results · brand · settings
src/app/onboarding  getting connected
```
