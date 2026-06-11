# tenfold.nz — Product Roadmap

> Strategy + prioritized backlog. Living document — update as we learn.
> Last updated: 2026-06-11

---

## 0. Where we are (baseline)

The core pipeline works end-to-end in production (verified 2026-06-11):

**prompt → 6 images (FLUX Pro) → pick anchor → branch (video / music / caption / variations) → compose + brand kit → publish to ≤13 platforms (Ayrshare).** Credits ledger + auth + Google/email signup all functioning.

Recently shipped: runtime env injection, scoped `withWorkspace` routing layer, asset comments + AI suggestions, instant signup, prompt-validator assist, and the credit-debit fix.

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
| Multi-platform publish | core | Ayrshare ×13 | on par |
| Brand **kit** (logo/colour) | common | overlays / stamping | on par |
| Human-in-loop review | 78% edit before post | asset comments (shipped) | on par |
| **Brand VOICE consistency** | **#1 complaint** | generic Claude tone | **BUILD** |
| **Analytics / reporting** | **#1 use case** | basic weekly cron | **REFINE** |
| **Ideation / trend research** | **tied #1 use case** | none | **BUILD** |
| **Performance / virality prediction** | emerging (OpusClip) | none | **BUILD** |
| Scheduling calendar UX | core | schedule stage exists | **REFINE** |
| Long-form → clips repurposing | OpusClip | content-agent skeleton | refine |
| Social inbox / engagement | Sprout / Hootsuite | none | later (different bet) |

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

### ⏭️ NEXT — close table-stakes + extend the moat
4. **Ideation / trend engine** — suggest *what* to post (trending topics, a content calendar).
   This is the tied-#1 use case we're missing entirely.
5. **Pre-publish performance score** — predict which generated creative will perform. Our
   generative moat + a virality score is genuinely unique: nobody else can score *generated*
   variants before they exist.
6. **Scheduling calendar UI** + bulk/queue.

### 🔭 LATER — expand surface
7. **Long-form repurposing** (podcast/webinar/transcript → clips + posts) — content-agent
   skeleton already exists.
8. **Team approval workflows** — build on asset comments.
9. **Social inbox / engagement** — a separate, bigger bet.

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
