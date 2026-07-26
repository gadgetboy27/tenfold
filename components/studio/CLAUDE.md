# components/studio — Studio, the main site

`components/studio/Studio.tsx`, rendered directly at `/[workspace]`, **is the
main site** — there is no separate classic homepage anymore. The frame stays
put; only the canvas morphs per `SectionId` (brief → images → video → music →
caption → compositor → logo → publish). It drives the SAME endpoints the
classic flow used — a surface over existing functionality, not a new engine.

- **There is only one layout now.** The earlier Simple/Cockpit split was
  removed (`BriefCanvas`, `ImagesCanvas`, `VideoCanvas`, `PlaceholderCanvas`,
  the layout toggle, and the `tf-studio-layout` localStorage key are gone).
  Don't reintroduce a second layout without a real reason.
- **Section nav is `StudioNav`, rendered once above every section (2026-07-26).**
  It used to live only inside `CockpitCreate`, which several sections
  (`ProjectsCanvas`, `MusicCanvas`, `LogoStudio`, `CompositorCanvas`,
  `PublishCanvas`) bypass entirely to take over the full `<main>` area — so
  the nav architecturally disappeared on those screens, which is what
  surfaced as "can't get back" reports. It wasn't a state-loss bug: nothing
  here was ever losing data (all per-section state lives in `Studio`'s own
  top-level `useState`, which never unmounts) — the nav rail was just
  missing. Now `Studio`'s `<main>` always renders `<StudioNav>` (a fixed
  `w-[200px]` rail) beside whichever section's content, so every section
  keeps a working, clickable nav. `CockpitCreate` no longer renders the nav
  itself — it only reads `tools` for the "not yet ported" fallback's label
  lookup.
- **Every nav item stays in Studio** via `setSection` — never link out. Only
  Compositor and (flag-off) Logo expose a deliberate `classicHref` "Open in
  classic" button; a truly not-yet-ported section falls back to
  `CockpitCreate`'s generic placeholder (currently unused — Caption was the
  last section on it, see below).
- **Pickers use `StudioSelect`** (`components/studio/StudioSelect.tsx`, built on
  the Radix `dropdown-menu`) — the one dropdown for every choice-range control.
  Don't reintroduce pill rows.
- **Wired inline today:** Brief, Images, Video (Length/Style, plus an
  optional creative-direction prompt), Music (genre + engine, plus an
  optional creative-direction prompt, track sized to video length), Caption
  (below), Logo & Brand (renders the full `LogoStudio` in the canvas when
  `FEATURE_LOGO_BUILDER=1`), Publish (below), and the Gallery (below).
- Tier gating is by capability, not layout: `ent.proEffects` drives the locked
  "AI-Photoshop" effects.

## Creative-direction prompts — Video and Music (2026-07-26)

Both `VideoInputs` and `MusicCanvas` gained an optional free-text textarea
("Creative direction" / "Describe the vibe") alongside their existing
dropdowns. This isn't new plumbing — `app/api/jobs/route.ts`'s
`buildFalInput` already read `params.variationDirection` and folded it into
the composed prompt for both video and the non-vocals music engines
(stable-audio/lyria2); it just had no UI surfacing it before now. Studio's
lifted `videoDirection`/`musicDirection` state threads straight into
`generateVideo()`/`generateMusic()`'s existing request bodies as
`variationDirection` — no new fields invented.

One real gap found and fixed: the ACE-Step (vocals) music engine has its
own `{tags, lyrics, duration}` schema and didn't consume
`variationDirection` at all — `buildFalInput`'s ace-step branch now appends
it to `tags` so the direction field works consistently across all three
engines, not just two.

Separately, `generateVideo()`'s `params.prompt` has always been sent as a
hardcoded empty string — video generation today is driven purely by
duration/style presets plus (now) this direction field, **not** by the
original campaign image prompt as an earlier read of this code assumed.

## Caption — `CaptionCanvas`, reusing an existing backend entirely (2026-07-26)

`components/studio/CaptionCanvas.tsx`: a topic textarea (prefilled from
Studio's root `prompt`, editable), platform + tone pickers, Generate/
Regenerate, and a Copy-to-clipboard result. Posts to the **already-complete**
`POST /api/jobs` (`type: "script_generation"`) — `lib/claude/script.ts`'s
`generateScript()` (platform-native voice, banned-cliché rules, brand-voice
override, all pre-existing) was already wired end-to-end via this route; the
only thing missing was a Studio UI calling it. `businessName` is filled from
the campaign's own name (`campaignName` state) rather than a separate
workspace-name fetch — a pragmatic stand-in, not a new lookup.

Not done this pass: feeding the generated caption directly into
`PublishCanvas`'s own caption field (would need lifting shared state across
sections, same pattern as Brand Brain's `websiteAnalysis` below) — v1 is
standalone generate-and-copy.

Deliberately does not import `lib/claude/script.ts` directly (constructs
the Anthropic client at module scope) — same safe pattern as
`BrandImportPanel`/`BrandAnalysisResults` below.

## Brief — `BrandImportPanel` + `BrandAnalysisResults`, "Brand Brain" from a URL

`CockpitCreate`'s Brief/Images step has a `createMode` toggle (lifted to
`Studio`'s top level, not local — see below) alongside the free-text prompt
textarea: "Write a prompt" vs. "Import from your website".

**Split across two components (2026-07-26), not one** — comparing 4
detailed campaign angles needs real width, which the cramped left control
column doesn't have:

- `components/studio/BrandImportPanel.tsx` — input only. Renders in the
  left column in website mode: the URL field, the explainer card, and the
  Analyze button. Posts to the extended `POST /api/campaigns/analyze-url`
  (PRODUCT_STRATEGY.md §4 item 6) and hands the result up via `onResult`,
  never rendering it itself.
- `components/studio/BrandAnalysisResults.tsx` — the brand-kit preview +
  4 campaign-angle cards (title/goal/strategy/keyMessage/visualStyle),
  spread out in a real grid. Renders in the large right-hand "Result"
  canvas, taking priority over the empty-state placeholder whenever
  `websiteAnalysis` state is set.

**State lives in `Studio`'s top-level component, not CockpitCreate** —
`createMode` and `websiteAnalysis` are passed down as props to
`CockpitCreate`, which renders `BrandImportPanel` on the left (feeding
`onWebsiteAnalysis`, i.e. `setWebsiteAnalysis`) and `BrandAnalysisResults`
on the right (fed `websiteAnalysis` directly). This is what lets one
result live in two different parts of the screen.

Picking an angle calls `onChooseWebsiteAngle` (→ `Studio.tsx`'s
`chooseWebsiteAngle`), which sets the prompt, clears `websiteAnalysis`
(so the canvas falls through to the normal generating/result branches),
switches `createMode` back to `"prompt"`, and calls `generate(angle.
imagePrompt)` immediately — **`generate()` takes an optional override
prompt argument specifically for this**: calling `setPrompt(x)` then
`generate()` in the same handler would otherwise read the pre-update
`prompt` from `generate`'s closure (stale by one render), since React
doesn't re-render synchronously. Passing the value explicitly sidesteps
that entirely. The normal `onGenerate` button still calls `generate()`
with no argument, using `prompt` state as before.

**Both components deliberately do not import `lib/claude/campaign-brief.ts`
or `lib/claude/brand-scrape.ts`** — those touch `@anthropic-ai/sdk` (the
former constructs an Anthropic client at module scope) and both are
`"use client"` components. `BrandImportPanel` declares (and exports) its
own local response-shape interfaces instead of importing the server-side
ones, by design; `BrandAnalysisResults` imports those as `import type`
only (erased at compile time, no runtime coupling) — see
`lib/credits/CLAUDE.md` and the 2026-07-25 incident it documents for why
that boundary matters here specifically.

## Publish — `PublishCanvas`, ported from the classic dashboard's `Step6Publish`

Was a placeholder until PRODUCT_STRATEGY.md §4's "platform-native defaults"
item surfaced that publishing was **unreachable in the live app entirely** —
Studio's own "Publish" section fell through to the generic not-built
placeholder, and the real, working publish UI (`components/steps/
Step6Publish.tsx`, platform picker + AI caption fitting + hashtags +
scheduling) belonged to `StepView`/`DashboardClient`, which no route renders
since Studio became the main site.

`components/studio/PublishCanvas.tsx` reuses the same endpoints
(`/api/publish`, `/api/publish/adapt-captions`, `/api/social/*`) against
Studio's own state (`campaignId`/`anchorId`/`workingImage`/`videoUrl`)
instead of the classic `useAppStore` campaign. Simplified from
`Step6Publish`'s dual independent image+video platform sets to one target
(video preferred when both exist) — bring the dual model back if it's
actually wanted later. Caption AI-fitting (existing `adaptCaptions`) is now
automatic on platform selection, not a manual button click. Music defaults
per platform (`lib/social/platform-defaults.ts` — LinkedIn/Pinterest/Reddit/
GMB/Telegram default off) via a new `noMusic` flag on `/api/publish` that
skips the mix step and posts the raw clip.

**External entry points now use URL params, not `useAppStore`.** The
Compositor's "Continue to publish" and the Productions page's "Publish" used
to populate the classic store (`lib/campaign/publish-nav.ts`,
`openCampaignForPublish` — now deleted) and `router.push` to the workspace
root expecting the classic dashboard to read it — since that's Studio now,
it silently landed on a blank Brief screen. Both now do
`router.push('/${slug}?openProject=${campaignId}&section=publish')`; Studio
has a mount effect that reads those two params, calls its own `openProject`
(the same rehydration the Gallery's cards use), and strips the params via
`router.replace`. `openProject`'s video lookup was also fixed to prefer
`composed_video` over raw `video` (matching `/api/publish`'s own
preference) — it only checked `video` before, so opening a project whose
only video was the Compositor's branded export showed no video at all.

**Approval gate.** `PublishCanvas` fetches the campaign's `approval_status`
(`GET /api/campaigns/[id]`) and the caller's `role` (`GET /api/workspaces/me`)
on mount, and shows a status banner above the caption with the
role-appropriate action: a `member` on a `draft` campaign gets "Submit for
review"; an `owner`/`admin` gets "Approve" (and "Request changes" when
`pending_review`). The Publish button itself is disabled client-side when
`role === 'member'` and the campaign isn't `approved` — but this is UX, not
the gate; `POST /api/publish` enforces it server-side regardless (see
`app/api/CLAUDE.md`).

## Gallery — the `"projects"` section, reachable via the logo click

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
`LeftRail`, `RightPanel`, `components/campaign/CampaignBriefPanel.tsx`,
`components/steps/Step1Create.tsx`–`Step6Publish.tsx`,
`components/hooks/ABVariantsPanel.tsx`) was deleted 2026-07-26 — confirmed
zero real importers anywhere in the repo first (two independent audits,
plus a clean `tsc`/production build after deletion). `Step6Publish.tsx` was
the classic file `PublishCanvas.tsx` above was ported from; only the
original was deleted, `PublishCanvas.tsx` is unrelated and stays.

`components/layout/AppHeader.tsx` and `TopBar.tsx` are NOT part of that
deletion despite living in the same directory — separate, live, shared
components (used by the still-real `compositor`/`logo` "Open in classic"
routes below, and by Studio itself).

## Auth — one shared membership check for every `/[workspace]/*` route

`app/(dashboard)/[workspace]/layout.tsx` checks login AND workspace
membership (via `workspace_members`) before any nested route renders —
including Client Component pages like `compositor/page.tsx`, since Next.js
runs an ancestor layout server-side first and can redirect before the child
page ever mounts. Redirects a non-member to their own workspace (via the
existing `getOrProvisionWorkspace`, `lib/auth/provisioning.ts`), not to
`/login` — they're authenticated, just requested the wrong slug. Individual
`/[workspace]/*` pages/layouts (e.g. `settings/layout.tsx`) don't need their
own membership check anymore; a new route under this path is covered
automatically.

`compositor/page.tsx`, `logo/page.tsx`, and `productions/page.tsx` are
**not** classic-dashboard dead code, despite predating Studio — they're
Studio's intentional "Open in classic" escape hatches (`classicHref` in
`Studio.tsx`) for Compositor and Logo when not fully ported inline, and
`productions` is linked in turn from the compositor page. Real, reachable,
kept.
