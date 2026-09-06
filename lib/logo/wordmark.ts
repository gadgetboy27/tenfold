import { SUPPORTED_FONTS, type SupportedFont } from "./font-list";

/**
 * Compose a mark + a name into one lockup SVG.
 *
 * This is the half of the logo builder that was missing. Importing an existing
 * logo dropped the user into the REFINE screen — the AI-regeneration path —
 * which answers "make me a different logo" when the user has just said "this
 * one is mine, I only want to set it". A business bringing its own mark needs
 * typography and arrangement, not another six concepts.
 *
 * Kept pure and free of React so the geometry can be tested without a DOM, and
 * free of `next/font` so it can run on the server too.
 *
 * ── Why font-family by NAME and not embedded outlines ──────────────────────
 *
 * The honest trade. Converting text to paths would make the SVG render
 * identically anywhere, but needs a font-parsing dependency (opentype.js) and
 * loses the ability to re-edit the words later. Embedding the face as base64
 * bloats every saved version by ~100KB+.
 *
 * Naming the family is what the rest of this product already does: the five
 * fonts here ARE `BRAND_FONTS` in lib/composition/brand-apply.ts, the set the
 * compositor renders into video and stills. So a lockup saved with one of
 * these names is drawable by every downstream stage that already draws brand
 * type. Adding a sixth font means adding it there first, or the logo renders
 * in a fallback face everywhere outside the browser — which is why
 * `coerceFont` refuses anything off the list rather than passing it through.
 */

export type LockupLayout = "stacked" | "horizontal" | "text-only" | "mark-only";

export interface WordmarkSpec {
  /** The imported mark, as raw SVG markup. Omit for a text-only lockup. */
  markSvg?: string | null;
  /** The business name. Empty renders a mark-only lockup regardless of layout. */
  text: string;
  font: SupportedFont;
  /** Relative to a 100-unit canvas, so it's resolution-independent. */
  fontSize: number;
  letterSpacing: number;
  weight: number;
  color: string;
  layout: LockupLayout;
  /** Gap between mark and text, in the same 100-unit space. */
  gap: number;
  /**
   * PREVIEW ONLY. `next/font` self-hosts under a generated, scoped family name,
   * so the browser cannot resolve the literal "Montserrat" that belongs in the
   * saved file. The editor passes the scoped name here to render live; save
   * omits it so the stored SVG carries the real family that downstream
   * renderers resolve against. Two different strings on purpose.
   */
  previewFontFamily?: string;
}

export const DEFAULT_WORDMARK: Omit<WordmarkSpec, "markSvg" | "text"> = {
  font: "Montserrat",
  fontSize: 18,
  letterSpacing: 0,
  weight: 700,
  color: "#111111",
  layout: "stacked",
  gap: 10,
};

/** Refuse an unrenderable family rather than silently shipping a fallback. */
export function coerceFont(value: unknown): SupportedFont {
  return (SUPPORTED_FONTS as readonly string[]).includes(value as string)
    ? (value as SupportedFont)
    : "Montserrat";
}

/** XML-escape — a business name legitimately contains & and quotes. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The mark's aspect ratio, from its own viewBox (or width/height).
 *
 * Defaults to square when neither is present: an unknown aspect drawn as 1:1
 * is at worst slightly stretched, where treating it as zero-width removes the
 * mark from the lockup entirely and looks like the import failed.
 */
export function markAspect(markSvg: string): number {
  const vb = markSvg.match(
    /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i,
  );
  if (vb) {
    const w = parseFloat(vb[1]);
    const h = parseFloat(vb[2]);
    if (w > 0 && h > 0) return w / h;
  }
  const w = markSvg.match(/\bwidth\s*=\s*["']([\d.]+)/i);
  const h = markSvg.match(/\bheight\s*=\s*["']([\d.]+)/i);
  if (w && h) {
    const wv = parseFloat(w[1]);
    const hv = parseFloat(h[1]);
    if (wv > 0 && hv > 0) return wv / hv;
  }
  return 1;
}

/** Strip the outer <svg> wrapper's attributes we're about to override. */
function innerMark(
  markSvg: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  // Nested <svg> rather than unwrapping: it keeps the mark's own viewBox and
  // therefore its own coordinate system, so nothing has to be re-scaled by
  // hand and a mark with a transform on its root still lands correctly.
  const cleaned = markSvg
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .trim()
    .replace(
      /^<svg\b([^>]*)>/i,
      (_m, attrs: string) =>
        `<svg${attrs
          .replace(/\s(width|height|x|y)\s*=\s*["'][^"']*["']/gi, "")
          .replace(
            /\spreserveAspectRatio\s*=\s*["'][^"']*["']/gi,
            "",
          )} x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" preserveAspectRatio="xMidYMid meet">`,
    );
  return cleaned;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Approximate the rendered width of a line.
 *
 * Deliberately an estimate: measuring for real needs a DOM, and this module
 * stays pure so it can be tested and run server-side. 0.58em per character is
 * a reasonable mean across these five faces; the canvas is padded either side
 * so a wide name overflows into slack rather than off the edge. The BROWSER
 * preview is the source of truth for the user — this only has to produce a
 * viewBox that isn't absurd.
 */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  letterSpacing: number,
): number {
  return text.length * (fontSize * 0.58 + letterSpacing);
}

export function composeWordmark(spec: WordmarkSpec): string {
  const font = coerceFont(spec.font);
  const text = spec.text.trim();
  const hasMark = Boolean(spec.markSvg && spec.markSvg.includes("<svg"));
  const hasText = text.length > 0;

  // A layout is a request, not a guarantee — asking for "stacked" with no mark
  // is really a text-only lockup, and honouring the request literally would
  // reserve empty space above the name.
  let layout: LockupLayout = spec.layout;
  if (!hasMark) layout = "text-only";
  else if (!hasText) layout = "mark-only";

  const aspect = hasMark ? markAspect(spec.markSvg!) : 1;
  const textW = estimateTextWidth(text, spec.fontSize, spec.letterSpacing);
  const pad = 6;

  let width: number;
  let height: number;
  let markBox = { x: 0, y: 0, w: 0, h: 0 };
  let textAnchor: "middle" | "start" = "middle";
  let textX = 0;
  let textY = 0;

  if (layout === "mark-only") {
    const h = 100;
    markBox = { x: pad, y: pad, w: h * aspect, h };
    width = markBox.w + pad * 2;
    height = h + pad * 2;
  } else if (layout === "text-only") {
    width = textW + pad * 2;
    height = spec.fontSize * 1.4 + pad * 2;
    textX = width / 2;
    // Baseline, not top: SVG text y is the baseline, so centring the box means
    // dropping by roughly the cap height rather than half the line.
    textY = pad + spec.fontSize;
  } else if (layout === "stacked") {
    const markH = 60;
    const markW = markH * aspect;
    width = Math.max(markW, textW) + pad * 2;
    height = markH + spec.gap + spec.fontSize * 1.4 + pad * 2;
    markBox = { x: (width - markW) / 2, y: pad, w: markW, h: markH };
    textX = width / 2;
    textY = pad + markH + spec.gap + spec.fontSize;
  } else {
    // horizontal
    const markH = Math.max(spec.fontSize * 1.6, 40);
    const markW = markH * aspect;
    width = markW + spec.gap + textW + pad * 2;
    height = Math.max(markH, spec.fontSize * 1.4) + pad * 2;
    markBox = { x: pad, y: (height - markH) / 2, w: markW, h: markH };
    textAnchor = "start";
    textX = pad + markW + spec.gap;
    // Optical centring against the mark, not the box.
    textY = height / 2 + spec.fontSize * 0.35;
  }

  const markEl =
    layout === "text-only"
      ? ""
      : innerMark(spec.markSvg!, markBox.x, markBox.y, markBox.w, markBox.h);

  const textEl =
    layout === "mark-only"
      ? ""
      : `<text x="${round(textX)}" y="${round(textY)}" text-anchor="${textAnchor}" ` +
        `font-family="${escapeXml(spec.previewFontFamily ?? `${font}, sans-serif`)}" font-size="${round(spec.fontSize)}" ` +
        `font-weight="${spec.weight}" letter-spacing="${round(spec.letterSpacing)}" ` +
        `fill="${escapeXml(spec.color)}">${escapeXml(text)}</text>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(width)} ${round(height)}" ` +
    `width="${round(width)}" height="${round(height)}" role="img">` +
    markEl +
    textEl +
    `</svg>`
  );
}
