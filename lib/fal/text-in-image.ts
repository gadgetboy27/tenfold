import { IMAGE_MODELS, DEFAULT_IMAGE_MODEL, type ImageModel } from "./models";

/**
 * Which image model to use when the picture will contain readable text.
 *
 * FLUX ("Sharp") is the default and is excellent at photography, but it cannot
 * render legible lettering — a hot-sauce brief with no text request at all came
 * back with bottles labelled "AUNCEAAN FLEANCE" and "RAME FOOUCH Côtlene HOTO".
 * For a B2B tool whose whole promise is publishable brand assets, that output
 * is unusable, and the user has no way to know which knob to turn.
 *
 * The fix is NOT to change the global default: FLUX is the better photographic
 * model, and most briefs have no text in them. It is to notice when a brief
 * WILL produce lettering and route that one job to a model that can spell.
 */

/**
 * Words that mean "this image will contain readable text", in two groups.
 *
 * The second group is the non-obvious half and the reason this exists: nobody
 * writes "with a legible label" — they write "three bottles on weathered
 * timber", and the model puts a garbled label on the bottles anyway. Packaged
 * goods carry lettering whether or not the brief asks for it, so they belong
 * here even though they never mention text.
 */
const EXPLICIT_TEXT = [
  "text",
  "label",
  "sign",
  "signage",
  "poster",
  "billboard",
  "menu",
  "banner",
  "headline",
  "slogan",
  "tagline",
  "typography",
  "typeface",
  "lettering",
  "wordmark",
  "logo",
  "caption",
  "subtitle",
  "book cover",
  "album cover",
  "business card",
  "flyer",
  "storefront",
  "shopfront",
  "neon",
  "graffiti",
  "handwritten",
  "calligraphy",
  "says",
  "reading",
  "written",
  "spelled",
  "name on",
  "branded",
];

/** Packaging that inevitably carries a printed label. */
const PACKAGED_GOODS = [
  "bottle",
  "jar",
  "can ",
  "tin ",
  "carton",
  "packaging",
  "package",
  "pouch",
  "sachet",
  "tube of",
  "box of",
  "wrapper",
  "product shot",
];

/**
 * Does this brief imply lettering the viewer will try to read?
 *
 * Also true when the brief quotes a phrase — `a mug that says "Monday again"`
 * — which is the clearest possible signal, and one keyword matching can miss
 * when the quoted words are ordinary nouns.
 */
export function promptNeedsLegibleText(prompt: string): boolean {
  const p = ` ${prompt.toLowerCase()} `;

  // A quoted phrase of two or more word characters is text to be rendered.
  if (/["“”'‘’][^"“”'‘’]{2,}["“”'‘’]/.test(prompt)) return true;

  return (
    EXPLICIT_TEXT.some((w) => p.includes(w)) ||
    PACKAGED_GOODS.some((w) => p.includes(w))
  );
}

export interface ResolvedImageModel {
  model: ImageModel;
  /** Set when we moved off the default because the brief implies lettering. */
  switchedForText: boolean;
}

function byId(id: string): ImageModel | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}

/**
 * Pick the model for a run.
 *
 * An EXPLICIT choice always wins — auto-switching under someone who deliberately
 * picked a model would be worse than the garbled text, because it silently
 * overrides an instruction.
 *
 * Otherwise, a text-bearing brief is routed by tier:
 *  - Pro → "Typeset" (Ideogram), best-in-class typography.
 *  - Free → "Fusion" (Nano Banana), which handles in-image text well, is NOT
 *    Pro-gated and costs the SAME 12 credits as the default. That matters: the
 *    free tier is exactly where unusable output loses a signup, and fixing it
 *    here costs the user nothing and needs no pricing decision.
 */
export function resolveImageModel(opts: {
  requested?: string | null;
  prompt: string;
  isPro: boolean;
}): ResolvedImageModel {
  const explicit = opts.requested ? byId(opts.requested) : undefined;
  if (explicit) return { model: explicit, switchedForText: false };

  const fallback = byId(DEFAULT_IMAGE_MODEL)!;
  if (!promptNeedsLegibleText(opts.prompt)) {
    return { model: fallback, switchedForText: false };
  }

  const preferred = opts.isPro ? byId("ideogram") : byId("nano-banana");
  if (!preferred || (preferred.proOnly && !opts.isPro)) {
    return { model: fallback, switchedForText: false };
  }
  return { model: preferred, switchedForText: true };
}
