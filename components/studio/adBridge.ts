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
import {
  buildWordsLayer,
  type WordTreatment,
} from "@/lib/composition/words";
import {
  brandKitLayers,
  type BrandKitInfo,
} from "@/lib/composition/brand-apply";
import {
  pickContrastingLogo,
  sampleBackdropLuminance,
} from "@/lib/composition/backdrop";

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

/**
 * The stable id for the Words layer. Like CAPTION_LAYER_ID, a fixed id rather
 * than a uuid: the Words tool is used iteratively — retype, restyle, move the
 * zone — and each pass must REPLACE the block. Generating a new id per edit
 * would stack a dozen overlapping copies of the same headline, each hiding the
 * last, and the user would only find out at export.
 */
export const WORDS_LAYER_ID = "words";

/**
 * Put exact wording on the ad, styled by a treatment.
 *
 * Returns null when there is nothing to put it on: type floating over an empty
 * artboard is not a design, and silently doing nothing is worse than saying so.
 */
export function addWordsToAd(
  text: string,
  treatment: WordTreatment,
): AddResult | null {
  const s = useCompositorStore.getState();
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!s.doc) return null;

  const layer = buildWordsLayer({
    id: WORDS_LAYER_ID,
    text: trimmed,
    treatment,
    aspect: s.doc.aspect,
  });

  const existing = s.doc.layers.find((l) => l.id === WORDS_LAYER_ID);
  if (existing) s.replaceLayer(WORDS_LAYER_ID, layer);
  else s.addLayer(layer);
  return "layer";
}

/** The wording currently on the ad, so the tool reopens on what is there. */
export function currentAdWords(): string {
  const layer = useCompositorStore
    .getState()
    .doc?.layers.find((l) => l.id === WORDS_LAYER_ID);
  return layer && layer.kind === "text" ? layer.text : "";
}

export type BrandApplyOutcome =
  | { ok: true; layers: number; variant: "light" | "dark" | "only" }
  | { ok: false; reason: "no-ad" | "no-logo" };

/**
 * Stamp the workspace's brand kit onto the ad.
 *
 * None of the hard part is new — `brandKitLayers` has always built the logo
 * end-card and the tagline/caption layers, and `brandBridge` has always turned
 * a finalized logo into white and black transparent marks. Both were only ever
 * reachable from the CLASSIC compositor, so the Studio people actually use
 * couldn't apply the brand it had just designed. This connects them.
 *
 * The one genuinely new part is choosing WHICH mark. `pickKitLogo` picks by
 * availability, which puts a white logo on a white product shot as soon as both
 * variants exist. Here the backdrop is measured and the contrasting one wins.
 */
export async function applyBrandKitToAd(
  kit: BrandKitInfo,
  clipDurationSec = 10,
): Promise<BrandApplyOutcome> {
  const s = useCompositorStore.getState();
  if (!s.doc) return { ok: false, reason: "no-ad" };

  const hasBoth = !!kit.logo_url && !!kit.logo_dark_url;
  // Only worth measuring when there's a real choice to make.
  const luminance = hasBoth
    ? await sampleBackdropLuminance(s.doc.background.src)
    : null;
  const logoSrc = pickContrastingLogo(kit, luminance);
  if (!logoSrc) return { ok: false, reason: "no-logo" };

  // brandKitLayers re-reads the logo from the kit via pickKitLogo, so hand it a
  // kit whose primary IS the mark we chose. Otherwise the measurement is done
  // and then quietly ignored.
  const resolved: BrandKitInfo = { ...kit, logo_url: logoSrc };

  // Carry through wording the user has already written. brandKitLayers writes
  // its main text to CAPTION_LAYER_ID, so passing null here would silently
  // replace a caption they generated with the kit's tagline — their words gone,
  // no warning, discovered later. The `caption` parameter exists for exactly
  // this: when present it becomes the main text and the tagline moves to the
  // end card, so both survive.
  const existingCaption = s.doc.layers.find(
    (l) => l.id === CAPTION_LAYER_ID && l.kind === "text",
  );
  const carried =
    existingCaption && existingCaption.kind === "text"
      ? existingCaption.text
      : null;

  const layers = brandKitLayers(
    resolved,
    s.doc.aspect,
    clipDurationSec,
    null,
    carried,
  );
  for (const layer of layers) {
    // Never touch the Words layer: it holds wording the user typed by hand, in
    // a zone they chose, and the brand kit has no business rewriting it.
    if (layer.id === WORDS_LAYER_ID) continue;
    const existing = s.doc.layers.find((l) => l.id === layer.id);
    // Stable-id layers (the caption) must replace, not stack — same contract
    // as addCaptionToAd.
    if (existing) s.replaceLayer(layer.id, layer);
    else s.addLayer(layer);
  }

  return {
    ok: true,
    layers: layers.length,
    variant: !hasBoth ? "only" : logoSrc === kit.logo_dark_url ? "dark" : "light",
  };
}
