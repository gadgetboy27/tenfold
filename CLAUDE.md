# CLAUDE.md — prettymuch.nz

> prettymuch.nz is the product. Every file, route, component, and decision in this repo serves it.
> This file is the single source of truth. Read it fully before touching any code.
> Do not deviate from patterns defined here without updating this file first.

Product/pricing direction beyond what's built today lives in `PRODUCT_STRATEGY.md`
(a backlog of proposed pivots, not yet-adopted decisions) — read it before
assuming the credit-markup model or the roadmap below is final.

---

## 1. What We Are Building

**prettymuch.nz** — a B2B SaaS platform: AI creative pipeline → social publishing.

A business inputs a text prompt. The platform generates 6 images via fal.ai.
The user picks one image (the "anchor"). From that anchor they can branch into:

- 10–60 second video (fal.ai / Kling)
- Music track (fal.ai)
- AI-written script or caption (Claude API)
- Image variations or upscales (fal.ai / FLUX Kontext)

At each step the user can fine-tune, add text overlays, and apply their brand kit.
The final composed asset publishes directly to 1–13 social platforms via Ayrshare.

The business model is **credits + subscriptions**. Every generative action costs credits
at a markup on raw inference cost. Subscriptions bundle credits at a discount.

**The markup is not uniform, and cannot be.** Where inference is nearly free the
margin is huge (script ~25×, music ~20×). Video is the opposite: Kling bills
~$0.095/second, so video is priced at **~3×** and always will be. 10× on a 10s
clip works out to 188 credits — one video a month on Creator — or Creator at
NZD 218 instead of 29. The cheap actions fund video; video cannot fund itself.
Check the real numbers with `lib/costs/rates.ts`, never by assuming a multiple.

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

## 3. Tech Stack

Exact versions and dependencies: `package.json`. Directory layout: `ls`/explore
the repo directly — the tree drifts too often to keep a copy here in sync.

---

## 5. Database Schema

See full SQL in the project wiki or run `db/migrations/` in order.
Drizzle schema is the source of truth at `db/schema.ts`.

Key tables: `workspaces`, `workspace_members`, `social_profiles`, `subscriptions`,
`credit_accounts`, `credit_transactions`, `campaigns`, `creative_jobs`, `assets`,
`compositions`, `publish_records`, `webhook_logs`, `asset_comments`.

All tenant tables have `workspace_id`. RLS is enabled on all of them.

New API routes use the `withWorkspace` wrapper — see `app/api/CLAUDE.md`.

---

## 5b. Studio — the main site

`components/studio/Studio.tsx`, rendered directly at `/[workspace]`, is the
main site — no separate classic homepage anymore. See
`components/studio/CLAUDE.md` for the Cockpit layout conventions and the
Gallery. Auth + workspace-membership for every `/[workspace]/*` route is
enforced once in `app/(dashboard)/[workspace]/layout.tsx` — a new route
under that path doesn't need its own check.

---

## 5c. Approval State Machine

`campaigns.approval_status: 'draft' | 'pending_review' | 'approved'` gates
publishing for `member`-role users (`owner`/`admin` bypass — they can always
self-approve). See `app/api/CLAUDE.md` for the workflow routes and the
`POST /api/publish` enforcement gate; `db/migrations/0026_campaign_approval.sql`
for why it's three states, not the five `PRODUCT_STRATEGY.md` §4 originally
sketched.

---

## 6. Credit System

`lib/credits/costs.ts` is the single source of truth — never hardcode a cost
elsewhere; import `CREDIT_COSTS`. Read that file for current values rather
than a copy here that can drift out of sync. A second copy of a source of
truth is just a lie with a delay: the table that used to sit here drifted
until it claimed `video_10s: 15` and a `video_60s` that never existed.

Two files move together and neither is optional:

| file | holds |
|---|---|
| `lib/credits/costs.ts` | what we charge the user, in credits |
| `lib/costs/rates.ts` | what the provider charges us, in USD |

Changing one without the other silently changes the margin.

Video lengths are **10 / 15 / 30s** (5s was dropped; 60s never shipped). 30s is
Pro-gated and renders as two 15s Kling segments concatenated. Music is sized to
the chosen video length.

Rule: `debitCredits()` returns `{ success: false }` → reject with HTTP 402.
Never create the `creative_job` row. Never call fal.ai.

Refunds happen in the fal webhook — which means a webhook that never arrives
strands the credits permanently. `lib/jobs/sweep.ts` (`GET /api/cron/sweep-jobs`)
is the only thing that recovers those; see `app/api/CLAUDE.md` for its rules and
why it must not be scheduled without registering the Railway cron by hand.

The async job creation pattern (check credits → insert job → enqueue →
respond) lives in `app/api/CLAUDE.md`.

Markup is deliberately uneven, not flat — see `PRODUCT_STRATEGY.md` §4.4 for
the 2026-07-25 margin-banded repricing (raw cost per type lives in
`lib/costs/rates.ts`, real-time margin at `/api/analytics/usage`). Before
changing any `CREDIT_COSTS` value, or if a change to it broke something
non-obvious, read `lib/credits/CLAUDE.md` — it lists the downstream files
(credit-level thresholds, pricing-page copy, tests) that silently go stale
otherwise. Any further `CREDIT_COSTS` change should be checked against real
`actual_cost_usd` data first, not assumed.

---

## 7b. Model Adoption Gate

Riding fal's newest models safely — see `lib/fal/CLAUDE.md`.

---

## 7c. Image Compositing

`lib/compositing/` — the AI ops, mechanical Sharp blend tier, layer UI, and
Agency/Business add-on gating. See the `image-compositing` skill
(`.claude/skills/image-compositing/SKILL.md`) for the full reference.

---

## 7d. Publishing Backends — our own connections first

`POST /api/publish` fans each requested platform out to one of three backends.
Which one handles a platform is decided by cost of _access_, not by code taste:

| Backend                           | Platforms                                             | Cost               |
| --------------------------------- | ----------------------------------------------------- | ------------------ |
| Meta Graph (`lib/social/meta.ts`) | Facebook, Instagram                                   | free               |
| Direct (`lib/social/direct/`)     | Bluesky, TikTok, LinkedIn, Reddit, Pinterest, YouTube | free               |
| Ayrshare (`lib/ayrshare/`)        | X, Threads, Snapchat, GMB, Telegram                   | $599/mo (Business) |

**The direction is standalone connections, and as of 2026-09-06 production
runs entirely on them.** Both paid intermediaries are dark: `AYRSHARE_ENABLED`
is unset (the gate wants the literal `"true"`), and `OUTSTAND_API_KEY` — the
per-post broker in `lib/social/broker/` — is unset too, so `isBrokerEnabled()`
is false. Every post that leaves this product today goes out over a credential
the workspace owns, through Meta Graph or an adapter in `lib/social/direct/`.

Neither integration is deleted, and that is deliberate: each is one env var
away from coming back if a network's direct route closes. **Anything that
touches publishing must keep working with both off** — that is the normal
case now, not the fallback.

### What is actually live — verify, don't inherit

`lib/social/configured.ts` is the single source of truth: `isPlatformConfigured`
maps each platform to the one env var its connect route needs, and the settings
badge and the 503 both read it, so a platform cannot advertise itself as ready
and then refuse the click.

Verified 2026-09-06 against the `tenfold` Railway service (see
`railway-service-topology` — a bare `railway` command hits `sweep-cron`):

| Platform            | Gate env var         | Prod  |
| ------------------- | -------------------- | ----- |
| Bluesky             | _none — always on_   | ✅    |
| Facebook, Instagram | `META_APP_ID`        | ✅    |
| TikTok              | `TIKTOK_CLIENT_KEY`  | ✅    |
| LinkedIn            | `LINKEDIN_CLIENT_ID` | ❌    |
| Reddit              | `REDDIT_CLIENT_ID`   | ❌    |
| Pinterest           | `PINTEREST_APP_ID`   | ❌    |
| YouTube             | `YOUTUBE_CLIENT_ID`  | ❌    |

**Re-verify this table rather than trusting it.** It has been wrong in both
directions: it once claimed Reddit and LinkedIn were configured when they were
not, and the correction that fixed that then went stale the other way, claiming
"NO direct backend has credentials" while Bluesky and TikTok were live and
posting. The cheapest check is `?verbose=1` on `GET /api/health` with the ops
Bearer token, which reports the gate vars directly; `railway variables --service
tenfold` is the fuller answer.

**An adapter is not the same as access.** A direct adapter publishes nothing
until its developer app exists AND clears the platform's own gate — the four ❌
rows above all have working adapters and no credentials. Absent credentials a
connect route returns 503 ("isn't configured on this deployment yet") rather
than redirecting into a broken OAuth URL.

**Every connect route reads `isPlatformConfigured`, Meta included** (fixed
2026-09-06). `connect/facebook` used to skip it, and because `getMetaOAuthUrl`
reads `process.env.META_APP_ID!` behind a non-null assertion, a deployment
without that var redirected to Facebook with `client_id=undefined` and let Meta
show the error — while every other platform answered a clean 503. If you add a
platform, wire it into `configured.ts` and read it from the connect route; a
second copy of the condition is a copy that drifts.

**Bluesky is the exception that needs nothing.** No developer app, no review,
no environment variable — the user pastes a handle and an app password and it
works, and its adapter handles image AND video. It is therefore the cheapest
second network by a wide margin, and the only one that can be switched on
without waiting on a platform.

The remaining Ayrshare-only names — X, Threads, Snapchat, GMB, Telegram — are
not "not done yet". They are there because their access costs money and weeks
of review queue, and with Ayrshare off they currently have no route at all.
Don't move one down a tier without checking that's changed.

The per-platform gates, for when credentials do get added:

- **LinkedIn** — member's own feed only (`w_member_social`). Company Pages need
  LinkedIn's Community Management review. **Video is refused outright** by the
  adapter (it needs LinkedIn's separate video upload flow), so LinkedIn is an
  image-and-text network here. Its adapter is also the one file in
  `lib/social/direct/` never run against the live API — treat the first real
  connection as the test, and a 400 from `/rest/posts` or `/rest/images` as
  "read linkedin.ts first".
- **TikTok** — unaudited apps can only post `SELF_ONLY`, and `PULL_FROM_URL`
  needs the **Supabase Storage host** verified in TikTok's portal, not ours.
  That host is `NEXT_PUBLIC_SUPABASE_URL`, which on production is the custom
  domain `auth.prettymuch.nz` — a domain we own and therefore CAN verify, where
  `<ref>.supabase.co` could never be. 302 assets written before that domain
  was configured still carry the raw supabase.co origin, so `lib/social/media-url.ts`
  re-points the origin at publish time; both hosts serve the same objects at
  the same paths. The adapter also queries `creator_info` for the account's
  real privacy options, and briefly polls the publish status, because TikTok
  accepts a video for processing and can reject it afterwards.
  Its access token lives ~24h, so the refresh path in `lib/social/direct/index.ts`
  (`getUsableToken` → `refreshTikTokToken`) is load-bearing for every publish,
  not an edge case — an expired token with a refresh token is the normal state.
- **YouTube** — `youtube.upload` is a Google restricted scope: test users only
  until OAuth verification, and ~6 uploads/day against the default quota.

`BROKER_PLATFORMS` in `lib/social/broker/outstand.ts` still lists TikTok and
YouTube alongside the five Ayrshare names, which is correct and costs nothing:
`shouldBroker` returns false whenever a direct connection exists, and false
outright while `OUTSTAND_API_KEY` is unset. The list is the set of platforms a
broker _could_ serve, not a claim about how they publish today.

Per-network notes worth knowing before touching `lib/social/direct/`:

- **Bluesky** has no developer app at all. The user pastes a handle + app
  password; it lives in `social_profiles.access_token` and never expires
  (revoked, not aged out — hence `token_expires_at = null`). Blobs are capped
  at 1MB, so images get re-encoded down (`fitImageForBlob`) rather than
  rejected, and text is 300 _graphemes_.
- **Reddit** posts `kind=link` at the asset's public Storage URL, not a native
  image upload — see the rationale in `reddit.ts`. It needs a **title**, not a
  caption, and it reports failures inside a **200** response body, so `res.ok`
  alone is not success. Tokens live one hour and are refreshed + persisted.
- **Pinterest** cannot post video here (needs the `/v5/media` upload flow) and
  every pin must name a board — both surface as clear errors, never a silent
  substitution.

Reddit and Pinterest need a destination the caption can't carry; it's stored on
`social_profiles.metadata` (`default_subreddit` / `default_board_id`) via
`POST /api/social/destination` and overridable per publish.

**Stored credentials are encrypted at rest** (`lib/social/token-crypto.ts`,
`SOCIAL_TOKEN_KEY` — set on production). A deployment WITHOUT the key reads
every encrypted row back as `null`, so all connections present as dead and
nothing publishes. That is the expected symptom when running locally against
the production database with the key absent from `.env`; it is a missing key,
not a broken connection.
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

### Phase 1 — Foundation ✅ shipped

Supabase schema + Drizzle, Zod env validation, auth (email + Google),
workspace provisioning, image generation → fal.ai queue → webhook → Realtime
status, anchor selection, credit debit + ledger.

### Phase 2 — Expansion ✅ shipped

Video, music, script generation from anchor image.

### Phase 3 — Composition ✅ shipped

Sharp pipeline, brand kit, text overlays, format selector, layered Compositor
(§7c), Logo Studio.

### Phase 4 — Publishing ✅ shipped

Ayrshare connect, platform picker, publish + schedule.

### Phase 5 — Billing ✅ shipped

Stripe subscriptions + credit packs, webhook grants, per-tier entitlements,
add-ons (`workspace_addons`).

### Phase 6 — Production Hardening — partial

Rate limiting ✅ (`withWorkspace`), Sentry ✅, E2E test scaffold ✅
(`tests/e2e`). Not yet: Posthog, a completed security audit.

### Phase 7 — Analytics & Learning — v1 shipped

From `PRODUCT_STRATEGY.md` §4. `POST /api/analytics/refresh` pulls each
publish's engagement from Ayrshare's `analytics/post` endpoint, normalizes it
across platforms into one comparable score (`lib/analytics/engagement.ts` —
deliberately approximate, for ranking not reporting), and stores it on
`publish_records.analytics`. `style_performance()` (migration 0025) then
ranks the campaign's generation style/model by average engagement; surfaced
as the Gallery's "Performance" tab. Manually triggered, not scheduled — no
cron yet. A prerequisite for the "performance-driven generation" pitch in
`PRODUCT_STRATEGY.md` §3, which isn't built (nothing yet feeds a style's past
performance back INTO generation — this only reports it).

---

## 11. Environment Variables

See `.env.example` for the required variables.
