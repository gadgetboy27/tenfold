# CLAUDE.md — tenfold.nz

> tenfold.nz is the product. Every file, route, component, and decision in this repo serves it.
> This file is the single source of truth. Read it fully before touching any code.
> Do not deviate from patterns defined here without updating this file first.

---

## 1. What We Are Building

**tenfold.nz** — a B2B SaaS platform: AI creative pipeline → social publishing.

A business inputs a text prompt. The platform generates 6 images via fal.ai.
The user picks one image (the "anchor"). From that anchor they can branch into:
- 10–60 second video (fal.ai / Kling)
- Music track (fal.ai)
- AI-written script or caption (Claude API)
- Image variations or upscales (fal.ai / FLUX Kontext)

At each step the user can fine-tune, add text overlays, and apply their brand kit.
The final composed asset publishes directly to 1–13 social platforms via Ayrshare.

The business model is **credits + subscriptions**. Every generative action costs credits
at a 10× markup on raw inference cost. Subscriptions bundle credits at a discount.

---

## 2. Non-Negotiable Architecture Principles

1. **Credits are a ledger, not a balance field.**
   Never `UPDATE credit_accounts SET balance = balance - N`.
   Always `INSERT INTO credit_transactions` and derive balance from SUM.
   Every debit must be atomic with the job creation (single DB transaction).

2. **fal.ai jobs are always async.**
   Never `await` a fal.ai generation inline in an API route.
   Always: create `creative_job` row → enqueue to fal.ai → return job ID to client.
   Results arrive via webhook. Client polls via Supabase Realtime subscription.

3. **API keys never touch the client.**
   fal.ai API key: server-side only, never in env vars prefixed `NEXT_PUBLIC_`.
   Ayrshare API key: server-side only.
   Stripe secret key: server-side only.
   Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are public.

4. **All data is workspace-scoped.**
   Every table with user data has a `workspace_id` column.
   Every DB query from API routes includes `WHERE workspace_id = $workspaceId`.
   RLS policies enforce this at the database level as a second layer.

5. **Webhook endpoints are idempotent.**
   fal.ai may fire a webhook more than once. Stripe may replay events.
   Use `ON CONFLICT DO NOTHING` or check-before-insert on all webhook handlers.
   Log every webhook payload to `webhook_logs` before processing.

6. **Never block on composition.**
   Text overlay and brand stamping happen server-side via Sharp/Canvas.
   Never send base64 images back and forth to the client for processing.
   Composition runs in an API route, output stored to Supabase Storage, URL returned.

7. **Test the credit system exhaustively.**
   Every credit debit path must have an integration test.
   Insufficient credits must be caught before job creation, not after.
   Failed jobs must refund credits atomically.

---

## 3. Tech Stack — Exact Versions

```
Runtime         Node.js 20 LTS
Framework       Next.js 15+ (App Router, not Pages Router)
Language        TypeScript 5.x (strict: true, no any, no ts-ignore)
Styling         Tailwind CSS 4.x
Database        PostgreSQL 15 via Supabase
ORM             Drizzle ORM (not Prisma)
Auth            Supabase Auth (email + OAuth Google)
Storage         Supabase Storage (images, video, audio assets)
Realtime        Supabase Realtime (job status updates to UI)
Queue           fal.ai built-in queue
Payments        Stripe (subscriptions + one-off credit packs)
Email           Resend
Image gen       fal.ai SDK (@fal-ai/client)
Video gen       fal.ai SDK (Kling endpoint)
Music gen       fal.ai SDK (music generation endpoint)
Script gen      Anthropic SDK (@anthropic-ai/sdk, claude-sonnet-4-6)
Social publish  Ayrshare REST API (typed fetch wrapper)
Composition     Sharp (server-side image processing) + FFmpeg (video overlays)
Validation      Zod (all API inputs, all env vars)
Testing         Vitest + Supertest (API) + Playwright (E2E critical paths)
Linting         ESLint + Prettier (run before every commit)
Deployment      Vercel (Next.js) + Supabase (managed DB + storage)
```

---

## 4. Directory Structure

```
tenfold.nz (marketyou)/
├── CLAUDE.md                        ← you are here — read first, always
├── SETUP.md
├── .env.local                       ← never commit
├── .env.example
│
├── app/
│   ├── layout.tsx
│   ├── page.tsx                     ← marketing landing page
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── callback/route.ts
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── [workspace]/
│   │   │   ├── page.tsx
│   │   │   ├── new/page.tsx
│   │   │   ├── campaign/[id]/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── compose/page.tsx
│   │   │   │   └── publish/page.tsx
│   │   │   ├── settings/
│   │   │   │   ├── brand/page.tsx
│   │   │   │   ├── social/page.tsx
│   │   │   │   └── billing/page.tsx
│   │   │   └── analytics/page.tsx
│   └── api/
│       ├── webhooks/fal/route.ts
│       ├── webhooks/stripe/route.ts
│       ├── campaigns/route.ts
│       ├── campaigns/[id]/route.ts
│       ├── campaigns/[id]/anchor/route.ts
│       ├── jobs/route.ts
│       ├── compositions/route.ts
│       ├── publish/route.ts
│       ├── credits/balance/route.ts
│       ├── credits/purchase/route.ts
│       ├── social/connect/route.ts
│       └── social/profiles/route.ts
│
├── components/
│   ├── ui/           Button, Card, Badge, Input, Modal, Progress, Skeleton
│   ├── campaign/     PromptForm, ImageGrid, AnchorCard, FormatBranch, JobStatus, AssetPreview
│   ├── compose/      CompositionCanvas, BrandOverlay, FormatSelector
│   ├── publish/      PlatformPicker, CaptionEditor, SchedulePicker
│   ├── billing/      CreditMeter, CreditPackCard, SubscriptionCard
│   └── layout/       DashboardNav, WorkspaceSwitcher, CreditBadge
│
├── lib/
│   ├── fal/          client.ts, queue.ts, webhooks.ts, models.ts
│   ├── ayrshare/     client.ts, profiles.ts, publish.ts
│   ├── stripe/       client.ts, webhooks.ts, subscriptions.ts, checkout.ts
│   ├── credits/      costs.ts, debit.ts, refund.ts, balance.ts
│   ├── composition/  image.ts, video.ts, export.ts
│   ├── supabase/     server.ts, client.ts, admin.ts
│   ├── claude/       script.ts
│   ├── auth/         session.ts, middleware.ts
│   └── validation/   env.ts, schemas.ts
│
├── db/
│   ├── schema.ts
│   ├── index.ts
│   └── migrations/
│
├── supabase/
│   ├── config.toml
│   └── seed.sql
│
├── tests/
│   ├── unit/         credits.test.ts, webhooks.test.ts, composition.test.ts
│   ├── integration/  jobs.test.ts, publish.test.ts, billing.test.ts
│   └── e2e/          campaign.spec.ts, billing.spec.ts
│
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── next.config.ts
└── package.json
```

---

## 5. Database Schema

See full SQL in the project wiki or run `db/migrations/` in order.
Drizzle schema is the source of truth at `db/schema.ts`.

Key tables: `workspaces`, `workspace_members`, `social_profiles`, `subscriptions`,
`credit_accounts`, `credit_transactions`, `campaigns`, `creative_jobs`, `assets`,
`compositions`, `publish_records`, `webhook_logs`, `asset_comments`.

All tenant tables have `workspace_id`. RLS is enabled on all of them.

### Routing layer — `withWorkspace` (standard for new API routes)

The service-role admin client (`lib/supabase/admin.ts`) bypasses RLS, so tenant
isolation cannot rely on RLS alone — it depends on every query filtering by
`workspace_id`. To make that automatic, **new App Router API routes use
`withWorkspace` (`lib/api/with-workspace.ts`)** instead of calling `getSession()`
+ admin client by hand:

```typescript
export const GET = withWorkspace<{ id: string }>(async (req, { db, session, params }) => {
  const { data } = await db.from('campaigns').select('*').eq('id', params.id).single();
  return NextResponse.json(data); // workspace_id filter already applied
});
```

- `db` auto-applies `.eq('workspace_id', …)` on reads and injects it on writes for
  every table in `WORKSPACE_SCOPED_TABLES`. Use `ctx.admin` (raw, unscoped) only
  for webhooks / cross-table work.
- The wrapper handles auth (401), rate-limiting (429), and the 500 fallback.
- First-login workspace provisioning lives in one place: `getOrProvisionWorkspace`
  (`lib/auth/provisioning.ts`). Do not re-implement it inline in auth routes.

---

## 6. Credit System

```typescript
// lib/credits/costs.ts — single source of truth, never hardcode elsewhere
export const CREDIT_COSTS = {
  image_generation:  18,
  image_variation:    3,
  upscale:            2,
  video_10s:         15,
  video_30s:         40,
  video_60s:         80,
  music_generation:   8,
  script_generation:  1,
} as const satisfies Record<string, number>;
```

Rule: `debitCredits()` returns `{ success: false }` → reject with HTTP 402.
Never create the `creative_job` row. Never call fal.ai.

---

## 7. Async Job Pattern

1. Check credits → fail fast with 402 if insufficient
2. Insert `creative_jobs` row (status: queued)
3. `fal.queue.submit(model, { input, webhookUrl })` — non-blocking
4. Store `fal_request_id`, update status to processing
5. Return `{ jobId, requestId }` immediately to client

Webhook handler: log first (idempotency) → find job → handle success/failure → mark processed.
Client: Supabase Realtime `postgres_changes` on `creative_jobs` table.

---

## 8. Forbidden Patterns

```typescript
// ❌ Direct balance update — use ledger insert + cached_balance update atomically
// ❌ Inline fal.ai: fal.subscribe() — use fal.queue.submit() + webhook
// ❌ FAL_API_KEY in client or query param
// ❌ Skip idempotency check on any webhook
// ❌ Signed/expiring URLs to Ayrshare — use Supabase Storage public bucket URLs
// ❌ Process webhook before logging to webhook_logs
// ❌ Create job before debitCredits() succeeds
// ❌ TypeScript `any` — Zod-parse all external data
// ❌ Raw SQL strings — always use Drizzle query builder
```

---

## 9. Coding Conventions

- Named exports everywhere — no default exports except Next.js pages/layouts
- `interface` for object shapes, `type` for unions/aliases
- `async/await` only — no `.then()` chains
- No `console.log` — use `pino` logger
- Components < 200 lines, API routes < 100 lines (business logic in `lib/`)
- Commit format: `type(scope): description`
- Run `eslint` + `prettier --check` before any task is considered done

---

## 10. Build Phases

### Phase 1 — Foundation ✅ IN PROGRESS
- Supabase schema + Drizzle
- Zod env validation
- Auth (email + Google)
- Workspace creation on first login
- `POST /api/jobs` → image generation → fal.ai queue
- Webhook handler → asset saved
- Realtime job status
- ImageGrid (6 images)
- Anchor selection
- Credit debit + ledger

### Phase 2 — Expansion
Video, music, script generation from anchor image.

### Phase 3 — Composition
Sharp pipeline, brand kit, text overlays, format selector.

### Phase 4 — Publishing
Ayrshare connect, platform picker, publish + schedule.

### Phase 5 — Billing
Stripe subscriptions + credit packs, webhook grants.

### Phase 6 — Production Hardening
Rate limiting, Sentry, Posthog, email flows, E2E tests, security audit.

---

## 11. Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
FAL_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_25CR=
STRIPE_PRICE_100CR=
STRIPE_PRICE_300CR=
STRIPE_PRICE_CREATOR_MONTHLY=
STRIPE_PRICE_BUSINESS_MONTHLY=
STRIPE_PRICE_AGENCY_MONTHLY=
AYRSHARE_API_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
APP_URL=https://tenfold.nz
NEXT_PUBLIC_APP_URL=https://tenfold.nz
```
