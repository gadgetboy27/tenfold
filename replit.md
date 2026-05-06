# Workspace

## Overview

pnpm workspace monorepo using TypeScript. The primary user-facing artifact is **Tenfold** — a B2B AI creative platform (Next.js App Router) at `tenfold-next/`. The Replit instance is the **UI layer only** — all API calls are proxied server-side to the deployed Vercel backend.

## Run & Operate

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Tenfold Next.js app: workflow `artifacts/tenfold: web` (runs on `$PORT`)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: Next.js 16 (App Router), Tailwind CSS, Zustand, Framer Motion, Radix UI, Supabase SSR
- **Auth**: Supabase (anon key, sessionStorage-based browser client)
- **Backend**: Vercel deployment at `VITE_API_URL` — proxied via Next.js rewrites

## Where things live

- `tenfold-next/` — Next.js frontend (UI + auth only)
  - `next.config.ts` — rewrites `/api/:path*` → `VITE_API_URL/api/:path*` (server-side proxy, no CORS)
  - `app/(dashboard)/[workspace]/page.tsx` — main dashboard entry (server-side, auth-gated)
  - `app/login/page.tsx` — Supabase auth (password + magic link)
  - `app/(auth)/callback/route.ts` — Supabase OAuth callback (only route handler in Next.js)
  - `proxy.ts` — Next.js middleware (CORS + Supabase session refresh + auth guard)
  - `components/layout/` — DashboardClient, TopBar, LeftRail, RightPanel, StepView, FloatingPromptBar
  - `components/steps/` — Step1Create–Step5Publish
  - `components/shared/` — CreditMeter, ImageCard, FormatCard, SkeletonCard, CosmicBackground, JobStatusIndicator
  - `components/ui/` — Radix UI wrappers (Button, Popover, DropdownMenu, etc.)
  - `store/useAppStore.ts` — Zustand global state
  - `lib/api.ts` — fetch helper with auto Supabase Bearer token + `x-workspace-slug` header (calls relative `/api/*`)
  - `lib/supabase/client.ts` — browser Supabase client (sessionStorage-based)
  - `lib/supabase/server.ts` — server Supabase client (cookie-based)
- `artifacts/api-server/` — Express server (present but claims no proxy paths; not used in production)
- `lib/db/src/schema/index.ts` — shared Drizzle schema (mirrors the Vercel backend's DB)

## Architecture decisions

- **API proxy via Next.js rewrites**: All `/api/*` requests go Browser → Next.js server → Vercel backend. This avoids CORS entirely and requires no changes to frontend component code.
- **Express server idle**: The Express server artifact exists but `paths = []` in its `artifact.toml` so it claims no proxy routes. It can be used for local experiments without affecting production.
- **Three env vars only**: `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — already set in Replit. Next.js reads `VITE_API_URL` directly (server-side) via `next.config.ts`.
- Supabase auth uses `sessionStorage` (not `localStorage`) on the browser client to avoid cross-tab session leakage
- `lib/api.ts` auto-attaches Bearer token and `x-workspace-slug` header — components never import Supabase directly
- `allowedDevOrigins` in `next.config.ts` permits Replit's proxied preview iframe (`*.replit.dev`)
- GitHub remote: `gadgetboy27/tenfold`, branch: `ui` only — never push to `master`

## Required env vars (already set)

| Var | Value |
|-----|-------|
| `VITE_API_URL` | `https://marketyou-mu.vercel.app` |
| `VITE_SUPABASE_URL` | `https://gbccfqpmoteicpumhkuj.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase publishable key |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as VITE_SUPABASE_URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as VITE_SUPABASE_ANON_KEY |

## Product

5-step AI creative workflow: (1) Generate images from a text prompt, (2) Select an anchor image, (3) Expand into video/music/caption, (4) Compose with branding, (5) Publish to social platforms.

## User preferences

- Always work on the `ui` branch — never `master`
- Pages in `app/(dashboard)/[workspace]/`, components in `components/`
- GitHub push target: `https://github.com/gadgetboy27/tenfold`
- No mock/placeholder data — production-ready only
- Frontend calls relative `/api/*` URLs — do NOT hardcode the Vercel URL in components

## Gotchas

- Next.js 16 uses `proxy.ts` (not `middleware.ts`) — export must be named `proxy`, not `middleware`
- `VITE_API_URL` is read server-side in `next.config.ts` — it does NOT need a `NEXT_PUBLIC_` prefix since it's only used in the rewrites config (server-side)
- Lucide-react (newer versions) removed social media icons — use `Globe` as placeholder
- The `PORT` env var is set by the workflow config; `next dev -p ${PORT:-3000}` reads it correctly
- Never add Next.js API routes for business logic — the Vercel backend handles all `/api/*` routes

## Pointers

- See `.local/skills/pnpm-workspace` for workspace structure and TypeScript setup
- Tenfold GitHub repo: `gadgetboy27/tenfold`, branch `ui`
- Vercel backend: `https://marketyou-mu.vercel.app`
