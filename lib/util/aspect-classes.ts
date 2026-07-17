/**
 * Tailwind classes for the campaign aspect ratios, shared by every surface
 * that previews an asset.
 *
 * These must stay literal strings in a static map — Tailwind v4 scans source
 * text, so a computed class name like `aspect-[${w}/${h}]` would never be
 * generated and the box would silently lose its ratio.
 */

const ASPECT_CLASSES: Record<string, string> = {
  "1:1": "aspect-square",
  "4:5": "aspect-[4/5]",
  "16:9": "aspect-video",
  "9:16": "aspect-[9/16]",
};

/** Aspect box for a ratio, falling back to square for unknown values. */
export function aspectClass(ratio: string | null | undefined): string {
  return ASPECT_CLASSES[ratio ?? "1:1"] ?? ASPECT_CLASSES["1:1"];
}

/**
 * A preview box that fits its column without ever exceeding ~28rem tall,
 * whatever the ratio: width is capped at whichever is smaller — the column, or
 * the width that 28rem of height allows. Height then follows from the ratio.
 *
 * Sizing by height rather than a flat `max-w-*` is the point. A fixed width cap
 * has to be set for the tallest ratio, which leaves 9:16 correct and every
 * other format tiny — the compose preview used `max-w-xs` (320px) for all four,
 * stranding two thirds of a ~940px column.
 *
 * The box must track the image's real ratio because the caption and logo are
 * absolutely positioned against it: letterboxing inside a wrong-shaped
 * container would pin them to the container's edges, not the picture's.
 */
const PREVIEW_BOX: Record<string, string> = {
  "1:1": "aspect-square w-[min(100%,28rem)]",
  "4:5": "aspect-[4/5] w-[min(100%,calc(28rem*4/5))]",
  "16:9": "aspect-video w-[min(100%,calc(28rem*16/9))]",
  "9:16": "aspect-[9/16] w-[min(100%,calc(28rem*9/16))]",
};

export function previewBoxClass(ratio: string | null | undefined): string {
  return PREVIEW_BOX[ratio ?? "1:1"] ?? PREVIEW_BOX["1:1"];
}
