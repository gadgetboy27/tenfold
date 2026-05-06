# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies. The primary user-facing artifact is **Tenfold** — a B2B AI creative platform (Next.js 15 App Router) at `tenfold-next/`.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- Tenfold Next.js app: `cd tenfold-next && npm run dev` (runs on `$PORT`, default 3000)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 (`artifacts/api-server/`)
- **Database**: PostgreSQL + Drizzle ORM (`lib/db/`)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **Tenfold frontend**: Next.js 16 (App Router), Tailwind CSS, Zustand, Framer Motion, Radix UI, Supabase SSR
- **AI**: fal.ai (image/video/music/upscale), Anthropic Claude (script generation)

## Where things live

- `tenfold-next/` — Next.js frontend (UI + Supabase auth only — NO API routes)
  - `app/(dashboard)/[workspace]/page.tsx` — main dashboard entry (server-side, auth-gated)
  - `app/login/page.tsx` — Supabase auth (password + magic link)
  - `app/(auth)/callback/route.ts` — Supabase OAuth callback (the only remaining route handler)
  - `components/layout/` — DashboardClient, TopBar, LeftRail, RightPanel, StepView, FloatingPromptBar
  - `components/steps/` — Step1Create–Step5Publish
  - `components/shared/` — CreditMeter, ImageCard, FormatCard, SkeletonCard, CosmicBackground, JobStatusIndicator
  - `components/ui/` — Radix UI wrappers (Button, Popover, DropdownMenu, etc.)
  - `store/useAppStore.ts` — Zustand global state
  - `lib/api.ts` — fetch helper with auto Supabase Bearer token + `x-workspace-slug` header
  - `lib/supabase/client.ts` — browser Supabase client (sessionStorage-based)
  - `lib/supabase/server.ts` — server Supabase client (cookie-based)
  - `proxy.ts` — Next.js 16 proxy (CORS + Supabase session refresh + auth guard)
- `artifacts/api-server/src/` — Express API server (sole backend)
  - `middlewares/auth.ts` — Supabase JWT validation + workspace lookup + `debitCredits()` helper
  - `routes/campaigns.ts` — POST/GET/PATCH campaigns, enqueues fal.ai `flux-pro/v1.1`
  - `routes/jobs.ts` — POST/GET jobs (video/music/variation/upscale via fal.ai, script via Anthropic)
  - `routes/credits.ts` — GET balance from DB
  - `routes/compositions.ts` — POST/GET compositions saved to DB
  - `routes/webhooks.ts` — `POST /api/webhooks/fal` receives fal.ai callbacks, stores assets
  - `routes/prompt.ts`, `routes/social.ts`, `routes/publish.ts` — additional routes
- `lib/db/src/schema/index.ts` — shared Drizzle schema (source of truth for all tables)
- `lib/db/src/index.ts` — exports `db` (drizzle + pg Pool) + all schema tables
- `artifacts/tenfold/` — old Vite app (kept for reference, not served)

## Architecture decisions

- **Single backend**: All `/api/*` requests go to the Express server via Replit proxy. Next.js has NO API routes (except the Supabase auth callback).
- Supabase auth uses `sessionStorage` (not `localStorage`) on the browser client to avoid cross-tab session leakage in a multi-workspace B2B context
- `lib/api.ts` auto-attaches the current Supabase Bearer token and `x-workspace-slug` header to every API call — components never import Supabase directly for API calls
- `proxy.ts` handles CORS for `/api/*` routes and Supabase cookie refresh for page routes; auth redirect happens server-side
- fal.ai jobs are async (queue): webhook at `POST /api/webhooks/fal` receives results and stores assets. `storagePath` holds the fal.ai CDN URL directly (no Supabase Storage re-upload needed).
- Credit debit is DB-transactional with `FOR UPDATE` row lock in `debitCredits()` in `middlewares/auth.ts`
- `allowedDevOrigins` in `next.config.ts` permits Replit's proxied preview iframe (`*.replit.dev`)
- GitHub remote: `gadgetboy27/tenfold`, branch: `ui` only — never push to `master`

## Required env vars (Express server)

| Var | Purpose |
|-----|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `FAL_API_KEY` | fal.ai API key for image/video/music generation |
| `ANTHROPIC_API_KEY` | Claude API key for script generation |
| `APP_URL` | Public base URL (e.g. `https://my-app.replit.app`) — used for fal.ai webhook URL |

## Product

5-step AI creative workflow: (1) Generate images from a text prompt via fal.ai, (2) Select an anchor image, (3) Expand into video/music/caption, (4) Compose with branding, (5) Publish to social platforms.

## User preferences

- Always work on the `ui` branch — never `master`
- Pages in `app/(dashboard)/[workspace]/`, components in `components/`
- GitHub push target: `https://github.com/gadgetboy27/tenfold`
- No mock/placeholder data — production-ready only
- Express server is the sole backend; Next.js is UI + auth only

## Gotchas

- Next.js 16 uses `proxy.ts` (not `middleware.ts`) — export must be named `proxy`, not `middleware`
- Lucide-react (newer versions) removed social media icons (Twitter, Linkedin, Instagram, Facebook, Youtube) — use `Globe` as placeholder
- `pnpm run dev` at workspace root does not exist — use workflow restart or artifact-specific commands
- The `PORT` env var is set by the workflow config; `next dev -p ${PORT:-3000}` reads it correctly
- `lib/db/src/index.ts` throws at startup if `DATABASE_URL` is not set — this is intentional
- The `debitCredits()` function is in `middlewares/auth.ts`, not `routes/credits.ts`
- fal.ai webhook fires to `APP_URL/api/webhooks/fal` — set `APP_URL` in env vars for webhooks to work

## Pointers

- See `.local/skills/pnpm-workspace` for workspace structure and TypeScript setup
- Tenfold GitHub repo: `gadgetboy27/tenfold`, branch `ui`
