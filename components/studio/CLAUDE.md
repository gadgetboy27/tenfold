# components/studio — Studio, the main site

`components/studio/Studio.tsx`, rendered directly at `/[workspace]`, **is the
main site** — there is no separate classic homepage anymore. It drives the
SAME endpoints the classic flow used — a surface over existing functionality,
not a new engine.

## Wording BEFORE generation — reserve the space (2026-08-25)

The Brief carries an optional **"Wording on the ad"** field and a zone. When
filled, every generated direction is composed to leave that area visually quiet,
and the wording is placed automatically the moment an anchor is picked.

This is strictly better than placing type afterwards, and the reason is worth
keeping: stamping a headline onto whatever the model happened to compose lands
it on a focal point, which is why the Words tool needs a scrim so often. Saying
it up front lets the model compose *around* the gap, so the result looks
designed rather than covered up — and the auto-placed layer sets `scrim: false`,
because reserved space doesn't need rescuing.

**Only the ZONE reaches the model.** `reserveSpaceInstruction()` takes a zone
and nothing else — there is no parameter through which letters could reach a
prompt, which is the same guarantee the Words tool makes, enforced the same way.

`NO_TEXT_INSTRUCTION` is appended **unconditionally**, reserved zone or not:
image models add invented signage, labels and watermarks to product scenes
unasked and it is always wrong. That is where "AUNCEAAN FLEANCE" came from — a
brief that never mentioned text.

The guidance is threaded through **every** path that can produce a direction:
the Claude prompt, `normalizeDirections`'s top-up when Claude returns too few,
and `fallbackDirections` when Claude is unreachable. Miss one and that path
silently generates artwork with no room and invented lettering.

## Words — the model designs, the compositor spells (2026-08-25)

`WordsCanvas` in the rail. You type the exact wording; it becomes a text layer
on the Ad stage. **The letters never reach an image model.**

That distinction is the whole feature. Asking an image model for specific text
is a request, not a constraint — a hot-sauce brief that never mentioned text
came back with bottles reading "AUNCEAAN FLEANCE" and "RAME FOOUCH Côtlene
HOTO". Routing text-bearing briefs to Ideogram (`lib/fal/text-in-image.ts`)
made that much better; it did not make it *guaranteed*. This does.

- **Claude proposes how type should LOOK, never what it says.**
  `wordTreatmentSchema` has zone, font, colour, width and scrim — and **no
  field for letters**. A model that tries to send wording has it stripped by
  Zod. Don't add a `text` field "for convenience": that is the day the
  guarantee dies, and a test pins it.
- **Zones are the nine existing anchors**, not new geometry. Anchor mode is why
  a corner lock-up survives a 1:1 → 9:16 re-render; fraction mode would drift.
- **Fonts are restricted to `BRAND_FONTS`** because those are the five with
  real `.ttf` files in `public/fonts/`. The browser will happily render any
  family, but the FFmpeg export resolves through `FONT_FILES` and silently
  falls back to Inter — accepting an unknown font gives a correct preview and a
  wrong video. A test rejects fonts we have no file for.
- **One layer, replaced not stacked** (`WORDS_LAYER_ID`), same contract as
  `CAPTION_LAYER_ID`. Words are edited iteratively; a fresh uuid per edit would
  pile up overlapping copies, each hiding the last, discovered only at export.
- **Suggestions are free** — one small Claude call. Charging per suggestion
  would tax the exploration the tool exists to encourage.

Still open: font *weight* isn't in the schema (each weight is another font file
to ship), and a user-supplied family needs upload + registration in
`FONT_FILES`, plus a licensing confirmation — many commercial fonts forbid
server-side embedding. Until then, don't offer a free-text font box: it would
preview correctly and export wrong.

## The three-pane shell (2026-08-24) — read this before touching the layout

`<main>` is **tools left │ the ad centre │ generation right**. Picking a tool
no longer replaces the screen; it changes only what the right rail is doing.

| Pane   | What                    | Component                                    |
| ------ | ----------------------- | -------------------------------------------- |
| Left   | section nav, `w-200px`  | `StudioNav` (inside `Studio.tsx`)            |
| Centre | **the ad being built**  | `AdStage.tsx` — mounted once, never unmounts |
| Right  | the selected tool       | the per-`SectionId` switch, in an `<aside>`  |

**The centre never unmounts on a section change.** That's the whole design: it
owns the campaign's `CompositionDoc` (loads `latestCompositionId`, autosaves
on change), so a tool in the rail adds to a canvas already on screen. It IS
keyed on `campaignId`, so switching projects starts clean — don't key it on
`section`.

**`adBridge.ts` is the only supported way to put something on the ad.**
`addImageToAd` / `addVideoToAd` / `addCaptionToAd`. They reach the zustand
store imperatively (`getState()`) rather than taking an `onAddToAd` prop: the
rail is a deep tree of self-contained panels (the four Pro panels take no
props at all), and threading a callback through all of them is exactly the
prop-drilling this avoids. Add a new tool's "Add to ad" here, not inline.

Three constraints that shaped this and will bite anyone who forgets them:

- **A clip can only ever be the BACKDROP.** `layerSchema` is a discriminated
  union of image|text — there is no video layer. Never offer "add clip as a
  layer"; `addVideoToAd` replaces the background and says so.
- **An empty artboard cannot be persisted.** `background.src` is a required
  URL, so there is no such thing as a doc with no backdrop. Before anything is
  placed, `AdStage` draws a *placeholder* at the store's new `pendingAspect`,
  and the first image chosen creates the real doc at that aspect.
- **Captions reuse `CAPTION_LAYER_ID`.** Regenerating replaces the caption
  rather than stacking two overlapping text blocks — the same stable-id
  contract the caption-style presets rely on.

**Rail width is a property of the tool, not a preference.** `RAIL_MODE`
(`Studio.tsx`) is a `Record<SectionId, "narrow" | "wide" | "full">` — a Record
rather than a Set on purpose, so **adding a SectionId is a compile error until
you declare its width**. The alternative is a new tool silently inheriting the
narrow default and overflowing off-screen, which is exactly how the Logo editor
ended up rendering "Apply brand pale…" and "Sa[ve version]" clipped at the
viewport edge.

| mode | who | the Ad stage |
|---|---|---|
| `narrow` (~400px) | generate-one-thing panels | keeps the centre |
| `wide` (~620px) | Gallery, Publish — browsers and multi-step flows | keeps the centre |
| `full` | Compositor, Logo — editors with their own canvas | **stands down** |

`full` replaced a hardcoded `section === "compositor"` exception. Anything with
its own canvas and its own control columns belongs there: two canvases side by
side is worse than one, and squeezing an editor into a column is worse than
both. A `full` tool must not carry a `max-w-*` wrapper either — that re-creates
the squeeze it was widened to escape.

The rail also allows horizontal scroll. Content wider than the pane used to be
clipped silently, which is why this was invisible until someone sent a
screenshot. A panel that renders in the narrow rail must be ONE
column; several (`CockpitCreate`, `CaptionCanvas`, `PublishCanvas`) had
`lg:grid-cols-[…]` splits sized for the old full-width `<main>` and were
collapsed. Note `lg:` is a *viewport* breakpoint, not a container one, so it
does NOT protect you inside a narrow rail — it will happily render two
columns in 400px.

**The Compositor is the one section that keeps the full width, and the stage
stands down for it.** It renders the same composition on its own canvas, and
its inpaint mask overlay is absolutely positioned against that canvas — show
both and you get two identical canvases side by side. Both read the same
store, so nothing is lost. Folding its ops into the rail (so the centre is
the only canvas) is the obvious next step and is NOT done.

- **There is only one layout now.** The earlier Simple/Cockpit split was
  removed (`BriefCanvas`, `ImagesCanvas`, `VideoCanvas`, `PlaceholderCanvas`,
  the layout toggle, and the `tf-studio-layout` localStorage key are gone).
  Don't reintroduce a second layout without a real reason.
- **Section nav is `StudioNav`, rendered once beside every section (2026-07-26).**
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
  (below), the four Pro tool panels (below), Logo & Brand (renders the full
  `LogoStudio` in the canvas when `FEATURE_LOGO_BUILDER=1`), Publish (below),
  and the Gallery (below).
- Tier gating is by capability, not layout: `ent.proEffects` drives the locked
  "AI-Photoshop" effects.

## The four Pro tool panels — rendered, not rebuilt (2026-07-28)

`ProductShotPanel`, `VirtualTryOnPanel`, `TalkingVideoPanel` and
`AutoCaptionPanel` (nav labels: Product shot, Virtual try-on, Spokesperson,
Subtitles) were **fully built and completely unreachable** — routes, credit
costs, `UPSELLS` entries, store drafts and Zod schemas all shipped, but no
component imported them, so no screen rendered the UI. Wiring them into
`Studio`'s nav was the entire fix; none of their internals changed beyond
`export default` → `export` to match the repo's named-export convention.

Each panel is self-contained (no props) and reads `workspaceSlug` +
`currentCampaignId` off `useAppStore`. **That store field is why a naive
wiring silently fails:** `Studio` owns `campaignId` in its own local state and
only ever mirrored `workspaceSlug` into the store, so all four panels read
`currentCampaignId === null`, failed their internal `validCampaign` check, and
would have rendered with a permanently disabled Generate button. `Studio` now
mirrors `campaignId` into the store via a dedicated effect — keep that effect
if you touch campaign state. `setCampaignId`'s type was also widened to
`string | null` to match the nullable field it writes (it was `string`,
despite `resetCampaign()` already setting null internally).

Nav items are disabled until `campaignId` exists, since every one of them
bills its job to a campaign — this mirrors each panel's own `validCampaign`
guard rather than letting a user open a screen that can't do anything. Pro
gating is left to the panels themselves: each already renders its own
`ProUpsell` and disables its action when `!isPro`.

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

## Upload from file OR from the gallery — `components/shared/GalleryPicker.tsx`

Every screen that asks for an image now offers both: the existing file input,
plus a **"Use from gallery"** trigger (`GalleryPickButton`) opening one shared
modal (`GalleryPicker`) over `GET /api/gallery` — or, with `kind="video"`, over
`GET /api/productions?kinds=video,composed_video` (that `kinds` param is new and
additive; absent, the route still returns exports only). When a `campaignId` is
passed the modal opens on a **"This project"** tab and offers "Everything"
alongside it. Everything in the gallery is an asset the workspace already paid
to generate, so reaching back for one is free.

Wired at: `ReferencePhotoField` (Brief/Images), `ProductShotPanel`,
`VirtualTryOnPanel` (both slots), `TalkingVideoPanel` (presenter),
`CompositorCanvas` (second image), `AutoCaptionPanel` (source video),
`LogoUpload` (vectorize), and the Brand Kit settings page (both logo variants).

**Deliberately not offered** on the Compositor's inpaint mask (a purpose-made
black/white matte — a gallery image is never the right answer) or on audio
uploads (the gallery holds images and video).

Two behaviours worth knowing:

- `TalkingVideoPanel`'s presenter "generate" tab read `useAppStore`'s
  `generatedAssets`, which **nothing has populated since Studio replaced the
  classic dashboard** (only the classic `Compositor`'s `loadCampaign` ever set
  it) — so that grid was permanently empty. It now goes through the picker.
- **Routes take an `assetId`, never a URL.** `POST /api/logo/vectorize` and
  `POST /api/brand-kit/logo` gained a JSON branch alongside their multipart one;
  both resolve the id through `resolveOwnedAsset` (`lib/assets/owned.ts`), which
  looks the URL up under the session's `workspace_id`. Accepting a client-supplied
  URL would hand an arbitrary address to a fal job and cross the tenant boundary.

## Project progress — nav ticks + the project strip

`GET /api/campaigns/[id]/progress` derives, from the campaign's own
jobs/assets/compositions/publish records, both a `done` map keyed by `SectionId`
and a `bundle` of the actual assets. One fetch, two views:

- **`StudioNav`'s tick dots.** `tools` used to hardcode `done: false` for the
  four Pro tools, Compositor, Caption, Music and Publish — Studio's local state
  only knew about the section it was driving, and reopening a project lost the
  rest. Local state is still OR'd in (`!!videoUrl || progress?.done.video`) so a
  tick never blinks off while the fetch is in flight.
- **`ProjectStrip`** (`components/studio/ProjectStrip.tsx`, 2026-08-11) — a
  thumbnail rail of everything the project has produced, **pinned below
  `<main>` and rendered for every section**. Was `ProjectBundle`: same payload,
  same thumbnails, but mounted only inside the Compositor and Publish branches
  and `defaultOpen: false`, so on the ten other sections the project you were
  making was invisible. That's the identical "architecturally absent on most
  screens" shape `StudioNav` was hoisted out of above, and the fix is the same
  one — render it once, outside the per-section conditional. The two old
  in-branch mounts are gone; `CompositorCanvas`/`PublishCanvas` are now plain
  direct children of the canvas column like every other section, which is why
  that column gained `min-h-0`.

  It sits **outside `<main>`'s scroll container** deliberately — inside it, the
  strip would scroll away on a long canvas, which is the problem it exists to
  solve. Hidden on `projects` (the Gallery lists OTHER projects; a strip
  describing the open one misreads there) and self-hiding when the campaign has
  produced nothing yet, so the Brief screen doesn't carry an empty bar.

  `SECTION_FOCUS` (in `Studio.tsx`) maps each `SectionId` to the strip group
  that section actually operates on, tinting it. `compositor`/`publish` map to
  `null` on purpose: both consume the whole bundle, so singling one group out
  would be a lie about what those screens use.

Refetched on `campaignId` change, when a Studio generation settles, and on
**every section change** — the four Pro panels and `CaptionCanvas` are
self-contained and never report back to Studio, so navigating away from one is
the only moment to re-read what it produced.

## Stalled phases — every poll needs a bound AND a reason (2026-08-11)

Reported as "Logo & Brand stuck on `Generating… 0 of 6 ready`". The rule that
came out of it: **a polling loop must have a bound, and running out of it must
say something.** A silent exit reads to the user as a frozen app.

Root cause was two separate gaps:

- `LogoStudio`'s poll had **no bound at all** — 2.5s forever, and its only exit
  was the project reaching `finalized`, which the concepts phase never does.
- `GET /api/logo/[id]` claimed in its own header comment to return "the
  project, **its jobs' status**, and its logo assets" but selected only
  `logo_projects` + `assets`. With no job status on the wire the client could
  not tell "still rendering" from "failed an hour ago". It now returns `jobs`
  (status, `errorMessage`, `expectedImages`) keyed off
  `input_params->>logoProjectId`, the tag every logo route already writes.

**The three stall states are NOT interchangeable, because refunds differ** —
see `LogoStallNotice.tsx`, which exists to keep them apart:

| State    | Server reality                                                                  | What the user is told          |
| -------- | ------------------------------------------------------------------------------- | ------------------------------ |
| `failed` | webhook hit `finalizeMultiImage`'s zero-image branch → `refundCredits` ran      | credits are back, start over   |
| `slow`   | still `processing`, under the give-up threshold                                 | nothing's wrong, keep waiting  |
| `stuck`  | still `processing` past it — **webhook never arrived, so nothing ever refunds** | credits were spent, contact us |

Do not collapse `stuck` into `failed`. Nothing server-side marks a
never-webhooked job failed, so promising a refund there would be a lie.

Thresholds are counted in **poll ticks, not wall-clock**, so a backgrounded tab
(where browsers throttle intervals) under-counts and false-alarms rather than
the reverse.

`expected` was also seeded only from the POST response, so a _reopened_ project
sat at the default 6 even when fewer were ever submitted (partial submit
failure is tolerated at creation — see `app/api/logo/route.ts`) and could never
reach a complete grid. It now prefers the job's own `expectedImages`.

Same pass fixed the other unbounded/silent loops: `AutoRunPanel` (polled
forever while a run sat in `running`; now stalls on a _stage_ that stops
advancing, offering "Keep watching" / "Take over from here" rather than
claiming failure), and Studio's video + music loops, which were bounded but
fell out of their `for` in silence — the spinner just stopped. Both now report,
checking a `landed` flag rather than the loop index so a run of failed status
fetches (which `continue`) still gets a message. Studio's image `poll()` and
`removeBg` already did this correctly and are the pattern to copy.

`done.logo` is **workspace-level, not per-campaign**: logo projects hang off the
shared "Logos" holding campaign (`app/api/logo/route.ts`), so it means "this
workspace has a finished mark". That's the honest reading of the data.
