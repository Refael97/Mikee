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

### The team (`src/lib/agent/`)
On the front end there's only Mikee. In the back end, Mikee is a manager (`run.ts`, medium thinking effort) who understands the need, decides, and hands the work to specialists (`specialists.ts`, high thinking effort):

| Specialist | Responsible for | Can create cards |
|---|---|---|
| Copywriter | Text for ads, reels and posts | — |
| Media buyer | Building campaigns and changing running ones | Campaign, change |
| Creative | Choosing existing visuals or creating new ones | Media (costs credits) |
| Social | Organic posts, reels, carousels | Post |
| Analyst | Results, diagnosis, budget, stock, market research | — |

Each specialist gets the business brief (`brief.ts`), its own professional instructions, Mikee's task, and only the tools its job needs. It doesn't see the conversation with the client and can't delegate further. All specialists run on the same loop (`loop.ts`) and go through the same safety layer: cards, budget, versions. Every task is logged in `agent_runs`, and its cost is logged per agent. The client sees neutral wording ("Mikee is analyzing the results"), never the team.

### Conversations (`src/lib/conversations.ts`, `src/components/Sidebar.tsx`, `Composer.tsx`)
- **Separate conversations:** each new conversation gets its own address, with the history on the right grouped by category: campaigns, content and posts, results and data, the business, general.
- **Automatic filing in two layers:**
  1. A quick keyword-based guess the moment the conversation opens.
  2. In his first turn, Mikee gives an accurate title and category through `file_conversation`.
  - If the client moves a conversation herself, it's locked (`auto=false`) and Mikee won't change it.
- **What's shared across conversations:**
  - Each conversation sends the model only its own history.
  - The brain, the cards and a list of recent conversations are shared.
  - A card reports its result in the conversation it came from.
  - Different conversations can run in parallel. Within the same conversation, one turn at a time.
- **Composer:**
  - The + button attaches files or a photo. You can also drag a file in or paste one.
  - Hebrew voice dictation via the browser.
  - Images and PDFs reach the model as real content. Text files arrive as text. A video or other file arrives as a link Mikee can use in ads and posts.
- **Every scheduled check-in** opens a new "Mikee's recommendations" conversation, which is deleted if there's nothing to say.

### Mikee reaches out on his own (`src/lib/proactive.ts`)
Every hour the cron asks each business whether there's a reason to talk now. Reasons, by priority:

| Reason | When | Where it's written |
|---|---|---|
| The Meta connection was lost | Once a day while it's broken | New conversation |
| A card failed and wasn't retried | 2 hours after the failure, once per attempt | The card's conversation |
| A card has been waiting for an answer | After 24 hours, once per card | The card's conversation |
| Monthly summary and plan | Days 1–3 of the month | New conversation |
| Weekly summary | Sunday from 09:00 (replaces that morning's check) | New conversation |
| Morning check | Every day from 08:00. If there's nothing to say, nothing is shown and it doesn't count | New conversation |
| A client who has gone quiet | 4 days without a message, once per silence | New conversation |

Limits:
- Quiet hours are 21:00 to 08:00 local time.
- At most 2 a day, and one per cron run.
- Never interrupts a conversation where Mikee is already working.
- The `nudges` table (unique per reason and key) makes sure the same reason never fires twice, even with two cron runs in parallel.

A conversation Mikee started is marked as new: a dot in the list, and a note that slides in on every screen ("מייקי כתב לך") with the opening words. If the conversation is already open, the message appears live as it's written.

### The marketing path (`src/lib/journey.ts`)
Mikee always knows where the business stands. The path has five stages:
1. **Foundations:** site tracking, a clear offer, a tidy profile, a catalog.
2. **New audience:** a first campaign, testing creative, short videos.
3. **Interest to purchase:** retargeting, catalog ads, an instant lead form, a matching landing page.
4. **Repeat customers:** a members club or email collection, a customer list as an audience, an offer for returning customers, a regular posting rhythm.
5. **Growth:** lookalike audiences, scaling what works, a seasonal calendar, customer reviews.

How it's tracked and used:
- **Tracking and focus:** every step is stored with its status. Mikee keeps the business type and the client's current focus through `update_journey`.
- **Automatic detection:** some steps are picked up from what the platform can see, such as a connected pixel or a launched campaign.
- **In the brief:** the brief every agent receives includes where the business stands, how long it has worked with Mikee (first week, getting started, established), what's done, what's in progress, and the next natural steps.
- **Next steps:** the prompt teaches Mikee to propose the next step at the right time, one at a time and tied to the client's focus. For example, a sales campaign that has been running for a week leads to retargeting, and traffic leads to a members club.
- **Nudge when things stall:** if nothing has moved for 5 days and no card is waiting, the proactive engine prompts Mikee to suggest the next step (`next_step`).
- **In the UI:** "The business" page shows the plan (the five stages, where we are, and what's next), and a new conversation opens with "Mikee suggests continuing".

### The content library (`src/lib/library.ts`, `src/lib/storage.ts`, `src/lib/google.ts`)
- **Getting files in:** upload, drag and drop, or attach in the chat. Images and videos land in the library, and media Mikee creates is saved there too.
- **Storage:** a private S3/R2 bucket under each business's prefix. A per-plan quota is enforced on every save (2/5/10GB, `src/lib/plans.ts`).
- **Searchable descriptions:** Mikee describes every new image once (a background job), so it can be found by what's in it. `search_library` is available to Mikee, the creative director, the social manager and the media buyer, and they search the library before creating anything new.
- **Google Drive:** connects with the narrowest permission (`drive.file`). The client picks files in Google's own picker, and only those files are copied into the library.

### Results and campaigns (`src/lib/dashboard.ts`, `src/lib/platforms.ts`)
- **The results page:** Mikee picks 3 or 4 numbers that matter for this business type (`set_dashboard`), plus a one-line headline. Each number is compared fairly against the same days last month, alongside the month's daily rhythm, what's waiting for approval, and the next step. There's no configuration and no clutter.
- **The campaigns page:** campaigns from every platform behind one interface. Meta is live today; Google and TikTok are already reserved.

### Account, help and connectors
- **Profile:** details, plan and usage (storage, AI, credits), connected assets, password change, recent account activity, and sign out of all devices.
- **Help:** a side panel with frequently asked questions, a message to support (stored in `support_requests` and forwarded to `SUPPORT_WEBHOOK_URL`), email and WhatsApp.
- **Connectors in settings:** live ones (Meta, website, store, Google Drive) and upcoming ones (email, Google Ads, TikTok, WhatsApp Business, Canva, Dropbox).

### Security (`src/lib/guard.ts`, `src/lib/net.ts`, `src/lib/filetype.ts`, `src/middleware.ts`)
- **Uploaded files:** the type is checked from the bytes, never from the name or the browser. Only images, video, PDF and text/CSV are accepted, and HTML and SVG are refused.
- **Serving files:** files are served with `nosniff` and a sandbox, and documents download as files. Images and videos get a signed link (for Meta); everything else requires a login and ownership by the same business.
- **Server network requests:** they go through a guard that blocks internal addresses, cloud metadata, non-standard ports and redirects to them, and caps size and time. The check repeats at connection time, which defeats DNS tricks.
- **`meta_write`:** an allowlist of creation types on the business's own assets with specific fields. It can't change budgets or statuses, publish, use the batch API, or smuggle parameters into the path.
- **Tokens:** they never reach the model; `stripTokens` removes them from every response. The Graph token travels in a header, not a URL.
- **Text from outside:** sites, posts, comments, files, store and library content are wrapped in `<untrusted>`. Client messages that imitate a platform event are neutralised, and invisible characters are removed.
- **Protecting the instructions:** a canary marker and filter — an answer that quotes the instructions isn't saved. Mikee can't erase rules the client wrote herself.
- **Rate limits:** per business and per IP, stored in the database so they hold across servers (messages, uploads, approvals, login, support). A cap on concurrent turns. Text length and attachment count limits, and a zod schema with a size cap on every request body.
- **Login and sessions:** login is limited per email and per IP, and takes the same time whether the email exists or not. Sessions have a version, so changing the password or signing out of all devices disconnects every other session. The cookie is always `secure`.
- **Requests and headers:**
  - every write checks `Origin` (CSRF)
  - CSP with a fresh nonce per page
  - HSTS
  - no framing
  - no image proxy
  - errors don't leak details
- **Plan limits:** a client can't raise their own AI limits above what the plan includes.
- `npm audit`: 0 known vulnerabilities (with a PostCSS override).

### Liveliness (`src/components/Live.tsx`)
- **Image or video being created:** a dot grid with a diagonal band of light, and a status that changes ("מסדר את האור", "מלטש פרטים"). When it's ready, the images appear with a blur-to-sharp transition.
- **While Mikee works:** a list of steps. Each one shows a shimmering status that changes as the work goes on, and turns into a check when it finishes.
- **Text appears word by word** with a soft fade-in.
- **Quick replies:** Mikee ends a question with `[[כן, תכין | אחר כך]]` and the client gets ready-made buttons.
- **Success:** a check that pops, and a short glow on the card.

### Approvals (`src/lib/proposals.ts`, `src/lib/executor.ts`)
- **Every tool has an effect** (`read` / `memory` / `setup` / `proposal`). No tool spends money or publishes by itself. The only tool that writes to Meta directly is `meta_write`, and it blocks every path or field that spends, changes what's running, publishes, or touches the account (tested).
- **Mikee has no direct access to Higgsfield or any other external MCP.** Generating media goes through `propose_media`: a price quote first (`get_cost`), then a card, or, within a monthly amount the client approved in advance, it runs immediately.
- **A card is immutable.** The approval carries a `versionHash` of the exact action (media, text, audience, budget, dates, link). Any change from Mikee means a new card (`replaces`), and the old version can no longer be approved.
- **No duplicates.** Approval is a single atomic status change, so a double click or two tabs produce one execution. Execution saves a checkpoint after every object it creates. A retry or a restart resumes from the checkpoint or from an object tagged with the card's ID at Meta (`mk-xxxxxxxx`). For posts, it checks before republishing whether an identical text already went out. For media, a job ID that was already sent is never sent again.
- **No repeated suggestions.** Only one card can wait per topic (a unique index in the database). A suggestion the client declined doesn't come back for a week unless she asks.

### A campaign goes live in two approvals (`src/lib/executor.ts`, `src/lib/meta/actions.ts`)
Following the Meta developer handoff (section 7):
1. **Building.** The campaign card is approved, and Mikee builds the campaign, the ad set, the creatives and the ads. **Every object is created paused**, and each ID is saved as soon as it is returned.
2. **Read-back.** The platform reads everything back from Meta and compares it with the approval: budget in minor units, dates, nothing live, and every ad present. It also reports Meta's review status in plain language. A mismatch stops the process, and everything stays paused.
3. **Activation card.** The platform opens it by itself in the same conversation and reserves its budget. Only approving this card switches things on (ads, then the ad set, then the campaign), after another budget check against live numbers.
4. **When the card is declined:** the campaign stays built and paused and is never deleted.

The model has no tool to create or approve an activation. Errors are shown to the client in plain Hebrew (`src/lib/errors.ts`), including the case of an app in development mode (subcode 1885183). The technical detail is stored separately for Mikee and the admin.

**Verifying the Meta token:** with `META_APP_ID` and `META_APP_SECRET`, every token (whether from login or pasted in) is checked with `debug_token`. It must come from the MIKEE app, not from an old app such as simpleAd, and it must be valid. The permissions it carries and its expiry are stored, and settings shows any missing permissions. Instant forms are created with the page's own token.

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

111 tests against a real database (embedded Postgres) and a simulated Meta that records every call:
- `tests/approvals.test.ts`: tool classification and blocking, the version-bound approval, five simultaneous approvals → one campaign, a failure mid-run and retry without duplicates, adopting an orphaned campaign after a crash, a post retry only on the channel that failed, blocking repeated suggestions.
- `tests/budget.test.ts`: the projection (scheduled, paused, external changes), the ceiling, reservations for pending cards, the check at execution time, increases, and the hard ceiling at Meta.
- `tests/team.test.ts`: tool permissions per role (Mikee doesn't build or publish himself; each specialist only gets its own tools; no further delegation), a full delegation flow (brief, tools, card reaches the client, the team stays invisible), parallel tasks, and a specialist failure.
- `tests/conversations.test.ts`: the quick category guess, filing by Mikee, the lock after a manual move, history isolation between conversations, a card result reported in the right conversation, ordering and removal, and attachments as content blocks.
- `tests/proactive.test.ts`: quiet hours, the daily limit, no repeats (including two cron runs at once), priorities (a lost connection, a failed card, a waiting card in its own conversation), the weekly summary replacing the morning check, a silent check-in leaving no trace, the new-conversation marking, and parsing quick replies.
- `tests/security.test.ts`: forged files (HTML/SVG disguised as images), internal addresses, the `meta_write` allowlist against every bypass attempt, tokens, imitating platform events, blocking instruction leaks, protecting client rules, isolation between businesses, a code check that every route verifies the session and the origin, signed links, quota, rate limits, and signing out of all devices.
- `tests/journey.test.ts` and `tests/library.test.ts`: the marketing path (detection, updates, focus, the next-step nudge), and the library (storage, a single description, search by content, folders, deletion, isolation).
- `tests/runtime.test.ts`: jobs (one turn at a time, atomic claiming, resuming after a dead worker), a full Mikee turn with a mocked model (no MCP in the request), the AI cap, and gating media generation (no paying twice).

**Not yet tested against the real services:** the actual Meta API, the Claude API, and Higgsfield's real MCP server. That's the first step of the pilot.

## Sign-up

New businesses open an account at `/signup` (business name, their name, email, password). The account starts at the setup steps (`/onboarding`) on the default plan. `MIKEE_SIGNUP` sets who may sign up: `open`, `invite` (needs the code in `MIKEE_INVITE_CODE`) or `closed`. Protection: 3 sign-ups per network per hour and 10 per day, a daily cap for all sign-ups (`MIKEE_SIGNUP_DAILY_CAP`, default 50), a hidden field that catches bots, the same strong-password rule as everywhere else, and one answer whether or not an email is already taken.

## Running locally

```bash
npm install
cp .env.example .env.local    # fill in ANTHROPIC_API_KEY, SESSION_SECRET, MIKEE_ENCRYPTION_KEY
npm run create-user -- "Business name" "Owner name" owner@example.com "password"
npm run dev
```

Without `DATABASE_URL`, an embedded Postgres in `./.data` is used, with no extra installation.

## Deploying to Railway

1. **Repo + Postgres:** New project → Deploy from GitHub repo, then Add → Database → PostgreSQL. `railway.json` and `nixpacks.toml` already define Node 22, the build, start and the health check.
2. **Mikee service variables** (Mikee → Variables):
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (a reference to the database)
   - `SESSION_SECRET`, `MIKEE_ENCRYPTION_KEY`, `CRON_SECRET`: three different random values (`openssl rand -hex 32`)
   - `APP_URL`: the service's public address (Settings → Networking → Generate Domain), with https
   - `ANTHROPIC_API_KEY`
   - The first user: `MIKEE_BUSINESS_NAME`, `MIKEE_OWNER_NAME`, `MIKEE_OWNER_EMAIL`, `MIKEE_OWNER_PASSWORD` (at least 10 characters). On first startup the business and user are created; after you sign in, delete `MIKEE_OWNER_PASSWORD`.
3. **Health check:** `/api/health` reports exactly which settings are missing (names only) and whether the database responds. If a deploy fails, open this address.
4. **Cron:** add a Cron service that runs **every hour** (`0 * * * *`) with the command:
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/checkin`
5. **Later:** `META_APP_ID`/`META_APP_SECRET` (plus a redirect address in the Meta app: `{APP_URL}/api/meta/callback`), a file bucket (`S3_*`), Google Drive (`GOOGLE_*`), support (`SUPPORT_*`). The full list is in `.env.example`.

Netlify fits Mikee's public landing page (a separate site). The app itself stays on Railway.

## Meta connection

- `META_APP_ID` + `META_APP_SECRET`: shows a "התחברות עם פייסבוק" (Log in with Facebook) button and gets a long-lived token (about 60 days).
- For the pilot you can also paste a ready System User access token (under "יש לי מפתח גישה מוכן", "I already have an access key"). This kind of token has no planned expiry date, but it can still be revoked. That's why there's monitoring and a "reconnect" screen.
- Tokens are stored encrypted (AES-256-GCM) and never reach the model.

## Higgsfield (generating images and video)

Set `HIGGSFIELD_MCP_URL` (and `HIGGSFIELD_MCP_TOKEN`). The **server** connects to Higgsfield as an MCP client (`src/lib/higgsfield.ts`), not the model. Created media is copied into our storage and served from `/api/media/:id`, so the server and Meta can always access it. In Settings: a monthly credit cap, and how many of them can be used without asking (default: 0, everything needs approval).

## Branded videos (HyperFrames)

Mikee makes short branded videos (reels, stories, feed, wide) from the business's own photos, video clips and music, rendered with the open-source [HyperFrames](https://github.com/heygen-com/hyperframes) framework.

- **How it works:** the creative specialist calls `propose_video` with scenes (title, product with price, a video clip trimmed from a library video with text over it and optionally its own sound, text lines, gallery, customer quote, call to action), a format, a style (clean, bold, elegant) and optional background music from the library. Any picture in a scene can be a photo or a video. The music fades in and out and dips to a quarter under clips that keep their sound. The model never writes HTML or code. The platform builds the composition from fixed templates (`src/lib/video/compose.ts`, every value escaped) with GSAP, the Heebo font and the library files, all local, with nothing from the network. The library accepts music (MP3, M4A, AAC, WAV, OGG) next to photos and videos.
- **Approval:** the card plays the video live, clips and music in sync, with a button that turns on sound (`/api/video/preview/:id`, only the business that owns the card, only the app can frame it, with byte ranges for seeking). After approval the project is streamed to the render worker (files are read one at a time, so large clips never sit in memory together), the MP4 comes back and is saved to the library in the "סרטונים" folder. Publishing it is a separate approval (post or campaign).
- **Limits:** up to 60 seconds and 10 scenes, only this business's library files, 30 videos per day per business, up to 900MB of source files per video. Rendering is free (CPU only); 15-30 seconds takes about one to two minutes with clips.

### The render worker (separate Railway service)

The code is in `render-worker/` (Dockerfile with Node 22, Chromium and FFmpeg). On Railway:
1. **+ New → GitHub Repo →** the same repo. In the new service's **Settings → Root Directory**, enter `render-worker`. It builds from the Dockerfile.
2. **Variables** of the worker: `RENDER_SECRET` (a long random string, at least 24 characters). Don't give it a public domain; it's only reached over the private network.
3. **Variables** of Mikee: `RENDER_URL=http://${{render-worker.RAILWAY_PRIVATE_DOMAIN}}:8080` (or whatever the service is named) and the same `RENDER_SECRET`.
4. Recommended: at least 2GB of memory for the worker.

The worker accepts only requests carrying the secret, and only the files a composition is made of (`index.html`, `kit/*`, `media/*`), checking each path before writing a byte of it. Before rendering it re-encodes every clip to H.264 with a keyframe every second (phone videos otherwise freeze when seeking), at most 1920 pixels on the long side. It fetches nothing itself and keeps nothing after answering.

## Code structure

```
src/lib/agent/      prompt.ts (Mikee's constitution) · tools.ts · run.ts (the conversation loop)
src/lib/meta/       graph.ts (API client) · performance.ts (results in plain language) · actions.ts (launch, change, publish)
src/lib/            budget.ts · proposals.ts · brain.ts · website.ts · store.ts · conversation.ts
src/app/(app)/      mikee (main screen) · results · brand · settings
src/app/onboarding  getting connected
```
