# PRODUCT_STRATEGY.md — external review, 2026-07-25

An external product/architecture review of tenfold.nz's positioning and roadmap.
Captured here as a strategic reference and phased backlog — **nothing in this
file is implemented yet**; treat every item as proposed until it's actually
built and this doc is updated to say so. Adopt slowly and methodically, not
as a rewrite: each item below should become its own scoped task, reviewed on
its own merits, not bundled into a single sweeping change.

---

## 1. Risks in the current model

- **10× markup on inference won't hold.** As model costs fall (image/video
  especially), a flat 10× markup gets harder to justify to savvy B2B buyers
  unless the surrounding workflow value is doing most of the work.
- **Heavy third-party dependency.** The core product is an orchestration
  layer over fal.ai, Kling, and Ayrshare. A pricing change, a rate limit, or
  an outage on any one of them is a direct hit to the product, not just a
  vendor's problem.
- **"One prompt, ten ways" is generic.** It's the same tagline as Canva
  Magic Studio, Adobe Firefly, and a wave of AI social-media startups — it
  describes a feature, not a differentiated position.

## 2. What's missing for a "next-gen" tool

- **Closed-loop analytics.** Nothing tracks post-publish performance (likes,
  shares, clicks, ROI). Publishing and then never learning from the result
  is a generation tool, not a marketing tool.
- **Approval workflows.** B2B teams rarely let a junior marketer auto-publish
  AI content unsupervised. A `draft → pending review → approved → scheduled →
  published` flow is table stakes for a team buyer, not a nice-to-have.
- **Asset ingestion.** Today generation is purely text-prompt → AI. There's
  no way to ground it in a product photo, a URL, or an existing brand PDF.
- **Platform-native optimization.** TikTok, LinkedIn, and Instagram want
  different hooks, aspect ratios, and caption tone. The format selector
  exists; intelligent per-platform adaptation on top of it doesn't.

## 3. The X-factor — pivot from generation to optimization

The way to stop being "just another AI wrapper":

- ~~**"Brand Brain."**~~ — **v1 shipped, 2026-07-26**, see §4 item 6. Website
  URL → colors/font/campaign brief. PDF ingestion and logo-asset extraction
  are not built.
- **Agentic content calendars.** Not "one prompt → one post" but "here's our
  new blog post URL — generate a 2-week calendar: 3 LinkedIn posts, 5 tweets,
  2 TikTok scripts."
- **Performance-driven generation.** Pull Ayrshare's post-publish analytics
  back in as a signal: "your last 3 posts with a question in the first
  sentence got 40% more engagement — apply that pattern to the next batch."

## 4. Proposed action items (backlog, not commitments)

Roughly in the order a reviewer would prioritize them — not a mandate to
build all of it at once:

1. ~~**Phase 7 — Analytics & Learning**~~ — **v1 shipped**, see `CLAUDE.md`
   §10. Manual refresh only (no scheduled pull), and it reports performance —
   nothing feeds it back into generation yet, which is the actual "learning"
   half of this item's name. Next increment here, when wanted: use it to bias
   future generation toward what's already scoring well.
2. ~~**Explicit approval state machine.**~~ — **v1 shipped**, see `CLAUDE.md`
   §5c. `campaigns.approval_status: 'draft' | 'pending_review' | 'approved'`
   — deliberately three states, not the five sketched above: `scheduled` and
   `published` already exist with finer (per-platform, per-post) granularity
   on `publish_records.status`, so duplicating them here would just drift out
   of sync. Any workspace member can submit for review; only `owner`/`admin`
   can approve or reject (send back to draft) — enforced server-side in
   `POST /api/publish` (403 for a member on an unapproved campaign), not just
   hidden in the UI. Owner/admin can self-approve directly, skipping the
   review round-trip. Surfaced in Studio's `PublishCanvas` as an inline
   status banner + action buttons, not a separate screen.
3. ~~**Abstract the AI providers further.**~~ — **v1 shipped**, see
   `lib/fal/CLAUDE.md`. `lib/providers/` — a `ProviderAdapter` interface, the
   fal adapter (the existing submit logic, moved not rewritten), and a
   `resolveProvider()` router with an empty-by-default per-endpoint override
   map. `enqueueJob`/`enqueueWithFallback`/`enqueueFirstOf` kept their exact
   signatures, so none of their ~17 callers changed. Deliberately doesn't
   include a second (Replicate/RunPod) adapter — there's nothing to verify it
   against yet, and shipping unverified provider code is exactly what the
   Model Adoption Gate exists to prevent one layer down. Also doesn't
   abstract webhook ingestion (still fal-specific per caller) — stated
   plainly in `lib/fal/CLAUDE.md` rather than implied to be covered.
4. ~~**Rethink the 10× markup.**~~ — **v1 shipped, 2026-07-25.** The premise
   going in ("soften a flat 10× uniformly") turned out to be backwards once
   measured against real data (`lib/costs/rates.ts` raw costs vs.
   `creative_jobs.actual_cost_usd`, live since the fal webhook handler wires
   `recordJobCost`): the markup was never flat. It ranged from real losses
   on four Logo Studio ops (0.46×–0.77× — `logo_finalize`/`logo_concepts`/
   `logo_refine`/`logo_mockups`) up to 18–23× on cheap text ops
   (`script_generation`, `hook_variants`, `music_generation`), while the
   highest-volume, most compute-heavy category — video — sat thin at
   1.2–1.6×. A uniform cut to 1.5–2× would have pushed video into losses,
   the opposite of the goal.
   - **Repriced (Bands 1 & 4, both to 3.0× raw cost):** `logo_concepts`
     5→32, `logo_finalize` 3→20, `logo_refine` 1→5, `logo_mockups` 2→8,
     `video_10s` 25→62, `video_15s` 40→94, `video_30s` 100→187
     (`lib/credits/costs.ts`). `lib/billing/credit-levels.ts`'s
     `CREDIT_LOW`/`CREDIT_WARNING` thresholds were re-anchored (50→70,
     150→200) since they're explicitly denominated against `video_30s`'s
     cost.
   - **Bands 2 & 3 (cash cows / healthy core) left untouched** — no
     evidence they need correction; touching already-fine or
     already-overpriced-in-the-user's-favor items wasn't part of this pass.
   - **Also fixed:** `lib/costs/rates.ts`'s `CREDIT_VALUE_USD`
     (0.10 → 0.046) and `NZD_USD_RATE` (0.61 → 0.58) were stale — the old
     0.10 implied NZD 0.17/credit, roughly double every real Stripe plan's
     actual yield (Business, the cheapest tier, is NZD 0.079/credit), which
     meant `/api/analytics/usage`'s live margin dashboard was overstating
     margin ~2× on every job type. Pure correctness fix, independent of the
     repricing decision above.
   - **Confirmed against the live Stripe product catalogue**: all
     subscription and credit-pack prices are genuinely billed in NZD (not
     just the `priceNzd` field name) — verified directly in the Stripe
     dashboard before doing any of this analysis.
   - Subscription prices (`lib/billing/plans.ts`) and credit-pack prices
     were **not** touched — this was a `CREDIT_COSTS` rebalance only, no
     Stripe product/price changes.
5. ~~**Enforce platform-native defaults.**~~ — **v1 shipped.** Turned out
   aspect (`PLATFORM_FORMATS`) and caption tone/hashtag count
   (`PLATFORM_GUIDE` / `adaptCaptions`) already existed — they just weren't
   automatic or reachable. The one genuinely new piece is a per-platform
   music default (`lib/social/platform-defaults.ts`, `noMusic` on
   `/api/publish`). This came bundled with a much bigger fix it depended on:
   **Publish itself was unreachable in the live app** — Studio (the only
   route left standing) had no publish screen, just a placeholder, so this
   also shipped a Studio-native `PublishCanvas` (ported from the classic
   dashboard's real but orphaned `Step6Publish`) and fixed the two
   "Continue to publish" entry points that were silently landing nowhere.
6. **Asset ingestion.** A path to ground generation in an uploaded product
   photo, a URL, or a brand PDF — not just a text prompt. The reference-photo
   upload (`components/studio/ReferencePhotoField.tsx`) is the existing
   product-photo case.
   - ~~**URL ingestion ("Brand Brain")**~~ — **v1 shipped, 2026-07-26.**
     `POST /api/campaigns/analyze-url` (extended, not replaced — its only
     prior caller was dead classic-dashboard code) now: (1) deterministically
     parses the fetched HTML for brand signals (`lib/claude/brand-scrape.ts`
     — `theme-color` meta, CSS custom properties, inline hex codes, Google
     Fonts `<link>` tags mapped to `lib/logo/font-list.ts`'s
     `SUPPORTED_FONTS`) at zero AI cost; (2) the existing
     `analyzeCampaignUrl()` Claude call is extended to also produce a
     `brandSuggestion` (palette + font) used only where detection came back
     low-confidence — still one Claude call total; (3) proposes writing the
     result into `brand_kits`, auto-applying only if the kit is still at
     factory defaults (never silently overwrites a customized kit — the user
     confirms via a second explicit "Apply to my Brand Kit" call, which
     reuses `PATCH /api/brand-kit` unchanged); (4) returns 4 campaign angles
     (unchanged `CampaignBrief` shape) for the user to pick from, wired into
     a new `components/studio/BrandImportPanel.tsx` in Studio's Brief step —
     picking an angle just sets its `imagePrompt` as the normal prompt
     textarea value; `POST /api/campaigns` itself was not touched.
   - **Gating: no hard tier lock** — available to every tier at a flat
     8-credit charge (`CREDIT_COSTS.brand_import`, one Claude call; see
     `lib/costs/rates.ts` for the raw-cost estimate, not yet measured against
     real usage). The charge is deliberately the whole gate, so a PAYG/Creator
     workspace can use it once for their own site without a Business
     subscription; Business/Agency get it as a marketed plan differentiator
     without a separate technical lock.
   - Deliberately **not vision/screenshot-based** — nothing like that exists
     elsewhere in the codebase, and a site's real hex codes/font names are
     almost always sitting in its HTML/CSS in plain text, cheaper and more
     accurate to parse directly than to ask a vision model to guess from a
     rendered screenshot.
   - **Not built**: PDF ingestion, and feeding the detected `voice_profile`/
     brand-voice pipeline (`lib/claude/brand-voice.ts`, separate, untouched)
     from the scraped page text — a natural next increment, not needed to
     hit "matching fonts and style."

## 5. Pros / cons snapshot

**Pros:** production-ready architectural guidelines, a real fragmented B2B
pain point (AI creation + publishing in one place), enforceable coding
standards and security practices (RLS, idempotency — see `CLAUDE.md` §2),
a cohesive brand identity.

**Cons:** the core value prop ("prompt to multi-platform content") is
trending toward commodity; high exposure to third-party API pricing/
availability; analytics doesn't feed back into generation yet (reports
performance, doesn't act on it).

**Bottom line:** the architecture is ready to win. Analytics (§4.1), the
approval state machine (§4.2), and the margin-banded pricing pass (§4.4)
are now v1-shipped, moving the product story from "we can generate things"
toward "we make your marketing measurably better and safer." What's left to
make that claim fully true: closing the analytics feedback loop (§4.1) and
asset ingestion (§4.6).
