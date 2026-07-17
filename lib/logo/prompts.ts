/**
 * Prompt engineering for logo generation — the "from scratch" core of the logo
 * builder. Pure and standalone so it can be tested without the fal pipeline.
 *
 * A logo is not a photo. The generation model defaults toward photorealistic,
 * busy, textured images, which is the opposite of what a logo needs: flat,
 * iconic, centred, high-contrast, reproducible at any size. So every prompt is
 * built from a shared logo spine plus a style, and paired with a strong
 * negative prompt that pushes away from photo/clutter/gibberish-text.
 */

export const LOGO_STYLES = [
  "minimalist",
  "wordmark",
  "emblem",
  "icon",
  "playful",
  "luxury",
  "tech",
] as const;

export type LogoStyle = (typeof LOGO_STYLES)[number];

export function isLogoStyle(v: string): v is LogoStyle {
  return (LOGO_STYLES as readonly string[]).includes(v);
}

/** Human labels for the style picker. */
export const LOGO_STYLE_LABELS: Record<LogoStyle, string> = {
  minimalist: "Minimalist",
  wordmark: "Wordmark",
  emblem: "Emblem / Badge",
  icon: "Icon / Symbol",
  playful: "Playful",
  luxury: "Luxury",
  tech: "Tech / Modern",
};

/** What each style asks the model for. */
const STYLE_PROMPT: Record<LogoStyle, string> = {
  minimalist:
    "minimalist logo, single simple geometric mark, generous negative space, one or two flat colours, clean lines",
  wordmark:
    "wordmark logo, the brand name set in a distinctive custom typeface, balanced letterforms, tight kerning, no icon",
  emblem:
    "emblem badge logo, contained within a circular or shield crest, symmetrical, timeless heraldic feel",
  icon: "abstract icon logo, a single memorable symbol, bold silhouette, instantly recognisable at a glance",
  playful:
    "playful friendly logo, rounded forms, warm approachable character, cheerful colour, light and inviting",
  luxury:
    "luxury logo, elegant and refined, gold or monochrome, thin sophisticated lines, premium fashion-house restraint",
  tech: "modern tech logo, clean geometric construction, gradient accent, precise, confident, forward-looking",
};

/** The spine every logo shares — the difference between a logo and an image. */
const LOGO_SPINE =
  "professional brand logo, vector style, flat design, centred, on a plain solid white background, " +
  "high contrast, crisp edges, scalable, simple, iconic, graphic design, no photorealism";

/** Pushes the model away from the things that ruin a logo. */
const LOGO_NEGATIVE =
  "photograph, photorealistic, 3d render, mockup, busy background, cluttered, gradient mesh, " +
  "drop shadow, bevel, watermark, signature, low quality, blurry, pixelated, jpeg artifacts, " +
  "misspelled text, gibberish text, extra letters, distorted typography, frame, border";

/** For wordmark logos, spelling matters — steer the letters toward the name. */
function nameClause(brandName: string, style: LogoStyle): string {
  const name = brandName.trim();
  if (!name) return "";
  return style === "wordmark"
    ? `the text reads exactly "${name}", spelled correctly`
    : `for a brand called "${name}"`;
}

export interface LogoPromptInput {
  brandName: string;
  style: LogoStyle;
  /** Optional free-text direction: industry, colours, vibe. */
  brief?: string;
}

export interface LogoPrompt {
  prompt: string;
  negativePrompt: string;
}

/** Build the fal prompt + negative prompt for one logo generation. */
export function buildLogoPrompt(input: LogoPromptInput): LogoPrompt {
  const parts = [
    STYLE_PROMPT[input.style],
    nameClause(input.brandName, input.style),
    input.brief?.trim() ? input.brief.trim() : "",
    LOGO_SPINE,
  ].filter(Boolean);

  return {
    prompt: parts.join(", "),
    negativePrompt: LOGO_NEGATIVE,
  };
}
