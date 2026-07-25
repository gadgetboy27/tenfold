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

- **"Brand Brain."** Instead of manual brand-kit setup, let a user drop a
  website URL or a brand-guide PDF and have an LLM extract hex codes, fonts,
  tone of voice, and logo assets automatically. (`components/logo/BrandColors.tsx`
  and the wider Brand Kit are the manual version of this today — Brand Brain
  would be an alternate, faster on-ramp into the same `brand_kits` row, not a
  replacement for manual editing.)
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
2. **Explicit approval state machine.** Extend `campaigns` (or a dedicated
   table) with `status: 'draft' | 'pending_review' | 'approved' | 'scheduled'
   | 'published'` rather than publishing being a single unguarded action.
   Needed before this is credibly sellable to a team, not just a solo user.
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
4. **Rethink the 10× markup.** Consider a hybrid: a higher base subscription
   for the workflow/storage/publishing value, with AI generation passed
   through at closer to 1.5–2× rather than 10×. Feels fairer, reduces churn
   pressure as underlying model costs keep dropping. This is a pricing/
   business decision, not an engineering one — flagging it here, not
   changing `lib/credits/costs.ts` or any Stripe price without a deliberate
   separate call on it.
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
   product-photo case; URL/PDF ingestion would be new.

## 5. Pros / cons snapshot

**Pros:** production-ready architectural guidelines, a real fragmented B2B
pain point (AI creation + publishing in one place), enforceable coding
standards and security practices (RLS, idempotency — see `CLAUDE.md` §2),
a cohesive brand identity.

**Cons:** the core value prop ("prompt to multi-platform content") is
trending toward commodity; high exposure to third-party API pricing/
availability; no post-publish analytics or team approval workflow yet; the
10× markup may drive churn as underlying AI costs keep falling.

**Bottom line:** the architecture is ready to win. The product story needs
to shift from "we can generate things" to "we make your marketing
measurably better and safer" — analytics and approval workflows are what
make that claim true, not just the tagline.
