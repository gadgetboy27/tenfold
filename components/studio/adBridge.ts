"use client";

import { v4 as uuidv4 } from "uuid";
import { useCompositorStore } from "@/store/useCompositorStore";
import {
  ASPECT_DESIGN,
  CAPTION_LAYER_ID,
  type CompositionAspect,
  type ImageLayer,
  type Layer,
  type StickerSpec,
  type TextLayer,
} from "@/lib/composition/layers";
import { rasterizeSticker } from "@/lib/composition/sticker";
import type { TrayItem } from "@/lib/composition/tray";
import { wrapText } from "@/lib/composition/brand-apply";
import {
  buildWordsLayer,
  DEFAULT_TREATMENT,
  refitTextLayer,
  sizeForWords,
  textOverflows,
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
 * Place a prepared tray element at a point on the ad.
 *
 * Lives here rather than in AdStage because this file is the ONE supported way
 * to put something on the ad — a second path that reaches the store directly is
 * how two callers end up disagreeing about what a layer looks like.
 *
 * Returns false when there is no doc yet. A drop needs somewhere to land, and
 * `background.src` is required, so there is no such thing as a composition
 * whose first content is a logo — the ad has to have a backdrop before it can
 * be decorated. The caller shows the empty artboard's own guidance rather than
 * a failure, because "nothing happened" is the one outcome worth avoiding.
 */
export type DropOutcome =
  | { placed: "layer" }
  | { placed: "background" }
  | { placed: "music"; src: string }
  | { placed: "none"; reason: "no-doc" };

export function dropTrayItem(
  item: TrayItem,
  at: { nx: number; ny: number },
): DropOutcome {
  const s = useCompositorStore.getState();

  // A clip REPLACES the backdrop rather than stacking, and it needs no doc to
  // land on — dropping a video onto an empty artboard is how you start.
  if (item.kind === "video") {
    addVideoToAd(item.src, item.durationSec);
    return { placed: "background" };
  }
  // Audio never touches the canvas; the caller wires it to the render.
  if (item.kind === "music") return { placed: "music", src: item.src };

  if (!s.doc) return { placed: "none", reason: "no-doc" };

  const base = {
    ...baseLayer(uuidv4()),
    pos: { mode: "fraction" as const, ...at },
  };
  const layer: Layer =
    item.kind === "mark"
      ? { ...base, kind: "image", src: item.src }
      : {
          ...base,
          kind: "text",
          text: item.text,
          font: item.font,
          weight: item.weight ?? 400,
          sizePx: item.fontSize,
          color: item.color,
          // Same scrim the FFmpeg caption presets have always drawn: white
          // lettering over bright footage is unreadable.
          ...(item.scrim
            ? { bg: { color: "#000000", opacity: 0.45, padPx: 20 } }
            : {}),
        };
  s.addLayer(layer);
  return { placed: "layer" };
}

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

export type SyncWordsOutcome =
  | "placed"
  | "updated"
  | "removed"
  | "empty"
  | "no-doc";

/**
 * Keep the Words layer in step with the tool, live.
 *
 * `addWordsToAd` rebuilds the whole layer from a treatment — including its
 * position — which is right for "place this here" and wrong for "make it
 * blue": rebuilding would snap type the user had dragged into place back to
 * the zone it started in. This is the other half: the layer already on the ad
 * keeps wherever it was put (`pos`) and however it was pulled (`scale`), and
 * only what the tool actually changed — the letters, the face, the colour,
 * the panel — is written. Size is re-derived from the text so a headline that
 * grows from "Sale" to "Summer sale now on" stays inside the frame as it is
 * typed, rather than keeping the 400px size four letters earned.
 *
 * With no text left the layer is removed rather than left as an empty block
 * nobody can see to delete. With no doc there is nothing to draw on — the
 * caller says so instead of silently doing nothing.
 */
export function syncAdWords(
  text: string,
  treatment: WordTreatment,
): SyncWordsOutcome {
  const s = useCompositorStore.getState();
  if (!s.doc) return "no-doc";
  const trimmed = text.trim();
  const existing = s.doc.layers.find((l) => l.id === WORDS_LAYER_ID);

  if (!trimmed) {
    if (!existing) return "empty";
    s.removeLayer(WORDS_LAYER_ID);
    return "removed";
  }

  const fresh = buildWordsLayer({
    id: WORDS_LAYER_ID,
    text: trimmed,
    treatment,
    aspect: s.doc.aspect,
  });
  if (!existing || existing.kind !== "text") {
    s.addLayer(fresh);
    return "placed";
  }
  // A box the user drew by pulling a side handle wins over auto layout: wrap
  // to its width and leave the size alone, so more words mean more lines in
  // the same box — not a re-flow to the headline default and a new size.
  const boxed = existing.wrapChars
    ? {
        text: wrapText(trimmed.replace(/\n/g, " "), existing.wrapChars),
        sizePx: existing.sizePx,
      }
    : { text: fresh.text, sizePx: fresh.sizePx };
  s.updateLayer(WORDS_LAYER_ID, {
    ...boxed,
    font: fresh.font,
    weight: fresh.weight ?? 400,
    color: fresh.color,
    // Written even when absent, so unticking "panel" actually clears it.
    bg: fresh.bg,
  });
  return "updated";
}

/** The four things the Wording panel's pickers can change on any text. */
export interface TextStyle {
  font: WordTreatment["font"];
  weight: 400 | 700;
  color: string;
  scrim: boolean;
}

/** Read a text layer's style in the pickers' terms. */
export function textStyleOf(layer: TextLayer): TextStyle {
  return {
    font: layer.font as WordTreatment["font"],
    weight: layer.weight ?? 400,
    color: layer.color,
    scrim: !!layer.bg,
  };
}

/**
 * Which text the pickers are editing right now.
 *
 * The one the user clicked on the stage, if it's text; otherwise the Words
 * block, then the caption. One set of font/colour controls serves every piece
 * of type on the ad this way — a headline and a generated caption are both
 * just text layers, and giving each its own duplicate row of pickers was the
 * clutter this replaces. Pure, so it can be a zustand selector.
 */
export function pickTextTarget(
  layers: readonly Layer[] | undefined,
  selectedId: string | null,
): TextLayer | null {
  const byId = (id: string | null) => {
    const l = id ? layers?.find((x) => x.id === id) : undefined;
    return l && l.kind === "text" ? l : null;
  };
  return byId(selectedId) ?? byId(WORDS_LAYER_ID) ?? byId(CAPTION_LAYER_ID);
}

/** Restyle one text layer in place — nothing about its position or size moves. */
export function restyleAdText(id: string, patch: Partial<TextStyle>): boolean {
  const s = useCompositorStore.getState();
  const layer = s.doc?.layers.find((l) => l.id === id);
  if (!layer || layer.kind !== "text") return false;
  s.updateLayer(id, {
    ...(patch.font !== undefined ? { font: patch.font } : {}),
    ...(patch.weight !== undefined ? { weight: patch.weight } : {}),
    ...(patch.color !== undefined ? { color: patch.color } : {}),
    ...(patch.scrim !== undefined
      ? {
          bg: patch.scrim
            ? { color: "#000000", opacity: 0.45, padPx: 20 }
            : undefined,
        }
      : {}),
  });
  return true;
}

/**
 * Retype the Words block without touching its look. The style comes from the
 * layer itself when it exists — a colour picked a moment ago must survive the
 * next keystroke — and from `fallback` (the panel's last-used style) only when
 * the block is being created.
 */
export function retypeAdWords(
  text: string,
  fallback: TextStyle,
): SyncWordsOutcome {
  const existing = useCompositorStore
    .getState()
    .doc?.layers.find((l) => l.id === WORDS_LAYER_ID);
  const style =
    existing && existing.kind === "text" ? textStyleOf(existing) : fallback;
  return syncAdWords(text, { ...DEFAULT_TREATMENT, ...style });
}

/** What new text should look like: whatever text is current on the ad, or a
 *  plain bold white default when there is none yet. */
export function currentTextStyle(): TextStyle {
  const s = useCompositorStore.getState();
  const target = pickTextTarget(s.doc?.layers, s.selectedLayerId);
  return target
    ? textStyleOf(target)
    : { font: "Inter", weight: 700, color: "#ffffff", scrim: false };
}

/**
 * Prepare a piece of text for the tray — as a drag payload, styled like the
 * text already on the ad so it lands matching rather than in some third
 * default. The tray used to carry its own font / size / colour / weight
 * controls for this, a second copy of the Wording picker; now it carries
 * none, and the picker restyles the block once it's down.
 */
export function trayTextItem(id: string, text: string): TrayItem {
  const s = useCompositorStore.getState();
  const style = currentTextStyle();
  const aspect = s.doc?.aspect ?? s.pendingAspect;
  return {
    kind: "lettering",
    id,
    text,
    font: style.font,
    fontSize: sizeForWords(text, 0.5, aspect),
    weight: style.weight,
    color: style.color,
    scrim: style.scrim,
  };
}

/**
 * Put ANOTHER text block on the ad — a price, a date, a second line — as its
 * own layer with a fresh id, so it stacks beside the Words block instead of
 * replacing it. Centred; the user drags it from there. Selected on creation,
 * so the Wording picker styles it immediately.
 */
export function addTextBlockToAd(text: string): AddResult | null {
  const s = useCompositorStore.getState();
  const trimmed = text.trim();
  if (!trimmed || !s.doc) return null;
  const item = trayTextItem(uuidv4(), trimmed);
  const outcome = dropTrayItem(item, { nx: 0.5, ny: 0.5 });
  return outcome.placed === "layer" ? "layer" : null;
}

/**
 * Put a sticker on the ad — rasterised text as an image layer (see
 * lib/composition/sticker.ts for why it is not a text layer). Sized to about
 * two-fifths of the frame width, centred, selected; the user tilts and drags
 * it from there. Returns the new layer id, or null with no ad to land on.
 */
export function addStickerToAd(spec: StickerSpec): string | null {
  const s = useCompositorStore.getState();
  if (!s.doc) return null;
  const raster = rasterizeSticker(spec);
  const design = ASPECT_DESIGN[s.doc.aspect];
  const id = uuidv4();
  s.addLayer({
    ...baseLayer(id),
    kind: "image",
    src: raster.dataUrl,
    sticker: spec,
    scale: Math.min(1, (design.width * 0.4) / raster.width),
  });
  return id;
}

/**
 * Re-draw a sticker in place. Position, scale and tilt are the user's and
 * stay; only the pixels and the spec they came from change. A new PNG is
 * the same width as the old one only by coincidence, so a text change can
 * grow or shrink the block — which is what typing into a sticker should do.
 */
export function restyleSticker(id: string, spec: StickerSpec): boolean {
  const s = useCompositorStore.getState();
  const layer = s.doc?.layers.find((l) => l.id === id);
  if (!layer || layer.kind !== "image" || !layer.sticker) return false;
  const raster = rasterizeSticker(spec);
  s.updateLayer(id, { src: raster.dataUrl, sticker: spec });
  return true;
}

/** The sticker the user has selected on the stage, if any. Pure. */
export function pickStickerTarget(
  layers: readonly Layer[] | undefined,
  selectedId: string | null,
): (ImageLayer & { sticker: StickerSpec }) | null {
  const l = selectedId ? layers?.find((x) => x.id === selectedId) : undefined;
  return l && l.kind === "image" && l.sticker
    ? (l as ImageLayer & { sticker: StickerSpec })
    : null;
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
    variant: !hasBoth
      ? "only"
      : logoSrc === kit.logo_dark_url
        ? "dark"
        : "light",
  };
}

/** How many text layers currently run off the frame. Drives whether the
 *  re-fit action is worth showing at all. */
export function countOverflowingText(): number {
  const doc = useCompositorStore.getState().doc;
  if (!doc) return 0;
  return doc.layers.filter(
    (l) => l.kind === "text" && textOverflows(l, doc.aspect),
  ).length;
}

/**
 * Shrink any text that overflows the frame, and change nothing else.
 *
 * User-triggered on purpose. Layers created before the sizing fix keep their
 * old 64px unwrapped size and overflow, but silently rewriting someone's saved
 * composition on load — because we now disagree with its sizing — is worse than
 * leaving it visibly wrong. They press this when they want it.
 *
 * Returns how many layers changed, so the caller can say something true rather
 * than claiming success on a no-op.
 */
export function refitAdText(): number {
  const s = useCompositorStore.getState();
  if (!s.doc) return 0;

  let fixed = 0;
  for (const layer of s.doc.layers) {
    if (layer.kind !== "text") continue;
    const refitted = refitTextLayer(layer, s.doc.aspect);
    if (refitted.sizePx !== layer.sizePx) {
      s.updateLayer(layer.id, { sizePx: refitted.sizePx });
      fixed++;
    }
  }
  return fixed;
}
