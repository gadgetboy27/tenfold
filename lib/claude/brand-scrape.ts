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
export interface DetectedFont {
  /** The family name as the site declares it, e.g. "Poppins". */
  name: string;
  /** The closest face we can actually render, or null if nothing near it. */
  mapped: SupportedFont | null;
}

export interface ExtractedBrandSignals {
  /** Candidate hex colors, most confident first. Empty if nothing usable found. */
  colors: string[];
  /** The heading face, as a SUPPORTED_FONTS entry — kept for callers that
   *  only want one font. Same as `fonts.heading.mapped`. */
  fontFamily: SupportedFont | null;
  /**
   * Heading and body faces, separately. Most sites set two — a display face
   * on h1–h3 and a text face on body — and an ad that borrows only one of
   * them reads as almost-but-not-quite the site. Either is null when the
   * page gives no signal for it; body falls back to heading when the site
   * uses one family everywhere.
   */
  fonts: { heading: DetectedFont | null; body: DetectedFont | null };
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

// Keyword → SUPPORTED_FONTS mapping. Exact-ish names first; then families we
// don't ship but can stand in for honestly (a geometric sans for a geometric
// sans, a transitional serif for a transitional serif). An unmatched name
// returns null rather than being force-mapped to something unrelated — the
// raw name is still surfaced so the user can see what the site really uses.
const FONT_KEYWORDS: [RegExp, SupportedFont][] = [
  [/playfair/i, "Playfair Display"],
  [/montserrat/i, "Montserrat"],
  [/lora/i, "Lora"],
  [/roboto/i, "Roboto"],
  [/inter\b/i, "Inter"],
  // Geometric / grotesque sans → Montserrat or Inter
  [
    /poppins|raleway|nunito|quicksand|futura|avenir|proxima|gotham|circular|dm sans|outfit|manrope|lexend|jost|urbanist|sora|plus jakarta/i,
    "Montserrat",
  ],
  [
    /open sans|lato|source sans|work sans|helvetica|arial|segoe|system-ui|ibm plex sans|noto sans|karla|rubik|figtree|mulish|public sans|hind|cabin/i,
    "Inter",
  ],
  // Serifs → Playfair (display) or Lora (text)
  [
    /merriweather|georgia|garamond|libre baskerville|crimson|pt serif|source serif|noto serif|spectral|cormorant|dm serif|fraunces|newsreader|literata/i,
    "Lora",
  ],
  [
    /cinzel|abril|bodoni|didot|prata|cormorant garamond|yeseva|marcellus|libre caslon/i,
    "Playfair Display",
  ],
];

function mapFont(name: string): SupportedFont | null {
  for (const [pattern, font] of FONT_KEYWORDS) {
    if (pattern.test(name)) return font;
  }
  return null;
}

/** "'Open Sans', sans-serif" → "Open Sans". Generic families are not a name. */
function firstFamily(decl: string): string | null {
  const first = decl
    .split(",")[0]
    .replace(/["']/g, "")
    .replace(/\s*!important/i, "")
    .trim();
  if (!first) return null;
  if (
    /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset|var\()/i.test(
      first,
    )
  )
    return null;
  return first;
}

/** Families the page loads from Google Fonts, in the order it asks for them. */
function googleFamilies(html: string): string[] {
  const out: string[] = [];
  const hrefs = [
    ...html.matchAll(
      /<link[^>]+href=["']([^"']*fonts\.googleapis\.com[^"']*)["']/gi,
    ),
    ...html.matchAll(
      /@import\s+url\(["']?([^"')]*fonts\.googleapis\.com[^"')]*)/gi,
    ),
  ].map((m) => m[1]);
  for (const href of hrefs) {
    let params: URLSearchParams;
    try {
      params = new URL(
        href.replace(/&amp;/g, "&"),
        "https://fonts.googleapis.com",
      ).searchParams;
    } catch {
      continue;
    }
    // CSS2: repeated family=Name:wght@…; CSS1: family=A|B
    for (const fam of params.getAll("family")) {
      for (const part of fam.split("|")) {
        const name = part.split(":")[0].replace(/\+/g, " ").trim();
        if (name && !out.includes(name)) out.push(name);
      }
    }
  }
  return out;
}

/**
 * font-family declarations from inline <style> blocks, keyed by whether the
 * selector is a heading or a body/text one. Only the first family of each
 * declaration counts, and only real names (not "sans-serif").
 */
function cssFamilies(html: string): { heading: string[]; body: string[] } {
  const heading: string[] = [];
  const body: string[] = [];
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (m) => m[1],
  );
  for (const css of styles) {
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim();
      const decl = rule[2].match(/font-family\s*:\s*([^;]+)/i)?.[1];
      if (!decl) continue;
      const name = firstFamily(decl);
      if (!name) continue;
      if (
        /(^|[\s,>+~])h[1-3]\b|\.(heading|headline|title|display|hero)/i.test(
          selector,
        )
      ) {
        if (!heading.includes(name)) heading.push(name);
      } else if (
        /(^|[\s,])(html|body|p)\b|\.(body|text|copy|paragraph)/i.test(selector)
      ) {
        if (!body.includes(name)) body.push(name);
      }
    }
  }
  return { heading, body };
}

function extractFonts(html: string): ExtractedBrandSignals["fonts"] {
  const css = cssFamilies(html);
  const google = googleFamilies(html);
  // An explicit heading/body rule beats load order; load order (display face
  // first, text face second, by convention) fills whatever the CSS didn't say.
  const headingName = css.heading[0] ?? google[0] ?? null;
  const bodyName =
    css.body[0] ??
    google.find((g) => g !== headingName) ??
    (css.heading.length ? null : google[0]) ??
    null;
  const wrap = (name: string | null): DetectedFont | null =>
    name ? { name, mapped: mapFont(name) } : null;
  const heading = wrap(headingName);
  // One family everywhere: body is that family too, not "unknown".
  const body = wrap(bodyName) ?? heading;
  return { heading, body };
}

export function extractBrandSignals(html: string): ExtractedBrandSignals {
  const fonts = extractFonts(html);
  return {
    colors: extractColors(html),
    fontFamily: fonts.heading?.mapped ?? null,
    fonts,
  };
}
