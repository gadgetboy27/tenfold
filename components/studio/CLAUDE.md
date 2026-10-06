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
it up front lets the model compose _around_ the gap, so the result looks
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
made that much better; it did not make it _guaranteed_. This does.

- **Claude proposes how type should LOOK, never what it says.**
  `wordTreatmentSchema` has zone, font, colour, width and scrim — and **no
  field for letters**. A model that tries to send wording has it stripped by
  Zod. Don't add a `text` field "for convenience": that is the day the
  guarantee dies, and a test pins it.
- **Zones are the nine existing anchors** — but since 2026-09-16 the Words
  block is a **fraction** layer: the zone is resolved once to a starting
  point (`buildWordsLayer`) and the block floats from there. It was anchor
  mode, which is right for a corner logo that must hold across formats and
  wrong for a block placed by hand — dragging an anchored layer only moves
  along its anchored edges, so a "bottom" headline could go up and down and
  nowhere else. The canvas also converts any anchored TEXT to fraction on
  the first drag, which frees blocks saved before the change. `zone` and
  `widthFrac` stay in the schema because Claude's treatments (ad-watch) and
  the Create step's "keep this area clear" still use them.
- **Live, not "place".** `syncAdWords` (adBridge) writes each keystroke and
  each font/colour/panel change straight to the layer, keeping the `pos` and
  `scale` the user set on the stage — `addWordsToAd` rebuilds the whole layer
  and would snap it back to its zone, so it is for first placement only. Size
  is re-derived from the text on every edit so a headline that grows while
  being typed stays inside the frame. The colour input listens on `onInput`,
  because `onChange` on a colour picker fires only when the dialog closes.
- **"Suggest treatments" is gone from the panel.** `POST /api/words/treatments`
  stays for ad-watch. In its place, `AddImageCard` puts a picture on the ad
  from the same tool — upload, gallery, or a small generated one via the
  ordinary `image_generation` job (`lib/studio/generate-image.ts`), priced from
  `CREDIT_COSTS`.
- **One toolbox for every kind of lettering** (`StyleToolbox`, 2026-10-02 — replaced `TextStylePicker` and the sticker card's own pickers). `CaptionCanvas`
  is gone; "Write a caption for me" lives in the Words card, runs the same
  `script_generation` job, and drops the result on the ad as the
  `CAPTION_LAYER_ID` block (then selects it). The font/weight/colour/panel
  controls style whichever text is selected on the stage — `pickTextTarget`
  resolves selected → words → caption — via `restyleAdText`, which changes
  nothing about position or size. A per-kind duplicate of the pickers is the
  thing this exists to avoid; don't add one.
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

Still open: font _weight_ isn't in the schema (each weight is another font file
to ship), and a user-supplied family needs upload + registration in
`FONT_FILES`, plus a licensing confirmation — many commercial fonts forbid
server-side embedding. Until then, don't offer a free-text font box: it would
preview correctly and export wrong.

## The three-pane shell (2026-08-24) — read this before touching the layout

`<main>` is **tools left │ the ad centre │ generation right**. Picking a tool
no longer replaces the screen; it changes only what the right rail is doing.

| Pane   | What                   | Component                                    |
| ------ | ---------------------- | -------------------------------------------- |
| Left   | section nav, `w-200px` | `StudioNav` (inside `Studio.tsx`)            |
| Centre | **the ad being built** | `AdStage.tsx` — mounted once, never unmounts |
| Right  | the selected tool      | the per-`SectionId` switch, in an `<aside>`  |

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
  placed, `AdStage` draws a _placeholder_ at the store's new `pendingAspect`,
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

| mode              | who                                              | the Ad stage     |
| ----------------- | ------------------------------------------------ | ---------------- |
| `narrow` (~400px) | generate-one-thing panels                        | keeps the centre |
| `wide` (~620px)   | Gallery, Publish — browsers and multi-step flows | keeps the centre |
| `full`            | Compositor, Logo — editors with their own canvas | **stands down**  |

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
collapsed. Note `lg:` is a _viewport_ breakpoint, not a container one, so it
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

## Caption — reusing an existing backend entirely (2026-07-26)

_2026-09-15: `CaptionCanvas` was folded into `WordsCanvas` as one "Write a
caption for me" button (platform `instagram`, tone `professional`, 60 words —
no pickers), see the Words section. The backend notes below still hold._

`CaptionCanvas.tsx` was a topic textarea (prefilled from
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

### The Gallery lists most recently WORKED ON, not most recently created

`GET /api/campaigns` orders by `updated_at`, and `PATCH /api/campaigns/[id]`
stamps `updated_at` on every write — there is no DB trigger doing it, so before
this the column held the row's creation time forever and the sort was
indistinguishable from `created_at`. `openProject` fires a bare
`PATCH { touch: true }` (fire-and-forget; an ordering nicety must never stop a
project opening), which is why opening a project floats it to the top. The
`update` object is seeded with `updated_at`, so `{ touch: true }` is a real
write rather than an empty one that reports success.

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

## The strip is where you throw work away and name the keeper (2026-08-31)

The strip listed every clip and every music take and offered nothing to do
about it. "Stellar Launch" (campaign 62cc89cd) rendered as 10 video tiles and
14 stacked `<audio>` players, and publishing quietly took whichever was
newest. Each tile now carries a bin, and each video also carries a tick that
sets `campaigns.publish_asset_id` — the one video that publishes. See
`app/api/CLAUDE.md` for the server rule; `lib/campaign/video-pick.ts` holds it
in one place for both sides.

- **The pick beats "newest" everywhere it's read.** `openProject`'s rehydrate
  and `refreshProgress` both go through `displayVideo`, so the clip on the
  canvas is the clip that posts. Without that the strip highlights one video
  while the stage plays another.
- **`refreshProgress(afterDelete)` — only a known delete may blank the
  canvas.** It fires the instant a generation flips done, and the asset row
  can trail the client by a beat; clearing on "the server doesn't list it yet"
  would wipe a clip that had only just finished rendering. `onChanged` passes
  `true`; every other caller doesn't.
- **The controls are visible at rest, not hover-revealed.** They started
  hidden, on the usual reasoning that a row of tiles should read as the work
  rather than as a toolbar. Wrong trade here: the row exists _because_ ten
  near-identical clips piled up with no way to remove one, and a control you
  have to discover by hovering solves that for nobody.
- **"Tidy N" — one confirm, keep one, bin the rest.** `removeAllBut` serves
  both groups. On video it appears only once a keeper is named: "delete the
  others" has no meaning without a chosen one, and offering it beforehand asks
  the user to trust a heuristic pick. On music it needs no such gate — the
  newest track isn't a guess, it's the one publish's late-music remux actually
  mixes, and the strip labels it **"In the mix"** so that's legible rather than
  inferred from playback order. It deletes sequentially, not `Promise.all` —
  the server refuses published assets and the anchor, and fourteen parallel
  deletes turn one refusal into a race for which toast is seen.
- **Server refusals are shown verbatim.** Both 409s ("that's the anchor",
  "that's already published") name the actual reason and the fix; replacing
  them with a generic failure throws away the only useful part.
- **Productions' "Publish" sets the pick first.** That page lists every export
  a campaign has, so the button means _this_ card — but Studio and
  `/api/publish` resolve the campaign's video, not the card's. Best-effort: a
  failed PATCH still opens the screen, where the strip can set it by hand.

## The tick puts the clip on the stage (2026-09-04)

Reported as "you click the tick and nothing happens". It wasn't broken — it
wrote `campaigns.publish_asset_id` and nothing else. On screen that moved a
96px muted tile inside `PublishCanvas`'s "What's going out", and when the pick
already matched what `displayVideo` was showing, it moved nothing at all. **A
control whose only effect is a column write reads as dead**, and the fix is to
make the tick mean on screen what it already meant in the database.

- **`onStageVideo` — the tick sets the composition's background.**
  `ProjectStrip` hands the clip up; `Studio.stageVideo` calls `addVideoToAd`.
  That is what puts the clip where the aspect picker, the Brand stamp and the
  Words layer can all reach it, instead of in a thumbnail. Un-picking does NOT
  strip the stage: removing someone's backdrop takes every layer positioned
  against it with it, which is a far bigger act than un-naming a file.
- **Only a RAW clip reaches the stage — never a `composed_video`.** Found by
  testing this on "Bright Pulse": ticking a branded export made it the backdrop
  while the doc still held the layers it was rendered WITH, so the caption drew
  over its own burnt-in pixels and the stage showed doubled, ghosted text — and
  "Render this cut" from there would have baked that in permanently. An export
  is the OUTPUT of the stage, not an input to it; the same input-vs-output
  distinction `late-music.ts` draws when it re-muxes onto the export rather than
  rebuilding from the raw clip. Ticking an export still names it the pick (that
  is what the tick is for) and the stage keeps the editable ad.
- **`AdStage` has a transport now.** It rendered `playing={false}` with no way
  to change it, so a video ad was one frozen frame — you could shape, brand and
  letter something you had never watched. The canvas always supported playback
  (it drives the Compositor's scrubber); only the controls were missing. Video
  backdrops only — scrubbing a still is a control that does nothing.
- **The clip change is adjusted during render, not in an effect.** It arrives
  from zustand, outside React's tree; an effect paints one frame of the new
  clip against the old clock, and `react-hooks/set-state-in-effect` rejects it
  anyway. No `seek(0)` goes with it — the `<video>` element's src swaps and the
  browser reloads at 0.

### "Render this cut" — without it the whole screen is theatre

The stage invites you to re-shape the clip, stamp the brand kit and lay type
over it. **None of that reaches a network on its own**: `/api/publish` posts
`campaigns.publish_asset_id`, which is the raw file the strip named, while the
adjustments sit in `compositions`. `PublishCanvas`'s Final adjustments block is
the one step that turns the doc into a file — `POST /api/compositions/export`
(free, the same FFmpeg render the Compositor uses), then a PATCH moving the
pick onto the new asset.

- **`audioUrl` is not optional.** The export bakes audio in at render time, and
  publish's late-music remux only fires when the track is NEWER than the export
  (`lib/composition/late-music.ts`). A cut rendered now is newer than every
  existing track, so omitting the music posts permanent silence with nothing
  saying why. Studio passes `musicUrl` through for exactly this.
- **One aspect, not a fan-out.** A pick makes `/api/publish` skip the
  per-aspect fan-out entirely (its one-video checkpoint), so rendering three
  aspects and then naming one is wasted work. The shape buttons are labelled
  with the platforms that want them (`formatsForPlatforms`, the same registry
  the server's `pickForPlatform` reads), and two platforms disagreeing is
  stated as the real trade it is — letterboxed, or two passes — not papered
  over.

## The element tray — prepare it, then drop it where you want (2026-09-07)

`ElementTray` in the Compositor's control column, above `LayerList`, so the
panel reads top-to-bottom as make-it → drop-it → it's in the list.

Every existing route onto the canvas decides placement FOR you: brand-apply
pins the mark to a corner, the Words step puts lettering in the reserved zone.
Both are good defaults and neither is a way to say "no, THERE". Marks and
lettering are also the two things people want to fiddle with _before_
committing — the wording, the face, whether it needs a scrim — and doing that
on the live canvas makes every experiment an edit to the ad.

- **Drag payload is a private MIME type** (`TRAY_MIME`), not `text/plain`.
  `text/plain` would make every dragged word, file and URL from another window
  a candidate layer. `parseTrayItem` never throws — a foreign payload is simply
  "not ours", and `onDragOver` only calls `preventDefault()` for our type, so
  the canvas isn't a drop target for anything else.
- **The drop fraction is measured against the MEDIA rect, not the container.**
  The canvas is letterboxed inside its container (`containRect`), so measuring
  against the container puts every drop off by the width of the bars — drop on
  the left edge of a 9:16 ad in a wide container and it lands a fifth of the way
  in. `dropToFraction` (`lib/composition/tray.ts`) is pure and tested for
  exactly this; "the logo landed somewhere else" is a bug you argue with rather
  than notice.
- **Clamped to a 2% inset, not 0..1.** A layer centred exactly on the edge is
  half outside the frame, which reads as "it vanished" and can't be grabbed
  again to fix.
- **Fonts are `BRAND_FONTS`, enforced on PARSE.** Same rule as Words and the
  logo lockup, for the same reason: the browser renders any family, the FFmpeg
  export resolves through `FONT_FILES` and silently falls back to Inter, so an
  unknown font gives a correct preview and a wrong video. `parseTrayItem`
  coerces rather than trusts, because the payload is a string that has been out
  of our hands.
- **"Another text block" gets a fresh uuid per drop — deliberately NOT
  `WORDS_LAYER_ID`.** The Words tool owns one replaceable layer because
  wording is edited iteratively; the tray exists to place SEVERAL independent
  bits of type, so stacking is the feature rather than the bug it is there.
  Since 2026-09-15 the section carries **no font / size / colour / weight
  controls** — they were a second copy of the Wording picker. A new block
  lands styled like the text already on the ad (`trayTextItem` /
  `addTextBlockToAd` in adBridge, via `currentTextStyle`) and is selected on
  creation, so the Wording picker styles it next. The same removal happened
  to the Create step's "Save a space for your headline": it keeps the words
  and the keep-clear zone (the part that reaches the image model) and nothing
  about how they look.

### One word, five things — the names are deliberate (2026-09-15)

A review found nine places touching "caption"/text. They are not duplicates,
and each is now named for what it does so the app doesn't read as repeating
itself. Keep these distinct:

| Where | Label | What it is |
| --- | --- | --- |
| Create step | **Save a space for your headline** | Words + keep-clear zone → shapes the *image* |
| Wording | **Words on the ad** / **Write a caption for me** | The on-ad text layer; Claude's caption dropped on as a layer |
| Wording | Style row | The one picker for every text on the ad |
| Compose tray | **Caption · from Wording** | That same caption as a drag chip |
| Compose tray | **Another text block** | A separate, additional text layer |
| Wording | **Sticker** | Rasterised text as an image layer — tilt, flip, glow, neon (§ below) |
| Compose | **Caption motion** | Fade / lower-third / crawl on video |
| Publish | **Post text** | The words that go out *with* the post — not on the image |
| Subtitles | Subtitles | Speech-to-text burnt in |
- Marks are read from the two places a workspace's marks actually live: the
  brand kit (`logo_url` / `logo_dark_url`) and finished Logo Studio projects.
  Both fetches fail quietly — an empty tray is a tray, but an error banner over
  a side panel is noise on a screen doing another job.

## Sticker — text that is really an image (2026-09-16)

A "SALE" burst, a price, a stamp: the other kind of type. It needs tilt,
flip, mirror, afterglow and neon, and the export draws text with FFmpeg's
`drawtext`, which can do none of those. So a sticker is **not a text layer**.
`lib/composition/sticker.ts` rasterises it in the browser — canvas 2D, the
loaded display faces, glow via `shadowBlur`, neon via a stroked halo, flips
via a negative scale — into a transparent PNG, and it lives on the ad as an
**image layer with a `sticker` spec** (`imageLayerSchema.sticker`). Every
image thing then applies unchanged: drag, pull, rotate, per-format nudge,
and the export's overlay-with-rotation. Preview and MP4 share the exact
pixels, which is the parity rule this codebase keeps.

- **`src` is a `data:` URL.** `export.ts`'s `download` decodes those
  (`dataUrlBytes`) instead of fetching. The canvas image cache prunes stale
  `data:` keys so an editing session doesn't keep every intermediate PNG.
- **Editable because the spec rides along.** `restyleSticker` re-rasterises
  in place and keeps pos / scale / tilt. `StickerCard` edits the selected
  sticker live (150ms debounce on typing — a PNG per keystroke otherwise)
  and otherwise adds a new one. `pickStickerTarget` is the selector.
- **Not the Words block, not the shared style row — on purpose.** A headline
  is the brand's voice in the brand's face; a sticker is a thing stuck on
  top. `STICKER_FONTS` puts the single-cut display faces first.
- Tilt is the layer's ordinary `rotationDeg` (via `patchLayout`), so it is
  per-format-overridable like any rotation and already exported.

## Sticker effects — crumble, slice, dust, electric, glitch, shine (2026-10-07)

"Make it move" (`StickerFxCard`): an animation on a sticker's LETTERS, timed as
a **percentage of the clip**, not seconds — nobody knows whether the ad will run
10, 15 or 30s. Different from the layer effects suite (`effects.ts`), which only
moves/scales/fades a layer whole; these change pixels. Free, no credits.

The engine is `lib/composition/fx/` and is **general on purpose**: nothing in it
knows what a sticker is. It takes the size of a still picture and a progress.
Today only `stickerSpecSchema.fx` attaches one; another section would add a field
and a call site, not touch the effects.

- **An effect is a pure function from progress to a SCENE** (`effects.ts`): pieces
  (a rectangle of the source, moved/turned/scaled/faded, optionally clipped or
  colourised), a wash, a glint, and stroked lines. It draws nothing. The canvas
  preview (`canvas.ts`) and the server (`frames.ts`, Sharp) each carry the same
  scene out — that is the preview/export parity guarantee, and it is why the
  effects are tested without a canvas. Halos are stacked strokes, not blurs, for
  the same reason: no shared blur filter to drift.
- **Two families** (`catalog.ts`): *transitions* (crumble/slice/dust) go whole→gone
  ("breaks apart") or gone→whole ("builds up" — the same motion played backwards,
  `q = 1 - p`, not a second animation); *pulses* (electric/glitch/shine) leave the
  picture whole either side and can repeat. Add an effect = a builder + a catalog
  entry + a margin; the invariant tests (starts whole, ends right, stays inside its
  margin, deterministic) then cover it.
- **Timing** (`timing.ts`): `startPct` resolves against the real clip length — in
  the preview from the stage's clip, at export from the probed video. The effect
  always plays in full (100% starts it as late as it can still finish). The
  sticker is drawn plain only when the effect ISN'T on (`staticVisible`).
- **Export** (`export-plan.ts`): a sticker with an effect becomes TWO ordinary
  image layers — the still, shown only outside the effect (`showIntervals`,
  half-open so a boundary frame is drawn once), and the rendered frames as an
  image-sequence input shown only during it, carrying the same
  position/scale/rotation/opacity/blend/effects. Nothing new in the filter graph
  beyond `setpts` + the interval `enable`. The frame is the picture plus the
  effect's margin on every side so the picture stays centred; an edge-anchored
  sticker's effect is pinned to the still's own centre. Frames are cached per
  sticker+effect (a fan-out renders them once, not once per aspect).
- **The effect belongs to the layer, not the look.** `restyleSticker` always
  keeps the layer's own `fx` (a stale debounced spec can't wipe it), and
  `addStickerToAd` / the toolbox draft strip it (one sticker's effect must not
  become the next one's). Only `setStickerFx` sets it.
- **Arrange mode, Combine and still posts show the plain sticker** — `pixelFx` is
  cleared when paused, and `still.ts`/`combine.ts` pass no motion state.
- **Cost:** frames are PNGs rendered per export. Roughly 5s crumble, 10s dust, 2s
  slice/electric, <1s glitch/shine (4-core laptop). Budget: ≤120 frames per
  sticker (fps drops for long repeated pulses).
- Layer entrance/exit/loop effects still apply to a sticker with a pixel effect.

## Nothing is `absolute` inside an unpositioned box (2026-09-15)

The Compose pane's shape chips and enlarge button spent a week in the page's
top corners, under the navbar. They were `absolute` overlays inside the canvas
container, and that container is positioned only in fullscreen (`fixed`) — in
normal use it had no `relative`, so the overlays resolved against the page
shell. Fullscreen looked right in testing; normal mode didn't. They now sit in
a bar under the canvas (`ASPECT_CHIPS`, shared with `AdStage`, so the picker
reads the same on every screen), and the container is `relative` so the two
overlays that legitimately remain — the op hint, the fullscreen Close — cannot
escape. If you add an overlay to any pane, put `relative` on the box you mean
it to sit in, in the SAME class string, and check it in the non-fullscreen
state.

## The Compositor comes last (2026-09-07)

`STUDIO_FLOW` moved it from fourth of seven to immediately before Publish:

    images → words → video → caption → music → compositor → publish

It is the room where the pieces become the thing that ships, so every piece
should exist by the time you walk into it. Mid-list, it asked people to
assemble an ad whose parts they hadn't made yet and then carry on making parts
afterwards.

This also removed a dependency rather than adding one. FFmpeg muxes audio at
render time, so an export made before the music exists is permanently silent.
With music now ahead of the Compositor the export bakes the track in directly,
and `lib/composition/late-music.ts` is back to being the safety net it was
meant to be — for adding music AFTER exporting — instead of the path every
soundtracked ad quietly depended on. The rail sorts by `NAV_ORDER`, which is
`STUDIO_FLOW`, so the menu moved with it.

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

## Text boxes reflow from every handle (2026-09-29)

Dragging a text layer's box re-wraps the words from ANY edge or corner, not
just the sides. `l`/`r` still set the wrap width at the current size. Corners
call `fitTextToBox` (`lib/composition/text-fit.ts`), which tries every wrap
width and keeps the one that lets the type be largest while still inside the
box the pointer describes. `t`/`b` call `fitTextToHeight` instead: the type
size never changes, the wrap narrows to add lines as the box is pulled taller
(and merges them as it shrinks). Pull a corner back onto itself and the text
folds onto more lines and shrinks to stay inside. `wrapChars` is recorded so retyping keeps the shape.

**Stickers have an independent box.** A sticker is rasterised text on an
image layer, so uniform `scale` can't change one dimension. Its spec carries
optional `boxW`/`boxH` (raster px); `rasterizeSticker` wraps the words to
`boxW` and centres them in a `boxH`-tall canvas, never smaller than the
wrapped text needs. Pulling `l`/`r`/`t`/`b` re-rasterises with only that
dimension changed, keeps the OPPOSITE edge fixed (the centre moves, so the
layer is converted to a fraction position), and leaves the type size alone.
Corners still scale the whole sticker. `addStickerToAd` strips the box so a
new sticker never inherits the one the card was editing.

## Read it out — text that fills its box over time (2026-09-29)

`RevealCard` (in the Wording rail) sets `TextLayer.reveal`: `typewriter` /
`words` / `karaoke`, a start pause (`delaySec`), the read time
(`durationSec`), an end pause (`holdSec`) and an end effect (flash / bump /
pulse / shake). All timing rules live in `lib/composition/reveal.ts`, which the
canvas preview and the FFmpeg export both read — don't fork them.

- **Preview**: `motionAt` returns `reveal` progress; `drawLayer` draws each
  line's lit prefix from the line's own left edge, so words fill the box in
  place. The scrim stays full-size. Arrange mode (paused) shows the FINISHED
  text on purpose — you can't place text that isn't drawn yet.
- **End effects are motion only** (dx/dy/alpha) because those are the two
  channels drawtext animates. A "bump" is therefore a hop, not a scale.
  They ride the existing `motionAt` / `motionExprs` path.
- **Export**: drawtext can't light part of a line, so `revealDrawPlan` emits
  one drawtext per (line, state) at a computed x. That needs each line's
  width, which only a browser font measurement gives — `materializeDoc`
  stamps `reveal.lineWidths` before every export. A doc without them (e.g.
  the ad-watch apply route) exports the finished text with no read-out; the
  end effect still plays. The scrim is the full text drawn at `@0` so its box
  follows fades and motion. The generated FFmpeg graph is unit-tested as
  strings only — it has not been run through a real ffmpeg in CI.
- **Playback controls**: the stage's Play/scrub bar used to show for video
  backdrops only, so on a still-image ad a read-out never ran — it looked
  like plain static text. `AdStage` now also shows it when any text layer has
  a `reveal` (`hasReadOut`), and fullscreen preview starts playing from 0 for
  such ads. `RevealCard` warns when the reading outlasts the ad's length.

## Slogan + one Style toolbox (2026-10-02)

**Slogan** (`SloganCard`, inside the Words card): the user describes what they
are promoting and `POST /api/jobs` (`script_generation`, `params.kind:
"slogan"`) returns three one-sentence lines — same one-credit charge, refund
and rate limit as a caption, different product. `lib/claude/slogan.ts` asks
for a JSON array and `normalizeSlogans` enforces the shape: at most 12 words,
one sentence (short fragments like "Fresh. Fast. Yours." are allowed), no
numbering/quotes, no repeats; overlong lines are DROPPED, never trimmed
mid-thought. The first option goes straight into the Words box; the others swap
in on tap. A slogan is NOT a caption: don't merge the two prompts.

**One Style toolbox** (`StyleToolbox`, shared rows in `StyleRows`) styles
whatever is selected on the stage — a headline, the caption or a sticker — and
only that. Selected sticker → sticker controls (face, effect, colours, palettes,
brush size, flips, tilt); selected text → text controls (face, weight, colour,
panel); nothing selected → the user picks Words / Sticker and it sets the look of
the NEXT one. `StickerCard` now owns only what a sticker SAYS and the Add button;
its look lives in the toolbox. Styling is per selected layer — styling words
*inside* a block differently (mixed styles in one box) is not built; it would
need spans in the text layer, in the canvas draw, in the FFmpeg export and in the
read-out, so it is a separate piece of work.

## Lettering stays inside the frame (2026-10-02)

Switching shape used to push text off the screen (a headline laid out for 1920
wide is wider than a 1080 frame). Now:

- **Automatic**: `setAdAspect` (the only shape-change path — Compose's shape picker
  uses it too) calls `fitTextToFrame()` after the change and toasts what it did.
- **Real measuring**: `measureLettering` uses the canvas's own `layerBounds` /
  `layerCenter` (fonts, scale, position, panel padding) for text AND stickers,
  never the old character-count estimate (`textOverflows`, now only used by the
  Words sizing code). Stickers are measured from their pixels, so their glow/neon
  padding counts toward the edge.
- **Safe area** = a margin of 5% of the SHORTER side, so it's the same pixels in
  every shape (`lib/composition/fit.ts`). Pure maths, tested.
- **Per-shape, never destructive**: the result is written as THIS shape's override
  (`setFormatOverrides`, one undo step), not the shared layer — 9:16 gets smaller
  type, 16:9 is untouched, and switching back restores it. Wording and line breaks
  are never changed; a box only ever shrinks or slides, never grows.
- **Warning that is also the fix**: the stage shows "N outside the safe area — fit"
  whenever lettering is outside the margin (e.g. dragged to the edge), debounced
  because dragging changes the doc every frame. Locked ads can't be fitted.
- Boxes that must shrink below ~45% are flagged ("shorter wording would read
  better") — shrinking can make a long line unreadably small.

## Look & motion — backdrop treatment (2026-10-02)

`BackdropFxCard` (Compose rail) sets `doc.background.treatment`: a colour **look**
(warm / teal / noir / vivid / film), **grain**, **vignette**, a **camera move**
(zoom in/out, drift, punch-in) and a **pulse** on a BPM the user sets. Stored
inside `background` (jsonb) so it persists with no migration, and it is in the
render fingerprint, so changing it makes a locked render read as out of date.

- **Backdrop only.** Layers draw on top untouched, in the preview
  (`drawBackdrop` in render.ts) and the export (`backdropFilterChain` spliced
  into the first chain of `buildFilterGraph`, after the cover-fit, in gbrp).
- **One set of maths** in `lib/composition/treatment.ts`: the preview calls
  `backdropMotion`, the export builds the same motion as ffmpeg expressions
  (`zoomExpr`/`panExpr`, `scale…eval=frame` then `crop`). Motion is exact;
  colour looks are APPROXIMATE across the two (CSS filters ≠ ffmpeg eq/colorbalance).
- **Camera on a still = a moving ad for free.** The stage shows its Play controls
  whenever a camera/pulse or read-out exists, and a flattened PHOTO keeps look,
  grain and vignette but drops camera and pulse (no timeline).
- **The pulse is not beat detection.** It fires on a fixed tempo; detecting beats
  in the actual music is a separate, bigger piece of work.
- A treatment counts as content for the Render & lock card: a look with no
  layers is not "nothing to lock".
- The filter strings were run through a real ffmpeg (gbrp) when added; there is no
  ffmpeg in CI, so `tests/unit/treatment.test.ts` pins the graph shape as strings.
