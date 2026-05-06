# Workspace

## Overview

pnpm workspace monorepo using TypeScript. The primary user-facing artifact is **Tenfold** — a B2B AI creative platform (Next.js App Router) at `tenfold-next/`. This Replit instance is the **UI layer only** — all business logic and data lives on the Vercel backend.

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
- **Workspace discovery on login**: `signInWithPassword` calls `VITE_API_URL/api/workspaces/me` (then `/api/workspaces`) with the user's Bearer token to find their real workspace slug before redirecting. The hardcoded `test-workspace` fallback is explicitly skipped.
- **OAuth callback is backend-first**: The callback route asks the Vercel backend for the user's workspace; if none exists it attempts to provision one via `POST /api/workspaces`. Slug is then stored in Supabase user metadata for fast password-login lookups.
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
