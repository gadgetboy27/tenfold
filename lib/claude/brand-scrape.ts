import type { SupportedFont } from "@/lib/logo/font-list";

/**
 * Deterministic brand-signal extraction from a page's raw HTML — no AI call,
 * near-zero cost. Runs on the RAW html (unlike lib/claude/campaign-brief.ts's
 * page-content parsing, which strips <style> blocks first — this needs them).
 *
 * Best-effort heuristic, not pixel-perfect brand replication: colors set via
 * JS/Tailwind config that never reaches server-rendered HTML, or fonts
 * loaded from non-Google CDNs, won't be detected. Low-confidence results
 * (fewer than 2 color candidates, or no font match) are left for the caller
 * to fill in with an AI suggestion instead of guessing from partial data.
 */
export interface ExtractedBrandSignals {
  /** Candidate hex colors, most confident first. Empty if nothing usable found. */
  colors: string[];
  /** A SUPPORTED_FONTS entry, or null if no confident match. */
  fontFamily: SupportedFont | null;
}

function normalizeHex(hex: string): string | null {
  const h = hex.replace("#", "").toLowerCase();
  if (h.length === 3) {
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  if (h.length === 6) return `#${h}`;
  return null; // 4/8-digit (alpha) hex skipped — not a plain brand color
}

function isGrayscaleOrExtreme(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Near-grayscale (low saturation) or near-black/near-white — rarely the
  // "brand" color even when it's the most frequent hex on the page (usually
  // body text/background).
  const isGrayish = max - min < 12;
  const isExtreme = max < 25 || min > 235;
  return isGrayish || isExtreme;
}

function extractColors(html: string): string[] {
  const candidates: string[] = [];

  // Highest confidence: explicit theme-color meta tag.
  const themeColor =
    html.match(
      /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ??
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i,
    )?.[1];
  if (themeColor) {
    // Weight it by pushing it in 3x so it wins the frequency tally below.
    candidates.push(themeColor, themeColor, themeColor);
  }

  // CSS custom properties naming a brand/primary/accent color — high confidence.
  const styleBlocks = [
    ...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi),
  ].map((m) => m[1]);
  const inlineStyles = [...html.matchAll(/style=["']([^"']+)["']/gi)].map(
    (m) => m[1],
  );
  const allCss = styleBlocks.join("\n");

  for (const m of allCss.matchAll(
    /--[\w-]*(?:brand|primary|accent|theme)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,6})\b/gi,
  )) {
    candidates.push(m[1], m[1]);
  }

  // Plain hex codes anywhere in <style> blocks or inline style attributes —
  // lower confidence, tallied by frequency below.
  for (const source of [...styleBlocks, ...inlineStyles]) {
    for (const m of source.matchAll(/#[0-9a-fA-F]{3,6}\b/g)) {
      candidates.push(m[0]);
    }
  }

  const tally = new Map<string, number>();
  for (const raw of candidates) {
    const normalized = normalizeHex(raw);
    if (!normalized || isGrayscaleOrExtreme(normalized)) continue;
    tally.set(normalized, (tally.get(normalized) ?? 0) + 1);
  }

  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([hex]) => hex);
}

// Keyword → SUPPORTED_FONTS mapping. Deliberately conservative — an unmatched
// font name returns null rather than being force-mapped to something unrelated.
const FONT_KEYWORDS: [RegExp, SupportedFont][] = [
  [/playfair/i, "Playfair Display"],
  [/montserrat/i, "Montserrat"],
  [/lora/i, "Lora"],
  [/roboto/i, "Roboto"],
  [/inter\b/i, "Inter"],
];

function extractFontFamily(html: string): SupportedFont | null {
  const hrefs = [
    ...html.matchAll(
      /<link[^>]+href=["']([^"']*fonts\.googleapis\.com[^"']*)["']/gi,
    ),
  ].map((m) => m[1]);
  for (const href of hrefs) {
    const familyParam = new URL(
      href,
      "https://fonts.googleapis.com",
    ).searchParams.get("family");
    if (!familyParam) continue;
    // CSS2 API: "family=Playfair+Display:wght@400;700" — CSS1: "Roboto|Open+Sans"
    const firstFamily = familyParam
      .split(/[|,]/)[0]
      .split(":")[0]
      .replace(/\+/g, " ");
    for (const [pattern, font] of FONT_KEYWORDS) {
      if (pattern.test(firstFamily)) return font;
    }
  }
  return null;
}

export function extractBrandSignals(html: string): ExtractedBrandSignals {
  return {
    colors: extractColors(html),
    fontFamily: extractFontFamily(html),
  };
}
