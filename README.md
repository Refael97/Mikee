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
On the front end there's only Mikee. In the back end, Mikee is the marketing manager (`run.ts`, medium thinking effort) who understands the need, decides, and hands the work to specialists (`specialists.ts`, high thinking effort):

| Specialist | Responsible for | Can create cards |
|---|---|---|
| Copywriter | Text for ads, reels and posts | — |
| Media buyer | Building campaigns and changing running ones | Campaign, change |
| Creative | Choosing existing visuals or creating new ones with AI | Media (costs credits) |
| Video editor | Editing reels, stories and video ads from the business's own clips, photos and music | Video |
| Social | Organic posts, reels, carousels | Post |
| Analyst | Results, diagnosis, budget, stock, market research | — |

Each specialist gets the business brief (`brief.ts`), its own professional instructions, **its playbook for this business**, Mikee's task, and only the tools its job needs. It doesn't see the conversation with the client and can't delegate further. All specialists run on the same loop (`loop.ts`) and go through the same safety layer: cards, budget, versions. Every task is logged in `agent_runs`, and its cost is logged per agent. The client sees neutral wording ("Mikee is analyzing the results"), never the team.

**Playbooks (`src/lib/playbooks.ts`).** Every specialist has a working file per business (its "README"), written and maintained only by Mikee and read by the specialist at the start of every task. Sections: the client from that specialist's angle, standing work instructions, what works, and lessons from the client. How it stays current:
- **Before work:** when the business is set up, and in any case before Mikee first hands work to a specialist without a file, Mikee writes it from everything he knows.
- **From feedback:** every card records who made it (`proposals.agent`), and Mikee sees "made by" in the brief. When the client says what she didn't like, Mikee first adds a lesson to that specialist's file (`update_playbook`, `add_lesson`) and only then asks for a new version, which is made according to the updated file.
- **From results:** in the weekly summary Mikee adds what the numbers taught, and consolidates the file when lessons pile up (up to 8000 characters).
- Every change is a new version with its reason (`agent_playbook_history`). Specialists can't write to the files; only Mikee can. The client only hears "I noted that, from now on less text".

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
- **Storage:** a private S3-compatible bucket (Railway Buckets, Cloudflare R2, S3, Backblaze B2) under each business's prefix. Without one, files stay in the database and uploads are capped at 50MB. Railway: add a Bucket to the project and set `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` on the app service as references to the bucket's variables (`${{Bucket.ENDPOINT}}` and so on); the bucket-in-host-name style is chosen automatically, `S3_URL_STYLE` overrides it. A per-plan quota is enforced on every save (2GB / 5GB, `src/lib/plans.ts`).
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

### Cost and measurement (`src/lib/telemetry.ts`, `src/lib/agent/loop.ts`, `src/lib/meta/campaignContext.ts`)
- Every job runs in a task scope: model calls, Meta GETs and POSTs, cost and time are counted, saved on `jobs.metrics`, and each model call gets a `model_calls` row (input, cache read, cache write and output tokens as the API reports them, thinking included in output; time; cost; tools called).
- A task stops at `MIKEE_TASK_MAX_MS` (default 10 min) or `MIKEE_TASK_MAX_USD` (default $2) of AI cost.
- Identical Meta reads within one preparation task are made once (any write clears them). Executions never reuse reads, so the budget check at approval is always fresh.
- `get_campaign_context` returns assets, budget room, lead forms, ad-account media, library items and the chosen advertiser in one short answer. For a simple campaign Mikee calls it and `propose_campaign` himself; specialists are for judgment, copy or media.
- A loop ends as soon as every tool call of a step produced a card: no extra model call to announce it.
- Old tool results are cleared server-side (`clear_tool_uses_20250919`, cards and reports kept), and stale thinking blocks are dropped (`block_binding: drop_block`) instead of failing; history is never edited client-side. If the API refuses either control, it is turned off and the call retried.
- Jobs carry a lease renewed by a 20 s heartbeat timer (independent of slow calls); a copy that lost its lease stops before its next model call or Meta write.
- Models per role: `DEFAULT_TIERS` in `src/lib/agent/loop.ts` (Haiku for Mikee and most specialists, Sonnet for the media buyer and the analyst), moved with `MIKEE_TIERS` without code. On Haiku, compaction triggers at 80K and old tool results clear at 30K input tokens, below its 100K price step. To compare: run the same scenario under each setting and `select model, count(*), sum(input_tokens), sum(cache_read_tokens), sum(output_tokens), sum(ms), sum(cost_usd) from model_calls where job_id in (...) group by model;`
- A trace for one task: `select agent, model, step, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, ms, cost_usd, tools from model_calls where job_id = '<job id>' order by id;` and `select kind, status, metrics from jobs where id = '<job id>';`

### Advertiser and payer (`src/lib/meta/identities.ts`, `src/components/AdvertiserIdentity.tsx`)
Some accounts and locations make Meta refuse an ad set without a verified advertiser (100/3858634). The identities come only from the account's own existing ad sets (`regional_regulation_identities`); a name is Meta's when `GET /{id}?fields=name` returns it, otherwise the client confirms it as Ads Manager shows it. The client chooses once, in the failed campaign card or in Settings, for this ad account, the whole business (used in another account only if that account already uses it) or one campaign; card beats account beats business. The choice is stored per workspace and sent as `regional_regulation_identities: { universal_beneficiary, universal_payer }` at the top level of the ad set (never a regulated category copied from other ad sets), then read back. A retry continues from the paused campaign already built. Meta reviewing the identity does not mean ads can run yet.

### Monthly budget (`src/lib/budget.ts`)
The calculation is a projection. The policy:
- **spent:** what Meta reports for this month. Today is always counted as a full day, which covers the lag in Meta's reporting.
- **committed:** everything that can currently deliver, read live from Meta on every check, so changes made outside Mikee are included. Daily budget × days left in its window (a scheduled campaign counts from its start date). A lifetime budget counts what's left of it, prorated to this month.
- **Paused campaigns don't count.** Resuming one is new spend, requires a card, and passes the check.
- **A 10% safety margin** for daily variation in Meta's delivery.
- **Cards awaiting approval reserve their amount,** so two cards can't exceed the budget together.
- **A second check at the moment of execution,** against live numbers.
- **A hard ceiling at Meta:** the ad account's `spend_cap` is synced to the same ceiling (after a budget change, an increase, an execution, and on every cron run). Meta itself stops charges, including from changes made outside Mikee. The write is read back to verify it; the status appears in Settings. **It needs to be verified once on the real account in the pilot** (the units of the field).

**Plans and the usage quota** (`src/lib/plans.ts`, `src/lib/credits.ts`):
- AI plans: `ai_299` (₪299) and `ai_499` (₪499). Each includes a number of Mikee credits per billing cycle (`MIKEE_PLAN_CREDITS`, JSON, e.g. `{"ai_299":2700,"ai_499":6700}`). A credit is one fixed unit in every plan: `MIKEE_CREDIT_USD` of our cost (default $0.01).
- Human guidance is an add-on that does not change the AI quota: monthly (₪350, one call) or weekly (₪999, four calls a month). What a call includes is in `GUIDANCE` / `GUIDANCE_INCLUDES`.
- Set a business's plan, add-on and cycle day: `npm run set-plan -- owner@example.com ai_499 monthly 2026-10-14`. Add credits it bought (only after it asked): `npm run add-credits -- owner@example.com 500 "reason"`.
- The quota is quiet: the client asks, Mikee does it. No price cards and no charge messages; images and AI videos she explicitly asked for run without a card (Mikee's own ideas still come as a card to approve, without a price). Editing branded videos is free; the agent that prepares one is charged like any other work. Ad spend at Meta is a separate budget with its own cards.
- She sees "ניצול המכסה החודשית: N%" in the account menu (a panel with the exact share, what is left, the renewal day, bought credits apart, a request to add credits or upgrade, and a link to the usage detail in her profile), and a small notice at 80% and at 95%, once each per cycle. Requests only record what she asked for (activity `billing_request`); nothing is ever bought or charged automatically.
- The server: each business has its quota and usage ledger. Before work starts, credits are set aside atomically (`credit_holds`: a row lock across instances and a queue within the process), so parallel tasks cannot pass the quota; charges count against the hold and the rest returns when the work ends (a turn sets aside `MIKEE_TURN_HOLD_CREDITS`, default 40). The included quota is used first, then bought credits (`credit_purchases`, oldest to expire first, recorded in `credit_draws`), valid `MIKEE_PURCHASED_CREDITS_MONTHS` months (default 12; 0 = no expiry) and carried across cycles. The included quota renews on the subscription's day of the month (`billingAnchor`).
- Charged once, for delivered work only: a generation is charged when its result is stored (a retry waits for the same job and is not charged again); a failed generation, or a turn that failed with no answer and no card, is not charged to the client. Its cost is kept as ours (`*_lost` rows in `usage`). Higgsfield is converted at `MIKEE_HIGGSFIELD_CREDIT_USD` (default $0.07 per Higgsfield credit).
- Out of quota: a request stops before it starts with "המכסה שלך לא מספיקה לפעולה הזאת. אפשר להוסיף קרדיטים או לשדרג ולהמשיך מאותה נקודה."; conversations, results and settings stay available.

### Background jobs (`src/lib/jobs.ts`, `src/lib/worker.ts`)
Every turn of Mikee's and every execution is a job in the database with a heartbeat. A worker inside the server (`src/instrumentation.ts`) claims jobs atomically (`FOR UPDATE SKIP LOCKED`). A job whose worker died is picked up again, and a turn resumes from its last completed step. The screen follows progress through `/api/jobs/:id` and reconnects after a refresh, a disconnect or a deploy.

### The brain (`src/lib/brain.ts`)
Simple sentences, each with a source (client / website / store / results / Mikee's own inference) and a date. What the client said is confirmed. What Mikee inferred is a suggestion until she approves it. Results become dated "learnings", never permanent rules, and get marked as stale after 60 days. Prices, stock and promotions aren't stored; they're re-checked before use.

### Meta connection

Checked against Meta's official docs (Graph API v26.0, October 2026). The app is a **Business** app with **Facebook Login for Business**.

**Setup in the App Dashboard (app `META_APP_ID`):**
1. Facebook Login for Business ← Configurations ← Create configuration:
   - Token: **System-user access token**, **60 days**. Mikee renews it automatically about 10 days before it expires, in the hourly job.
   - Assets: Pages, Ad accounts, Instagram accounts, Catalogs.
   - Permissions: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_ads`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `instagram_manage_messages`, `pages_manage_metadata`, `leads_retrieval`, `catalog_management`.
   - Instagram direct messages (read only): `list_instagram_conversations` and `read_instagram_conversation` read the inbox of the Instagram account chosen for the business, through its page token. Before reading, the token is inspected live (`debug_token`) for `instagram_manage_messages`, and the page must be linked to that account. Reading messages from customers (people with no role on the app) normally needs Advanced Access for `instagram_manage_messages` (App Review); with Standard Access Meta refuses and Mikee reports its error as is. New messages arrive by webhook and can be answered automatically (below).
   - Automatic replies to Instagram messages: the client switches on "מענה אוטומטי לשאלות על העסק" in the Messages page (`/inbox`), picks the topics (address, hours, phone, website, other) and enters the facts herself (`business_facts`; a website scan never counts). Setup at Meta: Webhooks, product Instagram, callback `<APP_URL>/api/meta/webhook`, verify token `META_WEBHOOK_VERIFY_TOKEN`, field `messages`; switching it on subscribes the business's page (`POST /{page-id}/subscribed_apps`). Every delivery must carry a valid `X-Hub-Signature-256` (HMAC with `META_APP_SECRET`), and an Instagram account connected to more than one business is ignored. Each message is stored once per Meta message id and handled by its own worker lane: one short call to the light model decides whether an approved fact answers it, and code then refuses any reply that does not quote the fact exactly or adds a link, number or mention that is not in it. Anything unclear, missing or failing is not sent and waits in the inbox. Echoes of Mikee's own replies are recognized; any other message sent from the business's account means a person took the conversation, and automatic replies stop there until the client gives it back. `sendInstagramMessage` sends only to a customer in a conversation with this business's account, within 24 hours of the customer's last message.
   - The Configuration ID goes into `META_LOGIN_CONFIG_ID` (required).
2. Facebook Login for Business ← Settings:
   - Valid OAuth Redirect URIs: exactly `{APP_URL}/api/meta/callback`.
   - Strict Mode and Enforce HTTPS on.
3. App Settings ← Basic ← App Domains: the domain of `APP_URL`.
4. Optional: Advanced ← Require App Secret. Every call carries `appsecret_proof`.
5. To serve businesses you don't own: Business Verification, then App Review for Advanced Access on every permission above, plus `public_profile` and the Ads Management Standard Access feature. Until then, add each pilot client to the app as a Tester.

**How it works in the code:**
- **Login dialog:** sends `config_id` with `response_type=code` and `override_default_response_type=true`, which system-user tokens require. It sends no `scope`.
- **Callback:** reads Facebook's error parameters, checks the token with `debug_token`, and refuses a token that can't be checked or comes from another app.
- **Token storage:** tokens are stored encrypted (AES-256-GCM) and never reach the model.
- **Retries:** reads are retried with backoff on temporary errors and short throttling.
- **Disconnects:** only a dead token (190/102) disconnects. An object-level permission error doesn't, and the hourly check verifies the token and each asset.
- **Publishing to Instagram and Facebook:**
  - Photos are converted to JPEG, sRGB, at most 1440px wide. For Instagram they are also cropped to 4:5–1.91:1 and kept to 8MB or less. Facebook gets them at 10MB or less.
  - Scheduled posts are 10 minutes to 30 days ahead, Facebook only.
  - Rendered videos come out the way Reels ask: H.264, AAC at 48kHz stereo, moov first, no edit list.
- **Campaigns:**
  - Lead ads: link `https://fb.me/` and only the allowed buttons.
  - Cities: radius 17–80km.
  - Advantage+ audience: ages are a suggestion (min ≤ 25, max 65).
  - Engagement: `ON_POST`. Awareness: `page_id`.
  - Video thumbnail: uploaded as an ad image.
  - Budget changes in a campaign-budget (CBO) campaign go to the campaign.
  - The spending cap is written only when it changes (up to 10 times a day).
  - Three campaign cards, all through the same approval path, built PAUSED and read back before a separate activation card:
    - **קמפיין חדש** (`propose_campaign`): one or more ad sets (`moreAdsets`), each with its own audience, budget and ads; one activation for all of them.
    - **הוספת סדרה** (`propose_adset`): a new ad set and its ads inside an existing campaign (`campaignId`), optimized like that campaign's other ad sets, without a budget of its own when the campaign holds the budget.
    - **שכפול סדרה** (`propose_adset_copy`): `POST /{adset_id}/copies` with `campaign_id`, `deep_copy` (with or without its ads) and `status_option: PAUSED`. Only `sourceAdsetId` is needed: the server reads the source's campaign; another campaign only when asked, and only a matching one (same objective and budget setup). A new audience, name or budget is an update on the paused copy, after the copy.
  - For ad sets in an existing campaign, the campaign is the target that exists: no new campaign is ever created for it, and its activation card switches on only the new ad set and its ads.
  - The server checks that every campaign and ad set belongs to the business's ad account (`account_id`), checks the monthly budget, and saves progress: `copied_adset_id` and the ad mapping are saved the moment Meta answers. If the answer of a `/copies` request is lost, the retry looks for the copy in the target campaign and adopts it; if anything new there cannot be identified for sure, it stops instead of copying again, and it sends the request again only when nothing appeared.
  - Mikee withdraws a wrong card with `withdraw_card` (it can no longer be approved), and says what was wrong in plain words. A capability he lacks is "היכולת עדיין לא מחוברת אצלי", never "Meta does not allow it".
- For the pilot you can also paste a ready System User token (under "יש לי מפתח גישה מוכן", "I already have an access key").

## Client skills

In Settings, under "סקילים", the client saves her own ways of doing a piece of work: a name, one line on when to use it, the instructions, and who on the team uses it (Mikee and/or specific specialists). She can write one there or read a `SKILL.md` (or any `.md`/`.txt` file) into the form; a file is only a draft until she reviews it and presses save. Mikee and the specialists see only the names and "when to use" lines of their own skills, and open the full text with the `use_skill` tool when a task matches (`src/lib/skills.ts`, route `/api/skills`).

The security model:
- A skill is text only. Nothing in it runs, it adds no tool and no access, and an uploaded file is read as text (no scripts, no ZIP).
- It shapes how the work is done, never what is allowed: the hard rules in the constitution and the team preamble say a skill cannot skip a card, touch the budget ceiling or the approval level, reveal instructions or data, contact anyone or visit an address. Mikee tells the client which part he skipped.
- Only the client writes skills, from Settings (same-origin check, rate limit, per-business). No agent tool can create or change one, so a website, a message or a document cannot plant a skill.
- Links and anything that looks like a key or password are refused at save. Platform-note look-alikes and the `<client_skill>` wrapper tags are stripped, and the wrapper tags are also stripped from untrusted text and client messages, so nothing else can pose as a skill.
- Limits: 20 skills per business, 60 characters for the name, 300 for "when to use", 8,000 for the instructions, 32KB per file.

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

### Measuring page speed locally
`MIKEE_META_GRAPH_BASE=http://127.0.0.1:4555` sends every Graph call to a local stand-in (for example one that answers after 3 seconds, or fails), so a production build (`MIKEE_DB=pglite npx next start`) can be measured against a slow or broken Meta. Production leaves it unset.

## Instagram Stories and organic reporting

The social agent can propose an Instagram Story with `propose_post` using
`format: "story"`, `channels: ["instagram"]`, exactly one image/video, and
`text: ""`. Approval uses the existing server-side proposal executor. The server
creates a `STORIES` container, waits for processing, then calls `media_publish`;
a container/render alone is never reported as a published Story. Story photos
are converted to JPEG without the feed's 4:5 crop. Existing feed/reel/carousel
proposals remain compatible (`format` defaults to `auto`).

`read_stories` reads active Stories and `read_organic_insights` reads daily
Instagram account reach. Both resolve the current workspace's connection and
selected Instagram account, accept no external account ID, and propagate Meta
errors rather than inventing empty results. Both tools are available to Mikee
and the social specialist.

Stories require an eligible Instagram Business account and the appropriate
content-publishing permissions/access. Unsupported media or account errors are
returned from Meta; interactive stickers and API-side Instagram scheduling are
not implemented. A publishing timeout with an unknown outcome blocks a blind
retry; an already-published Story container is not matched by an empty caption.

Validation: simulated Meta tests in `tests/instagram-stories.test.ts`; no real
Instagram account was published to during development.

### Ready Story shortcut and capability answers

`propose_story({title, media: {type, url}})` is available directly to
Mikee. The social specialist uses propose_post with format=story. Both create the same approval-gated post
proposal, with the Story format set on the server. Unknown parameters are rejected. `scheduleAt` supports an approved future publication.
The shared publishing guidance distinguishes immediate publishing from scheduled jobs. Instagram uses the persistent Mikee queue; Facebook-only uses Meta scheduling. The health endpoint reports the Railway commit
SHA when available and a Story capability marker to verify deployed code.

## Scheduled Instagram publishing

Mikee and the social agent accept `scheduleAt` on a post or Story (ISO 8601 with
an explicit offset, 10 minutes to 30 days ahead). The card shows the date in the
business timezone. Approval atomically stores the approved state and an execute
job in `waiting` state with `jobs.not_before` (ignored by older workers during rolling deploys); no Meta containers are created before the due time.
The Railway worker polls the database and claims due jobs atomically with a
lease. Scheduling survives restarts and deployments; no cron or AI wake-up is
needed. Mixed Instagram/Facebook posts are published together by the server.

Provider/CDN media is copied into this business's storage when preparing the
scheduled card, so a temporary link need not survive until the scheduled time.
Own library media is validated against the current business. Deleting a selected
file before publication may prevent the post from publishing.

After approval the card says **מתוזמן** and has a cancel button. Mikee can also
cancel a schedule when asked, using `cancel_scheduled_post`. Cancellation and
starting the publication compete atomically: cancellation succeeds only while
it is still scheduled. To change a time, cancel and approve a new card. Approval
after the chosen time is rejected. Jobs more than 30 minutes late stop and report
a failure instead of unexpectedly publishing old content. A published media ID
and existing checkpoints prevent repeat publications after retries; unknown
publishing outcomes still require reconciliation.

The scheduled execution and its short success/failure receipt make no model
calls. Receipt messages are stored in the conversation and marked unread.
`/api/health` reports `scheduledInstagramPublishing: true` after deployment.
The server must remain available; polling and Meta processing mean publishing is
not guaranteed to the second. Startup runs the idempotent SQL migration for
`jobs.not_before` and its partial due-job index for queued/waiting jobs.

Verified with simulated Meta and real embedded PostgreSQL in
`tests/scheduled-publishing.test.ts`. UI approval, scheduled status and cancellation
were checked in desktop and mobile Chrome against a temporary local fixture.
