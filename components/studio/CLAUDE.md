# components/studio — Studio, the main site

`components/studio/Studio.tsx`, rendered directly at `/[workspace]`, **is the
main site** — there is no separate classic homepage anymore. It's a single
Cockpit layout: a left panel for input/navigation, a persistent right panel for
the result. The frame stays put; only the canvas morphs per `SectionId` (brief
→ images → video → music → caption → compositor → logo → publish). It drives
the SAME endpoints the classic flow used — a surface over existing
functionality, not a new engine.

- **There is only one layout now.** The earlier Simple/Cockpit split was
  removed (`BriefCanvas`, `ImagesCanvas`, `VideoCanvas`, `PlaceholderCanvas`,
  the layout toggle, and the `tf-studio-layout` localStorage key are gone) —
  `CockpitCreate` is the sole renderer for brief/images/video, and its own
  internal placeholder handles every other not-yet-ported section. Don't
  reintroduce a second layout without a real reason.
- **Every nav item stays in Studio** via `setSection` — never link out. A
  not-yet-ported section falls back to a placeholder inside `CockpitCreate`;
  only Compositor and (flag-off) Logo expose a deliberate `classicHref` "Open
  in classic" button.
- **Pickers use `StudioSelect`** (`components/studio/StudioSelect.tsx`, built on
  the Radix `dropdown-menu`) — the one dropdown for every choice-range control.
  Don't reintroduce pill rows.
- **Wired inline today:** Brief, Images, Video (Length/Style dropdowns), Music
  (genre + engine dropdowns, track sized to video length), Logo & Brand
  (renders the full `LogoStudio` in the canvas when `FEATURE_LOGO_BUILDER=1`),
  Publish (below), and the Gallery (below).
- Tier gating is by capability, not layout: `ent.proEffects` drives the locked
  "AI-Photoshop" effects.

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
`LeftRail`, `RightPanel`) is unreached from any route now but still in the
repo — nothing has deleted it yet.
