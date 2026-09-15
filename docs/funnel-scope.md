# The Funnel — scope

**Status: PROPOSAL, 2026-09-15.** Nothing here is built. Written from a spec-v2
brief ("The Funnel") reviewed against the codebase on the same day; the brief's
architecture survives, three of its assumptions don't (§11). Read this the way
`landing-pages-scope.md` is read: the reasoning is the spec, and if a build
decision isn't covered, re-read the _why_ for that section.

---

## 0. What this is, in one paragraph

A **funnel** is three coordinated ad sets — **TOF / MOF / BOF** (top, middle,
bottom of funnel) — each saying a different thing to a stranger, a warm
prospect and a hot one, run as **paid Meta ads** to three different audiences.
The Funnel is a mode that takes **a project the user already has in the
Gallery** and props it up into that structure: three stages of creative in
1:1 and 9:16, copy per stage, a landing page that continues the top-of-funnel
promise, a media plan that says how to run it, and a **vision QC gate** that
blocks anything off-message, illegible or off-brand before the user sees it.

**Not a new generator.** It is an orchestration + template + QC layer over
the pipeline that already exists. If a proposal here forks the engine, the
proposal is wrong.

---

## 1. Why — the defects it exists to make impossible

The origin is a real agency deliverable (~$1,300/mo, property app, Dec 2025;
see the `firstpage-origin-and-gap` memory). Competent structure — TOF/MOF/BOF,
brand gradient, phone mockups — and five shipping-grade defects. Each maps to
a structural fix, not a reminder:

| Defect in the agency's work                                             | Why it happened                                          | What makes it impossible here                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Headline said "Sell your home", the phone showed a _commercial_ listing | Placeholder screenshot never checked against the message | Screenshots carry a **label** (what they show); the compositor picks by label match; QC re-checks (§6, §7) |
| Dark price text on busy light photos, skewed on angled phones           | No contrast rule, no safe zone                           | Fixed text zones + **auto-scrim** on measured contrast (§5.4)                                              |
| Flat phone for two stages, a different angled phone for the third       | Assets assembled by hand from templates                  | A **device frame library**; one frame per funnel unless opted out (§5.2)                                   |
| Stock backgrounds, template batches, Lovable landing page               | Generic inputs                                           | Scenes generated from the _product brief and stage angle_; landing page continues the TOF promise (§8)     |
| The product's actual differentiator barely appeared                     | Nobody wrote it down                                     | The brief extracts `usp[]`; STRATEGISE is told to lead with it (§6)                                        |

**The thesis, and the acceptance test for the whole module:** the vision QC
gate returns `message_match: false` and blocks publish when handed a
mismatched screenshot. If that can't be made reliable, stop at Phase 4 (§12).

HouseMatch is the **worked example** throughout this doc, nothing more. The
Funnel operates on whichever Gallery project the user picks, the minute they
pick it.

---

## 2. The one design decision: a funnel props up an existing project

Today's unit of work is the **campaign row**: prompt → 4–8 creative directions
→ assets tagged `campaign_id`. The Gallery groups by it; Studio opens it;
compositions, landing pages, publish records and `campaign_runs` all hang
off it.

**A funnel is a group of three ordinary campaigns.** Not a new object type
with its own assets, editor and publish path — three campaign rows carrying a
stage tag, under a small parent row. Everything already built keeps working
on each stage untouched:

- Gallery: three projects under one "Funnel" header, not a new screen.
- Studio: open a stage exactly like any project today.
- Compositions, landing page, publish records, foreman runs: per campaign,
  as now.

And it gives the entry point the user actually wants: **"Funnel this project"**
on any Gallery project. The chosen project — its anchor, its brand, its
prompt — becomes the TOF stage; the funnel builder generates MOF and BOF
_around_ it. A brand-new funnel is the same thing starting from a fresh
project. The funnel is an **option** beside everything else, never a
prerequisite for it.

---

## 3. What exists and is reused (the reuse map)

| Brief section                                 | Existing code                                                                                                                                                 | Reused for                                | Gap                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------- |
| INGEST — product brief from URL + screenshots | `lib/claude/brand-scrape.ts`, `lib/claude/campaign-brief.ts` (URL → angles), `lib/claude/brief-agent.ts`                                                      | Product brief, USPs, tone                 | **Screenshot labels** — new                                |
| STRATEGISE — stage angles                     | `campaign-brief.ts` angles (goals awareness/conversion/…), `lib/claude/hooks.ts`                                                                              | Base for a stage-aware prompt             | No TOF/MOF/BOF concept anywhere                            |
| COPY                                          | `lib/claude/script.ts`, `hooks.ts`, `adapt-captions.ts`, brand voice                                                                                          | Stage copy variants                       | Meta char caps + stage instruction                         |
| SCENE-GEN                                     | `lib/fal/reserve-space.ts` ("leave this area quiet, render no text"), `text-in-image.ts` model routing, `prompts.ts` style suffixes                           | Backgrounds with room for type            | Stage-scene composer (§6)                                  |
| COMPOSITE                                     | `lib/composition/*` — layers, three aspects, per-format overrides, `formats.ts` safe zones, `brand-apply.ts`, scrim, `backdrop.ts` contrast pick, `export.ts` | The render engine                         | **Device frames**; a **locked template** mode (§5)         |
| QC                                            | `lib/claude/ad-watcher.ts` (Claude vision reviews a rendered ad via forced tool-call), `lib/composition/autofix.ts` (vision layout nudges)                    | The vision plumbing                       | They _advise_; nothing **blocks** (§7)                     |
| LANDING                                       | `lib/landing/*`, `/p/<slug>`, lead form, brand-token theme snapshot (built 2026-09-09)                                                                        | The destination page                      | Takes the TOF angle as input; **Meta Pixel** (§8)          |
| Job graph                                     | `lib/foreman/*`, `campaign_runs` (0029) — resumable stages, advanced from the fal webhook. **Dark-launched, never run in anger**                              | The orchestration                         | Three linked runs; first real run is a scheduled risk      |
| Credits                                       | `lib/credits/*`, `CREDIT_COSTS`                                                                                                                               | Bundle + per-action pricing               | New keys (§10)                                             |
| Publish                                       | `POST /api/publish` — organic, own connections                                                                                                                | **Not** the destination for paid creative | Marketing API is new (§9)                                  |
| Brand tokens                                  | `brand_kits` — primary/secondary/accent, font, logo + dark logo, voice                                                                                        | The token source                          | The brief's `brand` table duplicates this; don't create it |

What's genuinely new: the product-asset model with labels, the funnel/stage
grouping, the device-frame library, the locked template, the stage-scene
composer, the QC gate with retry, the media plan/runbook, carousel, the
package export, and (later) the Marketing API launch.

---

## 4. Data model — extend, don't fork

All tables `workspace_id`-scoped, RLS on, per CLAUDE.md §2.

```
product_assets                 -- REAL screenshots / photos, never AI-invented
  id, workspace_id, campaign_id (nullable: a product outlives one project)
  kind        'app_screenshot' | 'product_photo' | 'other'
  storage_path, width, height
  label       text  -- WHAT IT SHOWS: "residential listing card, $850k"
                    -- ^ the message-match guardrail. Written by the user,
                    --   proposed by vision at upload; never empty.

funnels
  id, workspace_id, created_by
  name, objective  'leads' | 'sales' | 'installs' | 'traffic'
  product_brief    jsonb   -- INGEST output (name, one_liner, usp[], proof_points[], audience, tone)
  plan             jsonb   -- STRATEGISE output (stages[], throughline)
  frame_id         -> device_frames   -- ONE frame per funnel (§5.2)
  status           'draft' | 'generating' | 'qc' | 'needs_review' | 'approved' | 'packaged'
  media_plan       jsonb   -- §9 runbook
  checklist        jsonb   -- Ads Manager steps ticked, e.g. { pixel: true, tof_live: '2026-10-01' }
                           -- position in the journey is NOT stored: derived, §8b
  credits_spent, created_at

campaigns.parameters.funnel = { id, stage: 'TOF'|'MOF'|'BOF', angle, hook, cta }
  -- each stage IS a campaign row. No new creative table: assets, compositions,
  -- landing_pages, publish_records, campaign_runs already key off campaign_id.

device_frames                  -- the locked mockup library
  id, name ('front_on' | 'three_quarter'), mockup_asset_path
  screen_x, screen_y, screen_w, screen_h, screen_rotation
  is_default  -- exactly one

compositions.doc.layers[]      -- gains one layer kind (§5.1):
  { kind: 'device', frameId, screenshotAssetId, ... }

qc_reports
  id, workspace_id, campaign_id, composition_id, aspect
  passed bool, checks jsonb  -- [{check, pass, severity, note}]
  attempt int, model, created_at
  -- append-only; the audit trail and the client-facing "checked" proof
```

`brand_kits` gains `pixel_id` (§8). Nothing else changes shape.

**Why `product_assets` is separate from `assets`:** `assets` is what the
pipeline _produced_; product assets are what the user _supplied_ and must
never be confused with generated imagery. The label column is the whole
point, and a generated asset has no honest label.

---

## 5. The locked template (consistency by construction)

The existing compositor is a free editor: every layer placed by hand. That is
right for one ad and wrong for a set — it is exactly how the agency drifted.
A funnel renders through a **template mode** of the same engine: the same
`CompositionDoc`, the same `render.ts`, the same export — but assembled by
code from tokens, with the user restyling _tokens_, not layers.

### 5.1 One layer stack, fixed order

```
5  logo        brand_kits logo (contrast-picked vs the scene, as brand-apply does now)
4  text        headline + subhead + CTA pill — tokens, grid-snapped into the text zone
3  scrim       conditional — §5.4
2  device      device_frames frame + the REAL screenshot in its screen rect   ← NEW layer kind
1  scene       AI background: text-free, UI-free, with reserved space
```

The `device` layer is the one addition to `layers.ts`: an image layer that
draws the frame and clips the screenshot to `screen_{x,y,w,h,rotation}`.
It renders in the canvas preview and in the FFmpeg/Sharp export through the
same path as every other layer, so preview and output cannot disagree.

### 5.2 Device frames: a named set, one per funnel

Two frames to start — `front_on` (default) and `three_quarter`. Variety is a
deliberate choice from the set; a funnel uses **one** frame across every stage
and aspect unless the user opts out. The memory note records that a phone
mockup was the agency's most-used element (5 of 9 assets) and the thing the
app couldn't do; it is also the cheapest item in this document.

### 5.3 Tokens, not hand-picked values

The template reads `brand_kits` — colours, font, logo, radius — and nothing
is re-chosen per asset. Change a token, the funnel restyles. This is the
existing `brand-apply.ts` rule extended to the whole layout.

### 5.4 Zones per aspect, and the scrim rule

```
1:1  (1080×1080)                 9:16 (1080×1920)
 ┌──────────────────┐             ┌──────────────────┐
 │ TEXT ZONE   38%  │             │ LOGO        12%  │
 ├──────────────────┤             │ TEXT ZONE 12–46% │
 │ DEVICE ZONE 62%  │             ├──────────────────┤
 └──────────────────┘             │ DEVICE  46–100%  │
 8% margins. Text never enters    └──────────────────┘
 the device zone; the device never enters the text zone.
```

`formats.ts` already models per-placement safe zones (the UI chrome Meta
draws over a Story); the template zones sit inside them. Auto-scrim: measure
the luminance behind the text zone (the `backdrop.ts` sampler does this for
logos today); if WCAG contrast against the text colour is under 4.5:1, insert
the scrim layer (brand gradient at 60% or solid). Legibility is guaranteed
regardless of what the scene came back as.

The 1:1 and 9:16 outputs are two layouts of one system, not two designs.

### 5.5 Carousel

An N-frame set is the same template with a `panel_index`; the template
carries the frame across panels and only the copy and screenshot change. It
is an extension of §5, not a separate feature.

---

## 6. Prompting — how three stages stay relevant and stay one family

Today `validatePrompt` has Claude turn _one_ prompt into 4–8 "lenses" on the
same idea, each its own fal request. Logo Studio does the equivalent with six
fixed aesthetic directions appended to one composed base. The Funnel does the
same thing one level up: **a scene per stage angle**, from a composer like
`composeLogoPrompt`.

```
STRATEGISE (Claude, JSON tool) : product brief + objective → per stage { goal, angle, hook, cta } + throughline
stageScenePrompt(stage, angle, brand, aspect) →
  [scene derived from the angle]              ← what differs per stage
  + brand mood suffix                          ← fixed across the funnel
  + reserve-space clause for the text zone     ← fixed per aspect
  + "clean surface for a phone" in the device zone
  + "no text, no screens, no UI, no logos"     ← always
  same model, same style suffix, same Kontext reference if a product photo exists
```

What differs is the _kind_ of scene the stage calls for — TOF: the pain or
the aspiration, wide and emotive; MOF: the product in use, closer; BOF:
specific and urgent, tight. Worked example, HouseMatch-shaped:

```
TOF  "A young NZ couple on the doorstep of a weatherboard house, morning light,
      hopeful — generous empty upper third for text, clean surface lower right
      for a phone, no text, no screens, no UI, no logos"
MOF  "Hands holding a phone at a kitchen bench, coffee, relaxed weekend —
      phone screen blank, empty left third for text, no text, no UI"
BOF  "Close crop of a SOLD sign on a suburban fence at golden hour, shallow
      depth of field — empty upper half for text, no signage lettering"
```

What keeps them one family is the fixed part — the same model, mood suffix,
zones and reference — which matters more than the brief's "fixed seed" (a
seed only gives family resemblance with the _same_ prompt).

**And the part that differs from every other generator in the app:** the thing
that makes the ad about _this_ product never goes through the model. The
scene prompt ends "no screens, no UI" every time; the phone and screenshot are
composited afterwards, the screenshot chosen because its **label** matches
the stage angle. The model's job shrinks to "a good background that leaves
room" — the job it is actually reliable at.

---

## 7. The QC gate — the thesis

`ad-watcher.ts` already sends rendered frames + the brief to Claude vision
through a forced tool call and gets structured notes back. The gate is that
call with a different tool schema and, critically, **a consequence**:

```
input:  rendered creative (each aspect), intended headline, stage angle,
        product one-liner, EXPECTED screenshot label, brand tokens
output: { message_match, legibility, brand_consistency, policy_risk }
          each { pass: bool, note }, overall_pass, highest_severity
```

- `overall_pass: false` → **bounded auto-fix**: swap to the best-matching
  labelled screenshot, or add the scrim, or regenerate the scene — max 2
  attempts — then `needs_review` with the report attached. Never a silent
  regen loop (§11 of CLAUDE.md's audit lessons).
- Every report is appended to `qc_reports`. It is the audit trail _and_ the
  thing the user can show a client: "every asset was checked for X, Y, Z."
- `policy_risk` is advisory only in v1. Vision models are good at
  message-match and legibility and unreliable at Meta policy; the claim is
  bounded from day one so it never has to be walked back.

**Acceptance test (Phase 4):** deliberately assign the commercial-listing
screenshot to the "Sell your home" headline → `message_match: false`,
publish/package blocked, report says why. If this is not reliable, the module
stops here and the parts already built (device frames, labels, template) stay
as ordinary compositor features.

---

## 8. Landing page and the Pixel

`lib/landing` already writes a page from a campaign with the brand theme
snapshotted and a lead form that stores to our DB. Two additions:

1. **Input: the TOF angle.** The page must continue the exact promise of the
   winning TOF creative — hero echoing the headline, benefit blocks tied to
   the `usp[]`, one CTA. Ad-to-page match is where funnels leak.
2. **The Meta Pixel.** BOF is retargeting — "visited the page, didn't act" —
   and Meta can only build that audience if `/p/<slug>` fires the Pixel (and
   ideally the Conversions API from the lead form). `brand_kits.pixel_id` +
   a script tag. Without this the BOF stage has no audience to run to, and
   nobody would guess that from "generate BOF creative".

Leads land on **our** page in v1, not Meta instant forms: we hold the lead,
the page is message-matched, and no leadgen-API integration is needed.

---

## 8b. Leaving and coming back — the funnel is durable state, the browser is a viewer

A funnel is many minutes of work across many screens, and people leave —
close the laptop, go to Billing, open a different project, get interrupted at
"Consider is rendering". Every one of those must land them back exactly where
they were, with nothing lost and nothing re-run. Three rules, each with a
precedent already in the app.

### 1. Nothing about the journey lives in React state

Every fact about where a funnel is comes from rows:

```
funnels.status                 draft | generating | qc | needs_review | approved | packaged
campaigns (×3, stage-tagged)   each stage's own status, anchor, assets
campaign_runs (×3)             the foreman's stages[] — plan AND log, per stage
qc_reports                     which creatives are checked, and how many attempts
landing_pages.published_at     whether the page is live
funnels.checklist              jsonb — the Ads Manager runbook steps ticked (§9)
```

The **position is derived, never stored as a cursor**: "the first stage whose
run isn't complete, else the first creative without a passing report, else
the landing page if unpublished, else the checklist". This is the Logo Studio
rule — phases derived from `status` + which assets exist — and it is why a
refresh mid-flow there rehydrates correctly. A stored "current step" column
would drift from the rows the moment a webhook landed while the tab was shut.

`lib/studio/flow.ts` (`resumeSection`, `remainingSteps`) is the model for the
derivation: one pure function, one list, so the resume button, the progress
header and the "what's next" prompt can never disagree.

### 2. Work in flight keeps going without the browser

Rendering, copy, QC and the landing page run on the **foreman**
(`campaign_runs`, advanced from the fal webhook — `lib/foreman/advance.ts`)
and on the same reclaim/sweep paths every other job uses (`lib/logo/
reclaim.ts` pattern, `lib/jobs/sweep.ts`). A stage that was rendering when
the tab closed is finished, checked and waiting when the user returns. The
funnel's own driver is the same loop: when a stage's run completes, the
webhook path starts the next stage — no client tick required. **This is the
foreman's first real use, and the reason it is Phase 4's risk, not Phase 6's.**

### 3. Every door back is wired, in both directions

The link between a funnel and its projects is stored on **both** sides:
`funnels.id` on the parent and `campaigns.parameters.funnel = { id, stage }`
on each child. So:

- **Gallery** — the funnel header shows its derived position as the action:
  _"Resume — Consider is rendering"_, _"Resume — 2 creatives need review"_,
  _"Resume — set up the Pixel"_. One click lands on that step.
- **Any stage opened as a normal project** (Studio, Compose, Publish) shows
  a banner: _"Part of Funnel: Spring launch — Reach stage (1 of 3)"_ with the
  way back. Editing the stage there is legitimate — it's a campaign — and the
  funnel sees the edit because it reads the same rows.
- **The last-open pointer** — `tf_funnel_open_<workspace>` in localStorage,
  the same shape as `rememberOpenLogo` / `tf_last_section_<campaign>`: a
  cursor is personal to one browser, not workspace state worth a migration.
  It only says _which_ funnel to reopen; _where_ in it is derived (rule 1).
  Wrapped like the logo one — a thrown localStorage is a lost convenience,
  never a broken screen.
- **A project deleted from under a funnel** drops to `needs_review` with the
  reason, never to a 404 the resume button keeps hitting (the logo studio's
  "polling forever at a 404" lesson).

### 4. What "resume" must never do

- **Re-run a completed stage.** Each node is idempotent on its rows: the
  driver checks `campaign_runs` before submitting, and the credit debit for a
  stage happens once, inside that stage, never at funnel start (CLAUDE.md §2
  atomicity). Reopening a funnel costs nothing.
- **Re-check a passed creative.** A passing `qc_reports` row for the current
  composition version is final until the composition changes.
- **Forget a partial stage.** Two of six renders landed and the tab closed:
  the four remaining arrive via webhook or reclaim, the run completes, the
  header updates. Same partial-set rule as the multi-image gate.

Phase 4's DoD includes this explicitly: start a funnel, close the browser at
each of the seven positions above, reopen from the Gallery, and land on the
right step every time with every credit accounted for once.

---

## 9. Where the creative goes — and the gap we have to carry the user across

`POST /api/publish` posts **organic** content to a connected Page/IG/TikTok/
Bluesky. A funnel's creative is **paid media**: it is loaded into Meta Ads
Manager as ads → ad sets → campaigns, each with an objective, an audience and
a budget. Different API, different consent, different object:

|           | Organic (have)                                                         | Paid (need)                                                                            |
| --------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Scopes    | `pages_show_list`, `pages_manage_posts`, `pages_read_engagement` (+IG) | `ads_management`, `ads_read`, `business_management`                                    |
| Object    | Page / IG account                                                      | Ad Account `act_<id>` with a payment method the user set                               |
| Endpoints | `/{page}/feed`, `/{ig}/media`                                          | Marketing API: `/act_id/campaigns` → `/adsets` → `/adimages` → `/adcreatives` → `/ads` |
| Meta gate | standard                                                               | **App Review** for `ads_management` + business verification                            |

**`/api/publish` stays organic. It never grows an ads mode.** Launching a
funnel is a separate route (`POST /api/funnels/:id/launch`) behind a second
consent ("Connect your ad account"). It creates the whole tree **paused** —
a campaign per stage with its objective, an ad set with audience and daily
budget, the images as `adimages`, an `adcreative` pointing at the Page + the
landing page URL + primary text/headline, the ads — so the user reviews in
Ads Manager and presses go. No spend happens on our say-so. Pixel and the
retargeting custom audience can be created through the same API.

Meta's development-tier access lets an app manage ad accounts its own admins
own _before_ review, so this is buildable and testable end-to-end on our own
ad account; review is only needed to open it to other users, and it takes
weeks. Therefore:

**v1 ships the package + the runbook; the API launch follows.**

The runbook is the schooling, and it is not optional. The distance between
"here is a ZIP of ads" and "leads arriving" is exactly the work the agency
was paid for, and a small-business owner will not know which stage goes under
which objective, that TOF must run first so MOF has an audience, that BOF
needs the Pixel, or that launch budgets skew roughly 60/25/15. Three layers,
cheapest first:

1. **The media plan is a runbook, not a benchmark sheet.** "Campaign 1 —
   objective Traffic — these four ads — this audience — $X/day — 7 days;
   then Campaign 2…". ZIP filenames match the ad names in the plan so the
   user follows it line by line.
2. **A "Run it in Ads Manager" guide** at `/guides/…` (`lib/marketing/
guides.ts`), with screenshots, written once, linked from every funnel.
3. **An in-app checklist on the funnel**: Pixel installed → TOF live → 7 days
   → MOF live → BOF live, each step explaining its prerequisite at the moment
   it matters. The Marketing API later replaces steps with buttons; the
   checklist ships first and teaches us where people get stuck.

**Results:** analytics v1 reads organic engagement (Ayrshare, dark). Paid
performance lives in Marketing API Insights, so the "learn from the client's
own winners" loop arrives with the API, not before.

---

## 10. Credits

Priced from `CREDIT_COSTS` like everything else; never a literal. A funnel is
a **bundle** — the sum of what it runs (three campaigns of scenes, copy,
landing page, QC passes) at a bundle discount — and every fix is a cheap
top-up: "regenerate one stage", "re-run QC", "swap screenshot" (free — no
inference). Two files move together: `lib/credits/costs.ts` and
`lib/costs/rates.ts`. The QC call is a vision call — price it like
`ad_watch` (6), per creative per attempt, and cap attempts (§7) so a bundle
cannot silently overrun.

---

## 11. Where the brief was wrong about this codebase

1. **"Direct publish via Ayrshare."** Ayrshare is dark; publishing runs over
   our own connections and is organic. Paid ads need the Marketing API (§9),
   which does not exist anywhere in the app. v1 is "checked and packaged for
   Ads Manager", not "built to run".
2. **Its `brand` / `funnel` / `creative` / `copy_variant` tables** duplicate
   `brand_kits`, `campaigns`, `compositions` and campaign state. Extend (§4).
3. **§2 — make it the flagship, nav above Create, wizard as front door.** A
   positioning bet the brief itself says is worse than nothing if half-built.
   It is the _last_ phase, gated on Phase 4 passing and on real users running
   funnels.
4. "Fixed seed per funnel" is a weak lever; the fixed prompt family + model +
   reference is the real one (§6).

---

## 12. Build order — gated, with Definition of Done

Each phase ships on its own. Phase 4 is the acceptance test for the thesis;
nothing after it starts until it passes.

| Phase                          | Build                                                                                                                                                      | DoD                                                                                                                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Device frame + template** | `device` layer kind in `layers.ts` + `render.ts` + export; `device_frames` seed (2 frames); template mode that assembles §5.1 from tokens for 1:1 and 9:16 | An existing project's anchor + an uploaded screenshot → a rendered ad with the phone, text in zone, scrim only when needed, identical in preview and export                                                                                     |
| **2. Product assets + labels** | `product_assets`, upload with vision-proposed label the user confirms; screenshot selection by label match to a stated message                             | Given three labelled screenshots and a headline, the right one is picked; the wrong one never is                                                                                                                                                |
| **3. QC gate**                 | Tool schema on `ad-watcher`, `qc_reports`, bounded auto-fix, `needs_review`                                                                                | **Thesis test:** mismatched screenshot → `message_match:false`, packaging blocked, report explains. Reliable across 10 deliberate mismatches                                                                                                    |
| **4. Stages**                  | `funnels`, "Funnel this project", STRATEGISE + stage-scene composer + stage copy, three campaigns on the foreman (**its first real run**)                  | One click on a Gallery project → TOF/MOF/BOF rendered in both aspects, all QC passing, visible as three projects under one header; **close the browser at any point and resume from the Gallery to the right step, credits debited once** (§8b) |
| **5. Landing + runbook**       | TOF angle into `lib/landing`, `pixel_id` + script, media-plan runbook, ZIP export with names matching the plan, in-app checklist, `/guides` page           | The package a user can take to Ads Manager and follow without asking us anything                                                                                                                                                                |
| **6. Marketing API**           | Second consent, ad account, paused campaign tree, Pixel + retargeting audience creation                                                                    | Launch creates the tree in the user's Ads Manager, paused; verified on our own account before review                                                                                                                                            |
| **7. Positioning**             | Nav placement, first-run entry, pricing page copy                                                                                                          | Only after 4–6 and real funnels running                                                                                                                                                                                                         |

Phases 1–3 are a few sessions on top of what exists and prove or kill the
idea before the expensive parts.

---

## 13. Naming — so it doesn't read as a repeat

The app already has "Campaign" (a project), "Caption" in three meanings (see
`components/studio/CLAUDE.md`), and "Publish" (organic). This module adds:

- **Funnel** — the parent. Never "campaign" (taken).
- **Stage** — TOF / MOF / BOF, shown to users as _Reach · Consider · Convert_
  with the acronym in a hint, because the acronyms are the competence signal
  and the plain words are what a business owner can act on.
- **Checked** — the QC pass, as a badge on the creative and a report the user
  can open. Not "approved" (that's the human approval state machine, §5c of
  CLAUDE.md) and not "QC" in user-facing copy.
- **Launch** — creating the paused tree in Ads Manager (Phase 6). Never
  "publish" (organic, taken).
- **Runbook** — the media plan. "Media plan" in the pricing copy, "runbook"
  in the product, because that is what it is.
