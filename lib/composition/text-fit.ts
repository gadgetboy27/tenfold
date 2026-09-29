import { wrapText } from "./brand-apply";

export interface TextFit {
  text: string;
  wrapChars: number;
  scale: number;
}

/** Schema bounds for `wrapChars` (see layers.ts). */
const MIN_WRAP = 4;
const MAX_WRAP = 200;

/**
 * Fit a text block into a box of `boxW` x `boxH` design px: try every wrap
 * width, and keep the one that lets the type be LARGEST while the wrapped
 * block still fits both dimensions. Narrow the box and the words fold onto
 * more lines (shrinking to stay inside); widen it and they unfold.
 *
 * `measure` returns the block's size at scale 1 — injected so this stays pure
 * (the canvas passes `layerBounds`, tests pass a fixed-width stub).
 */
export function fitTextToBox(
  raw: string,
  boxW: number,
  boxH: number,
  measure: (text: string) => { width: number; height: number },
  scaleRange: { min: number; max: number } = { min: 0.05, max: 20 },
): TextFit {
  const source = raw.replace(/\s+/g, " ").trim();
  const longest = Math.min(MAX_WRAP, Math.max(MIN_WRAP, source.length));
  let best: TextFit | null = null;
  const seen = new Set<string>();
  for (let chars = MIN_WRAP; chars <= longest; chars++) {
    const text = wrapText(source, chars);
    if (seen.has(text)) continue;
    seen.add(text);
    const m = measure(text);
    const scale = Math.min(boxW / m.width, boxH / m.height);
    // `>=` so that on a tie the wider wrap (fewer lines) wins.
    if (!best || scale >= best.scale) best = { text, wrapChars: chars, scale };
  }
  const fit = best ?? { text: source, wrapChars: MIN_WRAP, scale: 1 };
  return {
    ...fit,
    scale: Math.min(scaleRange.max, Math.max(scaleRange.min, fit.scale)),
  };
}

/**
 * Fill a box HEIGHT at a fixed type size: pick the wrap whose block height is
 * closest to `boxH`, so pulling the box taller adds lines (a narrower column)
 * and pushing it shorter merges them, with the letters never rescaled. On a
 * tie the wider wrap wins.
 */
export function fitTextToHeight(
  raw: string,
  boxH: number,
  scale: number,
  measure: (text: string) => { width: number; height: number },
): Pick<TextFit, "text" | "wrapChars"> {
  const source = raw.replace(/\s+/g, " ").trim();
  const longest = Math.min(MAX_WRAP, Math.max(MIN_WRAP, source.length));
  let best = { text: source, wrapChars: MIN_WRAP, gap: Infinity };
  const seen = new Set<string>();
  for (let chars = MIN_WRAP; chars <= longest; chars++) {
    const text = wrapText(source, chars);
    if (seen.has(text)) continue;
    seen.add(text);
    const gap = Math.abs(measure(text).height * scale - boxH);
    if (gap <= best.gap) best = { text, wrapChars: chars, gap };
  }
  return { text: best.text, wrapChars: best.wrapChars };
}
