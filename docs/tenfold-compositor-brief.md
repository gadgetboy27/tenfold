# Tenfold — Brand-Aware Video Compositor: Build Brief + Agent Prompts

A complete description of what we want, why, and how to get there. Written for a code-editor
agent (Claude Code) working in the Tenfold repo. **Start with the audit (Prompt 0)** — Tenfold
already has some form of logo-insert feature, and this may be an extension of it rather than a
new build. Let the audit decide.

> **Audit outcome (2026-07-09, Prompt 0):** EXTEND. The repo already has: `compositions`
> table with jsonb overlay columns, a production server-side FFmpeg MP4 renderer
> (`lib/composition/video.ts`, ffmpeg in the Railway Dockerfile), a real Brand Kit
> (`brand_kits` table + `/api/brand-kit` + logo upload to storage), and the 6-step campaign
> flow with a publish handoff. The Step 4 logo upload was preview-only (blob URL, saved as a
> boolean) — it never reached the export. Deviations agreed: (1) no WebM/MediaRecorder —
> server FFmpeg MP4 is the only export path; the canvas is preview-only. (2) Blend modes are
> curated to the set canvas and FFmpeg render identically: normal, multiply, screen, overlay,
> lighten, darken.

---

## 1. What we want (the product goal)

**Problem:** AI video generators cannot render text or logos reliably — wordmarks come out
garbled ("OHQ", melted letters). So brands can't get a _finished_, on-brand social video from
AI generation alone. Users currently have to export raw footage and finish it in CapCut/Canva.

**Goal:** Tenfold closes that gap with an integrated **layered compositor**: AI generates the
_footage_; the user's **real brand assets** (logo PNG/SVG, fonts, colours, captions) are
composited **on top** as true layers — pixel-perfect, never regenerated — and the result exports
ready to publish, inside Tenfold.

**The differentiator is the pipeline, not "layers":**
`generate footage → auto-apply brand kit as layers → tweak → export/publish` in one flow.
Layers alone are table stakes (CapCut has layers). The win is _brand-aware finishing built into
the generation-and-publish loop_.

**Design bar:** overlays must be able to look _blended and believable_, not stickers. That means
blend modes (screen/dodge for glowing a light logo into dark footage), opacity, soft fade
timing, and sensible default placement — NOT AI re-painting the logo. The logo file is sacred:
it is never re-rendered, upscaled, or restyled by a model.

## 2. What already exists (reference implementation)

A working single-file MVP proves the whole mechanic in-browser:
**`tenfold-compositor-mvp.html`** (not in the repo — add to `docs/` when available). It demonstrates:

- Canvas render loop compositing: background video/image → image layers → text layers
- Per-layer: position (drag on canvas), scale, rotation, opacity, **blend mode**
  (`globalCompositeOperation`), and timing (`appearAt`, `disappearAt`, `fade` in/out)
- Master clock synced to the background video's `currentTime` (or a virtual clock for images)
- Aspect presets 9:16 / 1:1 / 16:9
- Export: `canvas.captureStream(30)` + `MediaRecorder` → WebM; single-frame PNG
  Port its logic; don't treat it as final UI.

## 3. Architecture requirements (for the real build)

- **Client-side compositing** in a React component (Next.js App Router, TypeScript) — the
  render loop is a `<canvas>` drawing `requestAnimationFrame` frames. No server round-trip for
  preview.
- **Layer model (serialisable):** see `lib/composition/layers.ts` (source of truth). Layers use
  design-space pixel coordinates fixed per aspect (9:16 = 1080×1920, 1:1 = 1080×1080,
  16:9 = 1920×1080) so the client preview and the server export are deterministic at any
  display size. `disappearAt: null` means "until end of clip" (JSON-safe).
  Compositions save to the DB (the existing `compositions` table, extended with `background`
  and `layers` jsonb columns), so edits are re-openable — not one-shot.
- **Brand Kit** (per workspace): the existing `brand_kits` table — logo (transparent
  PNG/SVG uploaded to storage), brand colours, font choice, tagline. Stored once, auto-offered
  in every composition ("Add your logo" pre-filled). This is what makes it _brand-aware_ rather
  than a generic editor.
- **Export:** server-side FFmpeg job (already in the runtime) rendering the composition
  headless to MP4 (H.264). No MediaRecorder/WebM path.
- **Fonts:** load brand fonts via `document.fonts.ready` before first paint to avoid FOUT.
- **Safety rails:** logo assets are drawn with `drawImage` only — never passed through any
  generation/upscale model. Text layers render with canvas `fillText` from real fonts.

## 4. UX requirements (minimum)

- Timeline-lite: a scrubber + per-layer appear/disappear/fade — NOT a full NLE timeline.
- Drag to position on canvas; sliders for scale/rotation/opacity; dropdown for blend mode
  (curated list with plain-English labels, e.g. "Screen — glow on dark").
- Aspect presets; a final-frame "end card" helper (dark brand background + logo fade-in).
- One-click "Apply brand kit" that adds: logo (end frame, screen blend, fade-in) + caption text
  layer, from the saved kit.
- Templates come later; do not build a template system in v1.

---

## 5. Agent prompts — run IN ORDER, one at a time, review + commit between each

### Prompt 0 — AUDIT FIRST (no code changes) — ✅ DONE (see audit outcome above)

### Prompt 1 — Layer model + state (no UI yet)

Add the Composition/Layer types, a store (or hooks) for editing state, and DB persistence for
compositions (migration if needed, matching existing conventions). Extend the existing overlay
data shape rather than duplicating. No UI. Stop when types + persistence compile and save/load
round-trips.

### Prompt 2 — The canvas compositor component

Build the compositor React component: canvas render loop compositing background (video via
currentTime master clock, or image via virtual clock) then layers back-to-front, honouring
x/y/scale/rotation/opacity/blend and appearAt/disappearAt/fadeSec. Include drag-to-position,
property controls (sliders, blend dropdown with plain-English labels), scrubber + play/pause,
and aspect presets. Load fonts via document.fonts.ready before first paint. Stop when a
transparent PNG can be layered over a test video and scrubbed.

### Prompt 3 — Brand Kit

Extend the existing Brand Kit (logo variants light + dark, colours, font, tagline) and add
"Apply brand kit" in the compositor: inserts the logo as an end-frame layer (screen blend,
fade-in over the last 2s) and a caption text layer, pre-filled from the kit. Stop when applying
a kit produces a correct default composition that can be tweaked.

### Prompt 4 — Export

Server FFmpeg job renders the composition headless to MP4: background + image layers (overlay
filter + blend) + text layers (drawtext with brand fonts), honouring layer timing/fades. Name
files from the composition. Stop when a composited video downloads and plays with layers
correctly timed.

### Prompt 5 — Pipeline integration

Wire the compositor into the existing flow: after footage generation completes, offer "Finish
with your brand" which opens the compositor with that footage as background and the brand kit
pre-applied; on export, hand the file to the existing publish/schedule path. Small change; do
not restructure the generation flow. Stop when generate → composite → publish works end to end.

### House rules (unchanged)

- One prompt at a time; stop after each for review/commit.
- If a request conflicts with something existing, flag before changing.
- Never pass brand assets through a generation model. Never render text via AI.
- Match existing repo conventions (state, storage, styling) — don't introduce parallel patterns.

---

## 6. Explicit non-goals for v1

- No full NLE timeline, keyframes, or multi-track audio.
- No AI relighting/"physical insertion" of objects (research rabbit hole; blend modes get 90%).
- No template marketplace. Templates only after the compositor + brand kit are stable.
