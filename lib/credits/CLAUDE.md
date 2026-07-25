# lib/credits & lib/costs — credit prices vs. raw provider cost

Two files, two different numbers, easy to conflate:

- **`lib/credits/costs.ts`** — `CREDIT_COSTS`: what a user pays, in credits,
  per generation type. This is what `debitCredits()` charges. Root
  `CLAUDE.md` §1's ledger rule applies — never hardcode a cost elsewhere,
  import `CREDIT_COSTS`.
- **`lib/costs/rates.ts`** — `PROVIDER_COST_USD`: what tenfold actually pays
  fal.ai/Anthropic, in USD, per generation type. Never charged to a user
  directly — informs margin only, via `lib/costs/tracker.ts` →
  `/api/analytics/usage`.

The link between the two runs through Stripe: `lib/billing/plans.ts`'s
`PLANS`/`PACKS` define the real NZD-per-credit yield (confirmed live in the
Stripe dashboard as genuinely NZD-denominated, not just the `priceNzd` field
name — see `PRODUCT_STRATEGY.md` §4.4), and `rates.ts`'s `CREDIT_VALUE_USD`/
`NZD_USD_RATE` are a manually-maintained blended approximation of that
yield, used only for the live margin dashboard. They drift — they were off
by ~2× before the 2026-07-25 correction. Update them when FX or plan pricing
moves meaningfully; there's no automation keeping them in sync.

## Before changing `CREDIT_COSTS`

Don't guess, and don't apply a uniform percentage across the board. Check
real per-op economics first:

1. `PROVIDER_COST_USD[type]` (`lib/costs/rates.ts`) — the team's current
   best estimate of raw cost.
2. `creative_jobs.actual_cost_usd` (Supabase) — a snapshot of (1) taken at
   job-completion time, via `recordJobCost()`
   (`app/api/webhooks/fal/route.ts`, `lib/fal/talking-pipeline.ts`). This is
   **not** a live fal invoice — it just records whatever `PROVIDER_COST_USD`
   said when the job finished, so a recent edit to `rates.ts` shows up as a
   split between old and new values in the historical data, not real
   per-job billing variance.
3. The cheapest real redemption path — usually the lowest-$/credit
   subscription tier (`lib/billing/plans.ts`), not a top-up pack. Packs are
   priced richer per credit than subscriptions, so using pack pricing
   overstates the real margin floor.

`PRODUCT_STRATEGY.md` §4.4 has the full worked example (2026-07-25): the
flat "10× markup" premise the original review proposed turned out to be
backwards once measured — four Logo Studio ops were selling below raw cost
while video (the highest-volume category) sat at 1.2–1.6× and cheap text
ops ran 18–23×. A uniform markup change would have made that worse, not
better. Band by current margin health, not by usage volume or a flat rule.

## Known downstream dependents — a `CREDIT_COSTS` change can silently break these

- **`lib/billing/credit-levels.ts`** — `CREDIT_LOW`/`CREDIT_WARNING` are
  explicitly denominated against `CREDIT_COSTS.video_30s` ("inside the last
  30s video's worth of runway"). A `video_30s` reprice needs these
  re-anchored too, or `CREDIT_WARNING` can end up *below* the cost it's
  supposed to warn about — exactly what happened on 2026-07-25 (150 < the
  new 187) until caught by `tests/unit/credit-levels.test.ts`.
- **`components/marketing/PricingContent.tsx`** — the "what a credit buys"
  table reads `CREDIT_COSTS` live (safe by construction). Its "a full
  campaign costs about N credits" line is now computed from
  `CREDIT_COSTS`/`PLANS` too (fixed 2026-07-25 — it used to be a hardcoded
  sentence that silently went stale the first time video was repriced).
- **`tests/unit/logo.test.ts`** — asserts `logo_concepts > logo_refine`; a
  relative-ordering check, not absolute, but still worth rerunning after any
  Logo Studio reprice.
- **`tests/unit/credit-levels.test.ts`** — asserts
  `CREDIT_WARNING >= CREDIT_COSTS.video_30s`; the guard that catches the bug
  above. Run it (or the full suite) after touching video credit costs.
