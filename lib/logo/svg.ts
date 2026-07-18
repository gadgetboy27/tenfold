// Pure SVG manipulation for the free client-side editor (Phase 2). No DOM, no
// AI, no credits — string transforms verified against real Recraft output:
//   - Recraft emits a flat list of <path fill="rgb(r,g,b)"> (no <g>, no <text>,
//     no <style> block, no stroke). So recolour = swap fill values.
//   - The FIRST path is always the full-canvas background rect. Background
//     changes retarget just that path.
// Everything here is a deterministic string op so the whole module is testable
// in node without a browser.

/** A colour used in the logo, plus how many paths carry it (for swatch sizing). */
export interface SvgFill {
  /** Verbatim fill value as it appears in the SVG, e.g. "rgb(230,57,70)". */
  value: string;
  /** Hex form for colour-picker UIs, e.g. "#e63946". */
  hex: string;
  count: number;
}

const FILL_RE = /fill="([^"]+)"/g;

export function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!m) return rgb.startsWith("#") ? rgb.toLowerCase() : rgb;
  const [r, g, b] = [m[1], m[2], m[3]].map((n) => Number(n));
  return (
    "#" +
    [r, g, b]
      .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
      .join("")
  );
}

export function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgb(${r},${g},${b})`;
}

/**
 * Distinct fills in paint order, most-used first, excluding "none". The
 * background fill (see backgroundFill) is included — the editor labels it.
 */
export function extractFills(svg: string): SvgFill[] {
  const counts = new Map<string, number>();
  for (const m of svg.matchAll(FILL_RE)) {
    const v = m[1].trim();
    if (v === "none") continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, hex: rgbToHex(value), count }));
}

/**
 * Swap fills. `mapping` keys are existing fill values (verbatim, as returned by
 * extractFills); values are the replacements (any valid fill string). Only whole
 * fill="…" attributes are replaced, so partial-string collisions can't happen.
 */
export function recolor(svg: string, mapping: Record<string, string>): string {
  let out = svg;
  for (const [from, to] of Object.entries(mapping)) {
    if (from === to) continue;
    out = out.split(`fill="${from}"`).join(`fill="${to}"`);
  }
  return out;
}

/** Width/height from the viewBox (falls back to width/height attrs, then 0). */
function canvasSize(svg: string): { w: number; h: number } | null {
  const vb = svg.match(/viewBox="([\d.\s-]+)"/);
  if (vb) {
    const parts = vb[1].trim().split(/\s+/).map(Number);
    if (parts.length === 4) return { w: parts[2], h: parts[3] };
  }
  return null;
}

/**
 * The full-canvas background path's fill, or null if the logo has no background
 * rect (already transparent). Recraft always makes path #1 a rect tracing the
 * whole viewBox — we match that d generically rather than assuming a fixed size.
 */
export function backgroundFill(svg: string): string | null {
  const size = canvasSize(svg);
  const first = svg.match(
    /<path\b[^>]*\bd="([^"]+)"[^>]*\bfill="([^"]+)"[^>]*>/,
  );
  if (!first) return null;
  const d = first[1].replace(/\s+/g, " ").trim();
  // A rectangle covering the canvas: starts at origin, spans full w/h.
  if (size) {
    const covers =
      d.startsWith("M 0 0") &&
      d.includes(`${size.w} 0`) &&
      d.includes(`${size.w} ${size.h}`);
    if (!covers) return null;
  } else if (!d.startsWith("M 0 0")) {
    return null;
  }
  return first[2];
}

export type BackgroundMode = "transparent" | "light" | "dark" | "brand";

const BG_PRESETS: Record<Exclude<BackgroundMode, "brand">, string> = {
  transparent: "none",
  light: "rgb(255,255,255)",
  dark: "rgb(17,17,17)",
};

/**
 * Retarget only the background path's fill. `brand` needs brandHex; the others
 * are presets. No-op (returns input) if the logo has no detectable background.
 */
export function setBackground(
  svg: string,
  mode: BackgroundMode,
  brandHex?: string,
): string {
  const current = backgroundFill(svg);
  if (current === null) return svg;
  const next =
    mode === "brand"
      ? brandHex
        ? hexToRgb(brandHex)
        : current
      : BG_PRESETS[mode];
  if (next === current) return svg;
  // Replace just the first fill occurrence (the background path is path #1).
  return svg.replace(`fill="${current}"`, `fill="${next}"`);
}

/**
 * Map the logo's distinct non-background fills onto a brand palette, in
 * most-used order. Extra logo colours beyond the palette length are left as-is.
 */
export function applyBrandPalette(svg: string, paletteHex: string[]): string {
  if (paletteHex.length === 0) return svg;
  const bg = backgroundFill(svg);
  const foreground = extractFills(svg).filter((f) => f.value !== bg);
  const mapping: Record<string, string> = {};
  foreground.forEach((f, i) => {
    if (i < paletteHex.length) mapping[f.value] = hexToRgb(paletteHex[i]);
  });
  return recolor(svg, mapping);
}
