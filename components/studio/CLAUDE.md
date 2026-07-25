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
  and the Gallery (below).
- Tier gating is by capability, not layout: `ent.proEffects` drives the locked
  "AI-Photoshop" effects.

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
