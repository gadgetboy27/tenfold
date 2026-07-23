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
Deployment      Railway (Docker — see Dockerfile) + Supabase (managed DB + storage)
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

- admin client by hand:

```typescript
export const GET = withWorkspace<{ id: string }>(
  async (req, { db, session, params }) => {
    const { data } = await db
      .from("campaigns")
      .select("*")
      .eq("id", params.id)
      .single();
    return NextResponse.json(data); // workspace_id filter already applied
  },
);
```

- `db` auto-applies `.eq('workspace_id', …)` on reads and injects it on writes for
  every table in `WORKSPACE_SCOPED_TABLES`. Use `ctx.admin` (raw, unscoped) only
  for webhooks / cross-table work.
- The wrapper handles auth (401), rate-limiting (429), and the 500 fallback.
- First-login workspace provisioning lives in one place: `getOrProvisionWorkspace`
  (`lib/auth/provisioning.ts`). Do not re-implement it inline in auth routes.

---

## 5b. Studio — the main site

`components/studio/Studio.tsx`, rendered directly at `/[workspace]`, **is the
main site** — there is no separate classic homepage anymore. It's a single
Cockpit layout: a left panel for input/navigation, a persistent right panel for
the result. The frame stays put; only the canvas morphs per `SectionId` (brief
→ images → video → music → caption → compositor → logo → publish). It drives
the SAME endpoints the classic flow used — a surface over existing
functionality, not a new engine.

- **There is only one layout now.** The earlier Simple/Cockpit split was
  removed (`BriefCanvas`, `ImagesCanvas`, `VideoCanvas`, `PlaceholderCanvas`,
  the layout toggle, and the `tf-studio-layout` localStorage key are gone) —
  `CockpitCreate` is the sole renderer for brief/images/video, and its own
  internal placeholder handles every other not-yet-ported section. Don't
  reintroduce a second layout without a real reason.
- **Every nav item stays in Studio** via `setSection` — never link out. A
  not-yet-ported section falls back to a placeholder inside `CockpitCreate`;
  only Compositor and (flag-off) Logo expose a deliberate `classicHref` "Open
  in classic" button.
- **Pickers use `StudioSelect`** (`components/studio/StudioSelect.tsx`, built on
  the Radix `dropdown-menu`) — the one dropdown for every choice-range control.
  Don't reintroduce pill rows.
- **Wired inline today:** Brief, Images, Video (Length/Style dropdowns), Music
  (genre + engine dropdowns, track sized to video length), Logo & Brand
  (renders the full `LogoStudio` in the canvas when `FEATURE_LOGO_BUILDER=1`),
  and the Gallery (below).
- Tier gating is by capability, not layout: `ent.proEffects` drives the locked
  "AI-Photoshop" effects.

### Gallery — the `"projects"` section, reachable via the logo click

`ProjectsCanvas` is the front door (clicking the Tenfold wordmark calls
`setSection("projects")`). It has two tabs, both porting capability the classic
app had at `/[workspace]` (`CampaignLobby`) and `/[workspace]/gallery`:

- **Projects** — grid/row browse of past campaigns (`GET /api/campaigns`).
  Clicking a card resumes it via `openProject(id)` (rehydrates state, lands on
  the right stage). Cards with an `anchor_asset_id` also show a **Publish**
  quick-action (`openProject(id, "publish")`) that jumps straight there instead
  of the normal resume heuristic.
- **Images** — every image ever generated across all campaigns
  (`GET /api/gallery`), with **Use as anchor** (`POST /api/campaigns/from-asset`
  → `reuseGalleryImage()`) to start a brand-new project from an old image for
  free (no regeneration), plus view-full-size and download. This is the exact
  capability the classic `/gallery` page had — ported in, not rebuilt from
  scratch, reusing both backing routes verbatim.

The classic `/[workspace]/studio` and `/[workspace]/gallery` routes now just
`redirect()` to `/[workspace]` for old bookmarks/links. The pre-Studio classic
dashboard (`DashboardClient`, `CampaignLobby`, `StepView`, `FloatingPromptBar`,
`LeftRail`, `RightPanel`) is unreached from any route now but still in the
repo — nothing has deleted it yet.

---

## 6. Credit System

`lib/credits/costs.ts` is the single source of truth — never hardcode a cost
elsewhere; import `CREDIT_COSTS`. Current values (keep this table in sync when
`costs.ts` changes):

```typescript
image_generation: 12   image_variety: 20   image_variation: 3   upscale: 2
bg_remove: 3           // Pro effect — BiRefNet cutout
video_10s: 25   video_15s: 40   video_30s: 100   // 30s = a real 2×15s render
talking_video: 130   virtual_tryon: 8   auto_caption: 5   hook_variants: 2
product_shot: 6
logo_concepts: 5   logo_refine: 1   logo_finalize: 3   logo_vectorize: 1
logo_mockups: 2    brand_package: 10
music_generation: 8   script_generation: 1   layout_autofix: 3
```

Video lengths are **10 / 15 / 30s** (5s was dropped; 60s never shipped). 30s is
Pro-gated and renders as two 15s Kling segments concatenated. Music is sized to
the chosen video length.

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

## 7b. Model Adoption Gate — riding fal's newest models safely

We want to be at the forefront as fal ships new models, but a newer model is not
automatically an upgrade — it can drop a capability or simply not be better. So a
candidate **never silently replaces the incumbent**. It must clear three rules,
encoded (and tested) in `lib/fal/model-adoption.ts` so the check is executable:

1. **It works** — verified to submit + return successfully against fal
   (`verifiedWorkingAt` set). Always verify endpoint + schema LIVE first.
2. **It covers** — its capabilities are a superset of the incumbent's: same
   output, ≥ the durations, ⊇ the input contract (`coversIncumbent()`).
3. **It improves** — a recorded, concrete win in speed / quality / cost
   (`improvement` set).

Only when all three hold may `canPromote()` return ok. **The former model is
never deleted — mark it `retired` so a revert is one flag flip.** The live record
is `lib/fal/model-ledger.ts` (`MODEL_LEDGER` + `promotionReport()`), updated at
the monthly model review; `lib/fal/models.ts` stays the runtime source of truth
for what's actually called. Worked example: Veo 3.1 Fast is a registered
_candidate_ the gate deliberately blocks — it can't cover Kling's 15s clips
(caps at ~8s), which is exactly why we didn't swap the default.

---

## 7c. Image Compositing — `lib/compositing/`

Photoshop-grade blending: no manual masking, API-driven, through the same
`creative_jobs` queue → webhook → Realtime pattern as everything else. Every
fal endpoint below was verified LIVE before wiring (Jul 2026) — see
`lib/compositing/ops.ts` for the exact input schema per op.

| Op        | fal endpoint                                      | Cost |
| --------- | ------------------------------------------------- | ---- |
| `cutout`  | `fal-ai/birefnet/v2` (same engine as `bg_remove`) | 1    |
| `inpaint` | `fal-ai/flux-pro/v1/fill`                         | 3    |
| `relight` | `fal-ai/iclight-v2`                               | 2    |
| `blend`   | `fal-ai/flux-pro/kontext/max/multi` (2–5 images)  | 3    |
| `depth`   | `fal-ai/image-preprocessors/depth-anything/v2`    | 1    |

`lib/compositing/blend.ts` is a separate, **mechanical** tier — pure Sharp
composites (`textureOverlay`, `gradientMerge`, `softGlow`), zero fal calls, zero
credits, served synchronously via `POST /api/compositing/blend`. The five AI ops
above go through `POST /api/compositing` (debit → `creative_jobs` row → fal
queue → the shared `/api/webhooks/fal` handler), mirroring the dedicated-route
pattern used by `bg-remove` rather than the generic `/api/jobs` dispatcher.

Every result — AI or mechanical — is stored as an asset tagged
`metadata.kind = 'composite_step'` (`storeCompositeAsset()` in
`lib/compositing/storage.ts`) so a pipeline can be stepped back through. Chain
steps via `buildCompositeInput()`; never hand-build a fal input for these
endpoints elsewhere. The shared webhook's asset extension detection now
respects the real `content_type` (png/jpg/svg) instead of forcing `.jpg` —
required so cutout/depth outputs keep their alpha/precision intact.

### UI — each op is a real, lockable layer (Studio's `CompositorCanvas`)

Cutout/inpaint/relight/blend are surfaced as **new layer kinds inside the
EXISTING Compositor layer system** (`components/studio/CompositorCanvas.tsx`,
in Studio's `"compositor"` section) — not a separate/parallel stack. This
reuses `useCompositorStore` + `LayerList` + `LayerControls` verbatim; the only
schema change is `ImageLayer.producedBy` (`lib/composition/layers.ts` —
`compositeProvenanceSchema`: `{ op, jobId?, params? }`), which records that a
layer's image came from a compositing op rather than a plain upload.

- Running an op adds a new **auto-locked** image layer once the fal job
  completes (in-flight runs are transient toolbar state, not a layer — a
  layer's `src` must be a real URL, so nothing pending goes in `doc.layers`).
- **Locking now actually blocks editing everywhere**, not just canvas
  click-through — this was a real gap: `LayerControls` never checked
  `layer.locked` before, so a "locked" layer's sliders were still editable.
  Fixed there, so it protects both the classic Compositor and Studio's canvas.
- Unlocking a `producedBy` layer shows a **"Redo this op"** panel (prompt +
  direction, where applicable) instead of a manual replace — reruns
  `POST /api/compositing` and replaces the layer's `src` in place, re-locking
  on success. Mask (inpaint) and the blended image set (blend) are reused
  as-is on redo — editing them isn't built yet (inpaint's initial "add" flow
  also requires an uploaded mask file; there's no in-canvas mask painter).
- **Depth has no layer/toolbar entry.** It was always described as plumbing
  ("feed into relight or Sharp-side depth-blur"), not a placeable visual
  element, so it isn't forced into the visible stack.
- Persists via the existing `POST /api/compositions/save` (one composition row
  per campaign, upserted) — no new persistence route.

### Access — Agency-only, except Blend (Business add-on)

The whole module (all 5 AI ops **and** the mechanical Sharp blend route) is
**Agency-exclusive by default**. The one carve-out: `blend` (both the AI multi-
image merge and the mechanical blends) can be unlocked on **Business** by
purchasing the **Blend Package** add-on — enforced by `canUseCompositing()`
(`lib/compositing/access.ts`), called at the top of both `POST /api/compositing`
and `POST /api/compositing/blend` before any tenant/credit work.

Add-ons are **not** a column on `subscriptions` — a workspace can hold its main
tier subscription AND one or more add-on subscriptions simultaneously (each its
own Stripe subscription object), so they live in `workspace_addons`
(`lib/billing/addons.ts` — `ADDONS`, `hasActiveAddon()`). Purchasing one reuses
the existing generic `POST /api/credits/purchase` route (already priceId-driven)
— no new checkout route needed, just the `STRIPE_PRICE_BLEND_ADDON` price.

**Webhook correctness note:** `customer.subscription.created/updated` used to
match purely by `stripe_customer_id` and default any unrecognized price to tier
`payg` — which would have silently downgraded a workspace's real tier the
moment it bought a second (add-on) subscription on the same customer. Fixed:
the handler now matches add-on prices by `stripe_subscription_id` (unambiguous
even with two concurrent subscriptions) and only touches `subscriptions.tier`
when the price is a _recognized_ tier price — an unmatched price is now
ignored rather than resetting tier.

**Entitlements correctness note:** `TIERS.business.proEffects` must **not**
statically list `"blend"` — it briefly did, which would have shown the Studio's
"Fade / blend" effect as unlocked (no lock icon) for every Business workspace
while the server-side gate still 403'd them without the add-on. `blend` is
patched into Business's `proEffects` **dynamically** in `getEntitlements()`
only when `hasActiveAddon(..., "blend_package")` is true, so the UI's lock
state and the API's real gate can never drift apart again. Agency keeps
`blend` (and everything else) in the static list — it's bundled, no add-on
needed.

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
STRIPE_PRICE_BLEND_ADDON=
AYRSHARE_API_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
APP_URL=https://tenfold.nz
NEXT_PUBLIC_APP_URL=https://tenfold.nz
```
