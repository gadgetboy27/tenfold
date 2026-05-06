# Workspace

## Overview

pnpm workspace monorepo using TypeScript. The primary user-facing artifact is **Tenfold** — a B2B AI creative platform (Next.js App Router) at `tenfold-next/`. This Replit instance is the **UI layer only** — all business logic and data lives on the Vercel backend at `https://marketyou-mu.vercel.app`.

> **READ THIS FILE FIRST** before starting any work in this repo. It defines the non-negotiable architecture rules below. Violating them (adding a DB, adding business logic, hardcoding the Vercel URL) will be reverted.

## Golden rule — never build a backend here

This repo is **UI + Supabase auth ONLY**. The Vercel backend already exists and owns everything else:

- **Use** the existing Vercel backend via relative `/api/*` calls (proxied by `next.config.ts` rewrites). It handles credits, campaigns, jobs, Stripe, fal.ai, Anthropic, Resend, image composition, social publishing, workspaces, and all DB writes.
- **Do NOT** add Next.js route handlers for business logic, install Drizzle/postgres/Stripe/fal/Anthropic/Resend/Sharp, create local DB schemas/migrations, or hardcode `VITE_API_URL` in components.
- **Allowed** Next.js route handlers: only `app/(auth)/callback/route.ts` (Supabase OAuth code exchange). Allowed server actions: only auth flows in `app/login/actions.ts`.
- If a backend endpoint is missing, **ask for it to be added on Vercel** — do not build a workaround here.

## Backend contract (Vercel endpoints we rely on)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/workspaces/me` | Returns `{ workspaceId, slug, role }` for the authenticated user |
| `POST /api/workspaces/provision` | Idempotent — creates workspace if missing, returns `{ workspaceId, slug }` |
| `GET /api/credits/balance` | Workspace credit balance (also used as workspace-existence guard) |
| `/api/*` (everything else) | All other product endpoints — campaigns, jobs, generation, publish, etc. |

All endpoints accept `Authorization: Bearer <supabase access token>` and `x-workspace-slug: <slug>` (added automatically by `lib/api.ts`).

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- Tenfold Next.js app: workflow `artifacts/tenfold: web` (runs on `$PORT`)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: Next.js 16 (App Router), Tailwind CSS, Zustand, Framer Motion, Radix UI, Supabase SSR
- **Auth**: Supabase (browser client uses sessionStorage; server client uses cookies)
- **Backend**: Vercel deployment at `VITE_API_URL` — proxied via Next.js rewrites. No local DB or business logic.

## Where things live

- `tenfold-next/` — Next.js frontend (UI + auth only)
  - `next.config.ts` — rewrites `/api/:path*` → `VITE_API_URL/api/:path*` (server-side proxy, no CORS)
  - `app/(dashboard)/[workspace]/page.tsx` — main dashboard entry (server-side, auth-gated)
  - `app/login/page.tsx` — Supabase auth (password + magic link)
  - `app/login/actions.ts` — server actions: sign-in discovers real workspace slug from Vercel backend
  - `app/(auth)/callback/route.ts` — OAuth callback: gets/provisions workspace via Vercel backend only
  - `proxy.ts` — Next.js middleware (Supabase session refresh + auth guard)
  - `components/layout/` — DashboardClient, TopBar, LeftRail, RightPanel, StepView, PromptBuilder
  - `components/steps/` — Step1Create–Step5Publish
  - `components/shared/` — CreditMeter, ImageCard, FormatCard, SkeletonCard, CosmicBackground, JobStatusIndicator
  - `components/ui/` — Radix UI wrappers (Button, Popover, DropdownMenu, etc.)
  - `store/useAppStore.ts` — Zustand global state
  - `lib/api.ts` — fetch helper with auto Supabase Bearer token + `x-workspace-slug` header
  - `lib/supabase/client.ts` — browser Supabase client (sessionStorage-based)
  - `lib/supabase/server.ts` — server Supabase client (cookie-based)
  - `lib/supabase/admin.ts` — service-role client (used only in OAuth callback to write user metadata)

## Architecture decisions

- **No local DB or backend logic**: All business logic (credits, campaigns, jobs, Stripe, AI) lives on the Vercel backend. This repo is pure UI + auth.
- **API proxy via Next.js rewrites**: All `/api/*` requests go Browser → Next.js server → Vercel backend. Avoids CORS entirely; components use relative `/api/*` URLs.
- **Workspace resolver (`lib/workspace.ts`)**: shared by the OAuth callback and password sign-in. Order: (1) read `user_metadata.workspace_slug` fast-path, (2) `GET /api/workspaces/me`, (3) `POST /api/workspaces/provision` (idempotent — handles cold-start). Result is written back to user metadata so subsequent logins skip the network. The literal `"test-workspace"` in metadata is treated as invalid.
- **DashboardClient workspace guard**: On mount, if `/api/credits/balance` returns 403/404, a clear "Workspace not found" screen is shown with a sign-out link — no silent zero-credit state.
- **PromptBuilder replaces FloatingPromptBar**: Step 1 now uses a structured chip-checklist (Subject / Setting / Mood / Lighting / Composition) that auto-assembles the prompt, with style suffixes baked in.

## Required env vars (already set)

| Var | Purpose |
|-----|---------|
| `VITE_API_URL` | Vercel backend base URL (`https://marketyou-mu.vercel.app`) |
| `VITE_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (OAuth callback only, to write user metadata) |

## Product

5-step AI creative workflow: (1) Generate images via structured prompt builder, (2) Select an anchor image, (3) Expand into video/music/caption, (4) Compose with branding, (5) Publish to social platforms.

## User preferences

- All backend work goes through the Vercel API — no local DB, no Drizzle, no Stripe/fal.ai/Anthropic in this repo
- Always work on the `ui` branch — never `master`
- Pages in `app/(dashboard)/[workspace]/`, components in `components/`
- GitHub push target: `https://github.com/gadgetboy27/tenfold`, branch `ui`
- No mock/placeholder data — production-ready only
- Frontend calls relative `/api/*` URLs — never hardcode the Vercel URL in components

## Gotchas

- Next.js 16 uses `proxy.ts` (not `middleware.ts`) — export must be named `proxy`, not `middleware`
- `VITE_API_URL` is server-side only in `next.config.ts` — no `NEXT_PUBLIC_` prefix needed
- Lucide-react newer versions removed social media icons — use `Globe` as placeholder
- `PORT` is set by the workflow; `next dev -p ${PORT:-3000}` reads it correctly
- Never add Next.js API routes for business logic — the Vercel backend owns all `/api/*` routes

## Pointers

- Tenfold GitHub repo: `gadgetboy27/tenfold`, branch `ui`
- Vercel backend: `https://marketyou-mu.vercel.app`
