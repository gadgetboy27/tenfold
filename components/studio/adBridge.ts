"use client";

import { v4 as uuidv4 } from "uuid";
import { useCompositorStore } from "@/store/useCompositorStore";
import {
  ASPECT_DESIGN,
  CAPTION_LAYER_ID,
  type CompositionAspect,
  type ImageLayer,
  type TextLayer,
} from "@/lib/composition/layers";
import { wrapText } from "@/lib/composition/brand-apply";

/**
 * The one bridge between the generation rail (right) and the Ad stage (centre).
 *
 * Every tool in the rail produces something; choosing it puts it on the ad.
 * These helpers are the only supported way to do that, so "what does Add to ad
 * mean for this tool?" is answered once here rather than per panel.
 *
 * They read the zustand store imperatively (`getState()`) rather than taking it
 * as a prop: the rail is a deep tree of self-contained panels, and threading an
 * `onAddToAd` callback through all of them is the prop-drilling this avoids.
 */

/** Default placement for a newly added layer: centred, unscaled, on top. */
function baseLayer(id: string) {
  return {
    id,
    pos: { mode: "fraction" as const, nx: 0.5, ny: 0.5 },
    scale: 1,
    rotationDeg: 0,
    opacity: 1,
    blend: "normal" as const,
    appearAt: 0,
    disappearAt: null,
    fadeSec: 0,
  };
}

export type AddResult = "background" | "layer";

/**
 * Put an image on the ad.
 *
 * With no doc yet the stage is an empty artboard, and the first image becomes
 * the BACKGROUND — that's what creates the real composition, at whatever aspect
 * the user picked on the placeholder. After that, images stack as layers unless
 * the caller explicitly asks to replace the backdrop.
 */
export function addImageToAd(
  src: string,
  opts: { asBackground?: boolean } = {},
): AddResult {
  const s = useCompositorStore.getState();

  if (!s.doc) {
    s.load({
      id: uuidv4(),
      aspect: s.pendingAspect,
      background: { kind: "image", src },
      layers: [],
    });
    return "background";
  }

  if (opts.asBackground) {
    s.setBackground({ kind: "image", src });
    return "background";
  }

  const layer: ImageLayer = { ...baseLayer(uuidv4()), kind: "image", src };
  s.addLayer(layer);
  return "layer";
}

/**
 * Put a video on the ad. A video can only ever be the BACKGROUND — the layer
 * union is image|text, so there is no video layer to stack. Callers must not
 * offer "add as layer" for a clip.
 */
export function addVideoToAd(src: string, durationSec?: number): AddResult {
  const s = useCompositorStore.getState();
  const background = {
    kind: "video" as const,
    src,
    ...(durationSec ? { durationSec } : {}),
  };

  if (!s.doc) {
    s.load({
      id: uuidv4(),
      aspect: s.pendingAspect,
      background,
      layers: [],
    });
  } else {
    s.setBackground(background);
  }
  return "background";
}

/**
 * Put caption text on the ad. Reuses CAPTION_LAYER_ID so generating a caption
 * twice REPLACES the first rather than stacking two overlapping text blocks —
 * the same stable-id contract the caption-style presets rely on.
 */
export function addCaptionToAd(text: string): AddResult | null {
  const s = useCompositorStore.getState();
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return null;
  // No doc means no backdrop to caption yet — the caller shows the reason.
  if (!s.doc) return null;

  // Fit the caption to the artboard. The first version hardcoded 64px and did
  // no wrapping at all, so a real 277-character social caption rendered as
  // three giant lines running off both edges of the frame.
  //
  // A social caption is body copy, not a headline, and its length varies
  // hugely — so the wrap width scales with it and the size follows the wrap,
  // using the ratio brand-apply already established (wrap 26 -> width/22,
  // wrap 32 -> width/26, i.e. size ~= width / (wrapChars * 0.83)).
  const wrapChars = trimmed.length > 180 ? 42 : trimmed.length > 90 ? 32 : 26;
  const design = ASPECT_DESIGN[s.doc.aspect];
  const sizePx = Math.round(design.width / (wrapChars * 0.83));

  const layer: TextLayer = {
    ...baseLayer(CAPTION_LAYER_ID),
    // Matches brand-apply's tagline placement, so a generated caption and a
    // brand-kit tagline land in the same spot rather than fighting.
    pos: { mode: "fraction" as const, nx: 0.5, ny: 0.84 },
    kind: "text",
    text: wrapText(trimmed, wrapChars),
    font: "Inter",
    sizePx,
    color: "#ffffff",
    align: "center",
    bg: { color: "#000000", opacity: 0.45, padPx: 20 },
  };

  const existing = s.doc.layers.find((l) => l.id === CAPTION_LAYER_ID);
  if (existing) s.replaceLayer(CAPTION_LAYER_ID, layer);
  else s.addLayer(layer);
  return "layer";
}

/** Change the artboard's shape — before a doc exists, and after. */
export function setAdAspect(aspect: CompositionAspect) {
  const s = useCompositorStore.getState();
  s.setPendingAspect(aspect);
  if (s.doc) s.setAspect(aspect);
}

/** True once the ad has a real, persistable composition behind it. */
export function adHasDoc(): boolean {
  return useCompositorStore.getState().doc !== null;
}
