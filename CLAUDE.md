# Mikee (מייקי)

Hebrew, RTL, chat-first AI marketing manager for small Israeli businesses (SaaS). The business owner talks only to Mikee; a hidden team of specialist agents (copywriter, media buyer, creative, video editor, social, analyst) does the work, each guided by a per-business playbook that Mikee writes and improves from the client's feedback. Every spend or publish is a proposal card the client approves; the monthly budget is a hard ceiling. Pilot client: the fashion store "רחל סיטבון שמלות שבת וערב".

Read first: `README.md` (architecture, setup, Meta, videos), `PRODUCT.md` (users, purpose, visual standard), `DESIGN.md` (design system). The character (Rive, `public/mikee/mikee.riv`, in `src/components/MikeeAvatar.tsx` and `MikeeRive.tsx`; four looks the client picks in Settings) and its brief: `docs/MIKEE-CHARACTER.md`.

## Stack
Next.js 15 (App Router), React 19, TypeScript, Tailwind v4, drizzle-orm (Postgres in production, PGlite locally and in tests), Vitest, zod 4, Claude API via `@anthropic-ai/sdk` (Claude Haiku 5.5 for Mikee and most specialists, Claude Sonnet 5.5 for the media buyer and the analyst; per-role tiers in `DEFAULT_TIERS` / `tierFor` in `src/lib/agent/loop.ts`, overridable with `MIKEE_TIERS`). Meta Graph API v26.0 (Facebook Login for Business, system-user tokens). Video: HyperFrames render worker in `render-worker/`. Node 22.

## Commands
- `npm install`
- `npm test`: all tests must pass before a commit
- `npx tsc --noEmit`, `npm run build`
- Local run: `cp .env.example .env.local` (needs `ANTHROPIC_API_KEY`, `SESSION_SECRET`, `MIKEE_ENCRYPTION_KEY`), `npm run create-user -- "Business" "Name" email "password"`, then `npm run dev`. Without `DATABASE_URL` an embedded DB in `./.data` is used.

## Working rules
- Branch: `claude/pensive-dirac-podemb`. Railway deploys it on every push.
- UI copy is natural modern Hebrew; no emoji; no dashes joining clauses; follow `DESIGN.md` (white panels on a light ground, light 300 text, thin icons, color only in tiles, dots and badges, a black capsule for the one primary action).
- Security is strict: CSP with nonce in `src/middleware.ts` (no external scripts), same-origin checks on mutating routes, rate limits, untrusted content wrapped for the model, tokens encrypted and never sent to the browser or the model. Keep it that way.
- Never commit secrets (`.env*`, `railway-*.env` are git-ignored).
- The Rive MCP server (`.mcp.json`) works only in a local session on the machine where the Rive desktop app runs.
