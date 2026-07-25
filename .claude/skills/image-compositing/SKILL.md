---
name: image-compositing
description: Reference for tenfold's Image Compositing module (lib/compositing/, Studio's CompositorCanvas) — the AI ops (cutout/inpaint/relight/blend/depth), the mechanical Sharp blend tier, the layer-based UI, and Agency/Business add-on access gating. Use when adding, debugging, or extending a compositing op, its credit cost, its layer/UI wiring, or its tier gating.
---

# Image Compositing — `lib/compositing/`

Photoshop-grade blending: no manual masking, API-driven, through the same
`creative_jobs` queue → webhook → Realtime pattern as everything else. Every
fal endpoint below was verified LIVE before wiring (Jul 2026) — see
`lib/compositing/ops.ts` for the exact input schema per op.

| Op        | fal endpoint                                      | Cost |
| --------- | ------------------------------------------------- | ---- |
| `cutout`  | `fal-ai/birefnet/v2` (same engine as `bg_remove`) | 1    |
| `inpaint` | `fal-ai/flux-pro/v1/fill`                         | 3    |
| `relight` | `fal-ai/iclight-v2`                               | 2    |
| `blend`   | `fal-ai/flux-pro/kontext/max/multi` (2–5 images)  | 3    |
| `depth`   | `fal-ai/image-preprocessors/depth-anything/v2`    | 1    |

`lib/compositing/blend.ts` is a separate, **mechanical** tier — pure Sharp
composites (`textureOverlay`, `gradientMerge`, `softGlow`), zero fal calls, zero
credits, served synchronously via `POST /api/compositing/blend`. The five AI ops
above go through `POST /api/compositing` (debit → `creative_jobs` row → fal
queue → the shared `/api/webhooks/fal` handler), mirroring the dedicated-route
pattern used by `bg-remove` rather than the generic `/api/jobs` dispatcher.

Every result — AI or mechanical — is stored as an asset tagged
`metadata.kind = 'composite_step'` (`storeCompositeAsset()` in
`lib/compositing/storage.ts`) so a pipeline can be stepped back through. Chain
steps via `buildCompositeInput()`; never hand-build a fal input for these
endpoints elsewhere. The shared webhook's asset extension detection now
respects the real `content_type` (png/jpg/svg) instead of forcing `.jpg` —
required so cutout/depth outputs keep their alpha/precision intact.

## UI — each op is a real, lockable layer (Studio's `CompositorCanvas`)

Cutout/inpaint/relight/blend are surfaced as **new layer kinds inside the
EXISTING Compositor layer system** (`components/studio/CompositorCanvas.tsx`,
in Studio's `"compositor"` section) — not a separate/parallel stack. This
reuses `useCompositorStore` + `LayerList` + `LayerControls` verbatim; the only
schema change is `ImageLayer.producedBy` (`lib/composition/layers.ts` —
`compositeProvenanceSchema`: `{ op, jobId?, params? }`), which records that a
layer's image came from a compositing op rather than a plain upload.

- Running an op adds a new **auto-locked** image layer once the fal job
  completes (in-flight runs are transient toolbar state, not a layer — a
  layer's `src` must be a real URL, so nothing pending goes in `doc.layers`).
- **Locking now actually blocks editing everywhere**, not just canvas
  click-through — this was a real gap: `LayerControls` never checked
  `layer.locked` before, so a "locked" layer's sliders were still editable.
  Fixed there, so it protects both the classic Compositor and Studio's canvas.
- Unlocking a `producedBy` layer shows a **"Redo this op"** panel (prompt +
  direction, where applicable) instead of a manual replace — reruns
  `POST /api/compositing` and replaces the layer's `src` in place, re-locking
  on success. Mask (inpaint) and the blended image set (blend) are reused
  as-is on redo — editing them isn't built yet (inpaint's initial "add" flow
  also requires an uploaded mask file; there's no in-canvas mask painter).
- **Depth has no layer/toolbar entry.** It was always described as plumbing
  ("feed into relight or Sharp-side depth-blur"), not a placeable visual
  element, so it isn't forced into the visible stack.
- Persists via the existing `POST /api/compositions/save` (one composition row
  per campaign, upserted) — no new persistence route.

## Access — Agency-only, except Blend (Business add-on)

The whole module (all 5 AI ops **and** the mechanical Sharp blend route) is
**Agency-exclusive by default**. The one carve-out: `blend` (both the AI multi-
image merge and the mechanical blends) can be unlocked on **Business** by
purchasing the **Blend Package** add-on — enforced by `canUseCompositing()`
(`lib/compositing/access.ts`), called at the top of both `POST /api/compositing`
and `POST /api/compositing/blend` before any tenant/credit work.

Add-ons are **not** a column on `subscriptions` — a workspace can hold its main
tier subscription AND one or more add-on subscriptions simultaneously (each its
own Stripe subscription object), so they live in `workspace_addons`
(`lib/billing/addons.ts` — `ADDONS`, `hasActiveAddon()`). Purchasing one reuses
the existing generic `POST /api/credits/purchase` route (already priceId-driven)
— no new checkout route needed, just the `STRIPE_PRICE_BLEND_ADDON` price.

**Webhook correctness note:** `customer.subscription.created/updated` used to
match purely by `stripe_customer_id` and default any unrecognized price to tier
`payg` — which would have silently downgraded a workspace's real tier the
moment it bought a second (add-on) subscription on the same customer. Fixed:
the handler now matches add-on prices by `stripe_subscription_id` (unambiguous
even with two concurrent subscriptions) and only touches `subscriptions.tier`
when the price is a _recognized_ tier price — an unmatched price is now
ignored rather than resetting tier.

**Entitlements correctness note:** `TIERS.business.proEffects` must **not**
statically list `"blend"` — it briefly did, which would have shown the Studio's
"Fade / blend" effect as unlocked (no lock icon) for every Business workspace
while the server-side gate still 403'd them without the add-on. `blend` is
patched into Business's `proEffects` **dynamically** in `getEntitlements()`
only when `hasActiveAddon(..., "blend_package")` is true, so the UI's lock
state and the API's real gate can never drift apart again. Agency keeps
`blend` (and everything else) in the static list — it's bundled, no add-on
needed.
