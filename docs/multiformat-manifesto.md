# Multi-Format Compositor — Manifesto

> Design once, adapt everywhere. One master composition reflows to every social
> platform's aspect ratio automatically — the designer never re-positions a logo
> or re-shapes a caption per platform.
>
> This document is the source of truth for the multi-format build. Read it before
> touching compositor code. Do not drift from the decisions here without editing
> this file first.

---

## 1. The Goal (in the user's words)

> "I build on one and it fits TikTok, FB, LinkedIn and so on from the one in
> front of me, so I don't need to re-shape text boxes or re-position the logo in
> different places. Use maths (or vision agents) to auto-place items in the same
> relative position for me — cutting redesign time so I can design new projects."

The mini-previews of every platform format sit above the main canvas; when
approved they all render, lock to their platform, and publish together.

---

## 2. The Two Sub-Problems (only one is hard)

1. **Reshape the canvas — pure maths, deterministic, free, runs live.**
   Going 1:1 → 9:16 → 16:9 is geometry. If every layer stores its position
   _relative to the canvas_ (not in absolute pixels), re-flowing to a new aspect
   is multiplication. This is Phases 1–5.

2. **Make it look good after reshape — where vision earns its keep.**
   Maths gets ~90%. Text that fit on 2 lines may overflow a narrow vertical; an
   element may land under a platform's UI chrome. A vision agent _reviews and
   nudges_ the maths layout — it is polish, never the engine. This is Phase 6
   and is **optional / on-request** (costs credits).

---

## 3. Locked Decisions

| Decision                             | Choice                                          | Rationale                                                |
| ------------------------------------ | ----------------------------------------------- | -------------------------------------------------------- |
| Logo / pinned element position       | **anchor + margin**                             | Pin to a corner/edge; stays put in every format          |
| Everything else (text, floating art) | **normalized fraction (0–1)**                   | Scales proportionally with the canvas                    |
| Edit model                           | **master + per-format overrides (deltas only)** | Nudge one format without disturbing the others           |
| Format set                           | **driven by connected platforms**               | The rail shows only formats you'll actually publish      |
| Polish                               | **maths first, vision auto-fix on request**     | Free + deterministic by default; credits only when asked |
| Safe zones                           | **static rectangles per platform**              | Deterministic ⚠ flags, no AI needed                      |

Margins are a fraction of the canvas **min dimension**. All three current design
spaces share a 1080 minor axis (9:16→1080w, 1:1→1080, 16:9→1080h), so a margin
fraction is a _constant pixel inset_ across every aspect — predictable by design.

---

## 4. Coordinate Model (the keystone)

A layer no longer stores `x, y` absolute pixels. It stores a **`pos`**:

```ts
type LayerPosition =
  | { mode: "fraction"; nx: number; ny: number } // layer CENTRE as 0–1 of W,H
  | { mode: "anchor"; anchor: LayerAnchor; mx: number; my: number }; // margin = fraction of min(W,H)

type LayerAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";
```

Two pure functions bridge the model and the pixel world, and are the ONLY place
aspect ratio meets position:

- `resolveCenter(pos, aspect, halfW, halfH) → { x, y }` — pos → design-space
  centre pixels for a given aspect. Used by the canvas renderer, hit-testing, and
  the FFmpeg export (server builds the equivalent expression form).
- `centerToPos(prevPos, x, y, aspect, halfW, halfH) → LayerPosition` — inverse,
  **mode-preserving**. Dragging a fraction layer rewrites its fraction; dragging
  an anchor layer recomputes its margins from the anchored edges.

**Why this fixes the bug:** because `pos` is aspect-independent and resolved
fresh every frame, changing the aspect reflows all layers automatically.
`setAspect` becomes a one-line `doc.aspect` swap — no per-layer remap. That is
the entire Phase 1 win.

### Legacy migration

Old rows persist absolute `x, y` in their authored aspect. On parse we map
`pos = { mode: "fraction", nx: x/W, ny: y/H }` (using the doc's aspect), which
reproduces the exact same pixel centre in that aspect and reflows elsewhere.
Migration is idempotent (skips layers that already have `pos`).

---

## 5. Phase Plan

| Phase | Deliverable                                                                                                   | Status          |
| ----- | ------------------------------------------------------------------------------------------------------------- | --------------- |
| **1** | Coordinate refactor: `pos` model, `resolveCenter`/`centerToPos`, `setAspect` reflows, legacy migration, tests | **IN PROGRESS** |
| 2     | Format registry + safe-zone config (`lib/composition/formats.ts`)                                             | pending         |
| 3     | Format rail UI: live thumbnails per connected platform + ⚠ safe-zone flags                                    | pending         |
| 4     | Per-format overrides (delta storage on the doc)                                                               | pending         |
| 5     | Fan-out export + batch publish, each locked to its platform                                                   | pending         |
| 6     | _(optional)_ vision "auto-fix this format" button (credits)                                                   | pending         |

---

## 6. Phase 1 Scope — explicit boundaries

**In scope**

- `pos` discriminated union replaces `x, y` on every layer.
- `resolveCenter` / `centerToPos` in `lib/composition/layers.ts`.
- Canvas render, hit-test, selection outline, drag, resize, inline-text-edit
  positioning all resolve through `pos`.
- FFmpeg export emits fraction- and anchor-correct overlay positions.
- New-layer seeding + `brandKitLayers` emit `pos` (fraction).
- `setAspect` reflows automatically (no remap needed).
- Legacy `{x,y}` migration on doc parse.
- Unit tests: resolve/inverse round-trips, reflow across aspects, anchor
  pinning, migration, export expressions.

**Explicitly NOT in Phase 1** (later phases / documented follow-ups)

- **Size adaptation.** `scale` / `sizePx` stay as authored (constant px). Because
  the min axis is a constant 1080, sizes read consistently across aspects for v1.
  Canvas-relative sizing is a later refinement.
- **A UI control to mark a layer as anchor-pinned.** The model, resolver, and
  export fully support anchor mode and it is unit-tested, but current seeders all
  emit fraction. The "pin to corner" control ships with the rail (Phase 3).
  - **Known constraint to resolve alongside anchor authoring:** anchor pinning
    uses the layer's _un-rotated_ half-size, while the FFmpeg export pins the
    _rotated_ bounding box (the `rotate` filter expands `w`/`h` via
    `rotw`/`roth`). So an anchor layer with `rotationDeg != 0` would sit a
    different distance from its corner in preview vs. MP4. Unreachable today
    (nothing emits anchor pos; fraction mode is immune because it centres
    regardless of size). Fix when the pin UI lands: feed `resolveCenter` the
    rotated bounding-box half-size for rotated anchor layers.
- Multi-format documents, per-format overrides, the rail, fan-out, vision — all
  later phases.

---

## 7. Invariants (do not break)

1. Preview and export must render identically — `resolveCenter` (client) and the
   export's positional expressions are twins and must stay in lockstep.
2. `pos` is the single source of truth for position. No absolute `x, y` persists.
3. The data model stays JSON-serialisable and free of node/browser imports
   (shared by client canvas and server FFmpeg).
4. Changing aspect must never mutate a layer's `pos`.
