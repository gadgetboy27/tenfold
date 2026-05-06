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
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Tenfold frontend**: Next.js 16 (App Router), Tailwind CSS, Zustand, Framer Motion, Radix UI, Supabase SSR

## Where things live

- `tenfold-next/` — Next.js 15 frontend (migrated from `artifacts/tenfold/src/`)
  - `app/(dashboard)/[workspace]/page.tsx` — main dashboard entry (server-side, auth-gated)
  - `app/login/page.tsx` — Supabase auth (password + magic link)
  - `components/layout/` — DashboardClient, TopBar, LeftRail, RightPanel, StepView, FloatingPromptBar
  - `components/steps/` — Step1Create–Step5Publish
  - `components/shared/` — CreditMeter, ImageCard, FormatCard, SkeletonCard, CosmicBackground, JobStatusIndicator
  - `components/ui/` — Radix UI wrappers (Button, Popover, DropdownMenu, etc.)
  - `store/useAppStore.ts` — Zustand global state
  - `lib/api.ts` — fetch helper with auto Supabase Bearer token + `x-workspace-slug` header
  - `lib/supabase/client.ts` — browser Supabase client (sessionStorage-based)
  - `lib/supabase/server.ts` — server Supabase client (cookie-based)
  - `proxy.ts` — Next.js 16 proxy (CORS + Supabase session refresh + auth guard)
- `artifacts/tenfold/` — old Vite app (kept for reference, not served)
- `artifacts/api-server/` — Express API server
- `lib/` — shared TypeScript libs

## Architecture decisions

- Supabase auth uses `sessionStorage` (not `localStorage`) on the browser client to avoid cross-tab session leakage in a multi-workspace B2B context
- `lib/api.ts` auto-attaches the current Supabase Bearer token and `x-workspace-slug` header to every API call — components never import supabase directly for API calls
- `proxy.ts` handles CORS for `/api/*` routes and Supabase cookie refresh for page routes; auth redirect happens server-side
- `allowedDevOrigins` in `next.config.ts` permits Replit's proxied preview iframe (`*.replit.dev`)
- GitHub remote: `gadgetboy27/tenfold`, branch: `ui` only — never push to `master`

## Product

5-step AI creative workflow: (1) Generate images from a text prompt, (2) Select an anchor image, (3) Expand into video/music/caption, (4) Compose with branding, (5) Publish to social platforms.

## User preferences

- Always work on the `ui` branch — never `master`
- Pages in `app/(dashboard)/[workspace]/`, components in `components/`
- GitHub push target: `https://github.com/gadgetboy27/tenfold`

## Gotchas

- Next.js 16 uses `proxy.ts` (not `middleware.ts`) — export must be named `proxy`, not `middleware`
- Lucide-react (newer versions) removed social media icons (Twitter, Linkedin, Instagram, Facebook, Youtube) — use `Globe` as placeholder
- `pnpm run dev` at workspace root does not exist — use workflow restart or artifact-specific commands
- The `PORT` env var is set by the workflow config; `next dev -p ${PORT:-3000}` reads it correctly

## Pointers

- See `.local/skills/pnpm-workspace` for workspace structure and TypeScript setup
- Tenfold GitHub repo: `gadgetboy27/tenfold`, branch `ui`
