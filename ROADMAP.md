# prettymuch.nz — Product Roadmap

> Strategy + prioritized backlog. Living document — update as we learn.
> Last updated: 2026-06-11

---

## 0. Where we are (baseline)

The core pipeline works end-to-end in production (baseline verified 2026-06-11,
refreshed 2026-09-09):

**prompt → 6 images (FLUX Pro) → pick anchor → branch (video / music / caption / variations) → Compose (layers, formats, render) → publish.** Credits ledger + auth + Google/email signup all functioning.

Publishing is **standalone-first**: Meta Graph plus our own adapters, with
Ayrshare and the Outstand broker both dark. Live today: Bluesky, Facebook,
Instagram, TikTok. See root `CLAUDE.md` §7d — and re-verify that table rather
than trusting it; it has been wrong in both directions.

Shipped since the last baseline: brand voice profile, approval state machine,
one-video-per-publish pick, asset delete, the Compositor renamed **Compose**
with the classic page retired into it (format rail + per-aspect overrides,
fan-out, fullscreen preview, caption presets, render, one-pager PDF),
drag-to-stage from a tray, undo/redo, real Bold plus six display faces, and the
element tray over the gallery.

---

## 1. Strategic thesis

**We are not an "AI social scheduler." We are a generative content studio that publishes.**

Most tools called "AI social media tools" (Predis.ai, Ocoya, Simplified, Buffer, Later) are
**scheduling-first with templated visuals + AI copywriting**. Their "AI" is mostly caption
writing and template fills. Market pricing: ~$15–159/mo.

tenfold is a different category: **true generative** — real image (FLUX Pro), real video
(Kling), and music generation, composed and published in one flow. The closest analogues are
AdCreative.ai + Runway, not Buffer.

**The moat:** nobody bundles image + video + music generation → composition → multi-platform
publish in one product. It's expensive and hard to build — and we have it working. Defend and
deepen this; don't get dragged into competing as a cheaper scheduler.

### What the 2026 market actually wants (survey data)
- Top AI use cases: **analytics/reporting (59.5%)** and **ideation/trend research (59.5%)**,
  then caption writing (45.9%), visual/video creation (40.5%).
- Top complaints: **"it all sounds the same"** (brand voice), and accuracy — **78% of teams
  still heavily edit AI content before publishing.**
- What marketers want from AI: *remove friction* — reporting, personalization, consistency,
  prediction.

---

## 2. Competitive gap analysis

| Capability | Market in 2026 | tenfold today | Verdict |
|---|---|---|---|
| Image generation | mostly templates/stock | FLUX Pro (real gen) | **ahead** |
| Video / music generation | repurpose or none | Kling + music | **ahead** (rare) |
| Multi-platform publish | core | Meta + own adapters; Ayrshare dark | on par |
| Brand **kit** (logo/colour) | common | overlays / stamping | on par |
| Human-in-loop review | 78% edit before post | comments + approval gates ✅ | on par |
| **Brand VOICE consistency** | **#1 complaint** | voice profile ✅ shipped | on par |
| **Analytics / reporting** | **#1 use case** | basic weekly cron | **REFINE** |
| **Ideation / trend research** | **tied #1 use case** | none | **BUILD** |
| **Performance / virality prediction** | emerging (OpusClip) | none | **BUILD** |
| Scheduling calendar UX | core | schedule stage exists | **REFINE** |
| Long-form → clips repurposing | OpusClip | content-agent skeleton | refine |
| Social inbox / engagement | Sprout / Hootsuite | none | later (different bet) |

---

## 2b. Agency parity — the First Page benchmark (2026-09-09)

The reason this product exists, used as a measuring stick. First Page Digital
was engaged for the Hariko Kainga / HouseMatch app, delivered a campaign, and
never launched it. Their own artefacts are the most concrete spec we have of
what "a whole agency" actually produces — see the `firstpage-origin-and-gap`
memory for the full account.

**What they SOLD** (proposal, 22 Oct 2025 — the cleanest spec of the product
we are replacing). "Paid Social Advertising — Facebook and Instagram",
$1,300/mo + GST, media spend paid direct to Meta, 30-day minimum rolling with
60-day written notice:

1. Custom creative & ad copy
2. **Funnel creation**
3. **Conversion Pixel installation**
4. Experienced PPC specialist
5. **Boosting done based on organic posts** — additional artwork chargeable

**What they delivered:** 13 tasks over 18 days across 6 departments (Social
Performance Media, Search Performance Media, Content, Design, Landing Page,
Account Manager), producing 9 unique creatives × 2 aspect ratios, staged
TOF / MOF / BOF, plus a media plan and a landing page. The ads never ran.

Line 5 is the most useful sentence in the whole engagement: **their paid model
was BOOSTING ORGANIC POSTS**, not building ad campaigns from scratch. That
matters enormously to our sizing below — promoting an existing published post
is a far smaller Meta surface than the full campaign/adset/ad object graph, and
publishing that post is something we already do.

Two observations worth keeping, because they set the strategy:

- **Of those 13 tasks, five are briefs and four are reviews or approvals.**
  Three are production. We are not competing with their capability, we are
  competing with their coordination overhead — and handoffs between people is
  exactly what software deletes.
- **Their creative is ~80% compositing, ~20% generation** — stock lifestyle
  backdrops, phone mockup frames, the client's own app screenshots dropped into
  the screens, typography over the top. We are built the other way round.
  That asymmetry, not quality, is the actual gap.

### The gaps, in build order

| # | Gap | Why it matters | Effort | Notes |
|---|---|---|---|---|
| 1 | **Device mockups** | Their most-used device — 5 of 9 assets | **S** | A frame PNG with a transparent screen region, dropped from the tray as an image layer with the screenshot behind. Uses the layer system as-is. Highest credibility-per-hour in the list. |
| 2 | **Funnel sets** | Makes output read as a *campaign*, not a pile of images | **M** | `lib/claude/campaign-brief.ts` ALREADY models `goal: awareness \| conversion \| engagement \| retention` and returns 4 angles. This is an extension of that — one brief → a coordinated TOF/MOF/BOF set with distinct messages and CTAs — not a new concept. |
| 3 | **Media plan** | Their opening task, and their whole justification | **S** | One Claude call, same shape as `analyze-url`: brief + connected platforms + budget → channel split, audience, schedule. Store on the campaign, gate behind the existing `approval_status`. Price at `script_generation` tier. |
| 4 | **Carousels** | 4 of their 9 assets were carousel frames | **M** | A composition type: N frames sharing one brand system, exported as an ordered set. Publish already fans out per platform. |
| 5 | **Landing pages** | 5 of their 13 tasks | **L** | brief → copy → page, hosted. We already have brief, copy, imagery and brand kit; this is assembly plus hosting. |
| 6 | **Conversion tracking** | Item 3 of what they sold; we have no attribution at all | **M** | Meta Pixel / Conversions API. Without it "which ad worked" is unanswerable, which also blocks the performance-prediction bet in §3. |
| 7 | **Boost a published post** | Item 5 — their ACTUAL paid model | **M**, not XL | Promoting a post we already published is a small Meta surface next to the full campaign graph. This is the cheap 80% of "paid", and it is reachable. |
| 8 | **Full campaign management** | Cold-audience buying, adsets, bidding | **XL** | The real remainder. **Until 7 and 8 exist, prettymuch replaces their studio, not their media desk** — say it in those words; the distinction is the difference between a true claim and an overclaim. |

### Where we are already ahead

Generation speed (≈20s vs 18 days), multi-format fan-out with safe-zone
warnings (they hand-built two sizes; we reflow and flag overlap), approval
gates, versioning, undo, and a publish step they never reached at all.

---

## 3. Roadmap

### 🎯 NOW — make the core trustworthy & sticky
Build on what already works; attack the highest-pain, lowest-effort gaps.

1. **Brand Voice profile** *(highest ROI — start here)*
   - User pastes 3–5 of their best-performing posts; we extract tone/vocabulary/structure and
     calibrate the caption/script generator to it.
   - Directly kills the market's #1 complaint ("it all sounds the same"). Small addition to the
     existing `lib/claude/script.ts` path — store a `brand_voice` profile per workspace and
     inject it into the prompt.
   - Success: generated captions pass an A/B "sounds like us" check from the user.

2. **Credit transparency**
   - Surface per-action cost, balance-after, and visible refunds in the UI. We just fixed the
     debit bug — make it legible so "insufficient credits" is never mysterious again.
   - Success: every generative action shows what it cost; failed jobs show a visible refund.

3. **Analytics that say something**
   - Turn the weekly `analytics_reports` cron into per-post performance + a plain-language
     "what worked / do more of this" summary (we already pull Ayrshare analytics).
   - Success: a user can answer "what should I make more of?" in one screen.

4. **Device mockups** *(§2b gap 1 — smallest real step toward agency parity)*
   - A frame plate with a transparent screen region; the screenshot sits behind it as a
     normal image layer. No schema change, no new renderer — the compositor already does
     layers and masks.
   - Success: a phone-in-hand ad, built in the product, that stands next to First Page's
     `TOF_Static-1` without apology.

5. **Media plan** *(§2b gap 3)*
   - One Claude call: brief + connected platforms + budget → channel split, audience,
     schedule. Behind the existing approval gate.
   - Success: the thing they spent two calendar weeks briefing and approving takes 30s.

### ⏭️ NEXT — close table-stakes + extend the moat
6. **Funnel sets** *(§2b gap 2)* — one brief → coordinated TOF/MOF/BOF variants, extending
   `campaign-brief.ts`'s existing `goal` field rather than inventing a new concept.
7. **Carousels** *(§2b gap 4)* — N frames, one brand system, exported as an ordered set.
8. **Ideation / trend engine** — suggest *what* to post (trending topics, a content calendar).
   This is the tied-#1 use case we're missing entirely.
9. **Pre-publish performance score** — predict which generated creative will perform. Our
   generative moat + a virality score is genuinely unique: nobody else can score *generated*
   variants before they exist.
10. **Scheduling calendar UI** + bulk/queue.

### 🔭 LATER — expand surface
11. **Landing pages** *(§2b gap 5)* — brief → copy → hosted page.
12. **Paid ad buying** *(§2b gap 6)* — Meta Marketing API. The line between replacing their
    studio and replacing their agency.
13. **Long-form repurposing** (podcast/webinar/transcript → clips + posts) — content-agent
   skeleton already exists.
14. **Team approval workflows** — ✅ largely shipped (`campaigns.approval_status`).
15. **Social inbox / engagement** — a separate, bigger bet.

---

## 4. Changes (not just builds)

- **Reposition marketing**: from "AI social tool" (crowded, commoditized) to
  **"generative content studio that publishes"** — the one place to *make* the asset, not just
  schedule it.
- **Pricing story**: competitors are flat $15–159/mo; our credits-at-10×-markup needs framing
  as **"studio time"** (real video/music generation is genuinely expensive), or users anchor on
  flat-fee tools and balk.

---

## 5. Production hardening (parallel track, pre-scale)

Tracked separately but must land before heavy marketing:
- Apply outstanding DB migrations cleanly (e.g. `refund_credits`); reconcile the manual-migration
  drift noted in `db/migrations/README.md`.
- Convert remaining API routes to the `withWorkspace` scoped layer (only `credits/balance` done
  as reference) — closes the cross-tenant leak class.
- RLS audit on the legacy tables flagged for Phase 6.
- Rate limiting, Sentry, error budgets, E2E tests on the credit + publish paths.

---

## 6. First trigger

When we pull the trigger, **start with Brand Voice** — highest impact, lowest effort, attacks the
market's #1 pain, and reuses the existing Claude path. Then credit transparency, then the
analytics summary.

---

## Sources
- [Apaya — best AI social tools 2026](https://apaya.com/blog/best-ai-social-media-tools)
- [Predis.ai vs Ocoya](https://predis.ai/resources/predis-ai-vs-ocoya/)
- [sociality.io — 2026 AI in social media report](https://sociality.io/blog/ai-in-social-media-marketing-report/)
- [SocialPilot — AI content creation tools](https://www.socialpilot.co/ai-social-media-content-creation-tools)
- [Publer — social media AI tools](https://publer.com/blog/social-media-ai-tools/)
