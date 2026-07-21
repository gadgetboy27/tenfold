import { z } from "zod";

/**
 * The logo brief — the questionnaire answers that drive concept generation.
 * Every field is skippable with a sensible default (spec: ≤90s to submit), so
 * the schema is permissive and the composer fills gaps.
 *
 * Stored as-is in logo_projects.brief (jsonb), and re-read on refine/finalize.
 */

export const LOGO_TYPES = [
  "wordmark",
  "icon",
  "combination",
  "emblem",
] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

/**
 * Colour direction → an optional Recraft `colors` palette (RGB). "auto" passes
 * no palette and lets the model choose. Kept small and named; the composer
 * turns these into the API's {r,g,b} shape.
 */
export const COLOR_DIRECTIONS = [
  "auto",
  "brand", // pull the workspace brand-kit palette (resolved server-side)
  "monochrome",
  "bold",
  "earthy",
  "pastel",
  "vibrant",
] as const;
export type ColorDirection = (typeof COLOR_DIRECTIONS)[number];

/**
 * Named aesthetic styles → Recraft V3's `style` enum (the vector_illustration
 * family — the design/logo-grade one). "auto" engages the default V4.1 path (no
 * style param); any other engages V3 text-to-image, which honours the style AND
 * returns SVG. `phrase` is folded into the prompt so the look reads even on the
 * fallback path. Verified live against Recraft V3's style enum (Jul 2026).
 */
export const LOGO_STYLES = [
  { id: "auto", label: "Auto", recraft: null, phrase: "" },
  {
    id: "line_art",
    label: "Line art",
    recraft: "vector_illustration/line_art",
    phrase: "clean single-weight line art, minimal strokes",
  },
  {
    id: "bold_stroke",
    label: "Bold stroke",
    recraft: "vector_illustration/bold_stroke",
    phrase: "thick confident strokes, high-impact",
  },
  {
    id: "flat",
    label: "Flat",
    recraft: "vector_illustration/roundish_flat",
    phrase: "soft rounded flat shapes, friendly",
  },
  {
    id: "engraving",
    label: "Engraving",
    recraft: "vector_illustration/engraving",
    phrase: "fine engraved detail, premium heritage feel",
  },
  {
    id: "linocut",
    label: "Linocut",
    recraft: "vector_illustration/linocut",
    phrase: "hand-carved linocut texture, organic",
  },
  {
    id: "editorial",
    label: "Editorial",
    recraft: "vector_illustration/editorial",
    phrase: "editorial illustration, sophisticated",
  },
  {
    id: "marker",
    label: "Marker",
    recraft: "vector_illustration/marker_outline",
    phrase: "hand-drawn marker outline, casual",
  },
] as const;
export type LogoStyleId = (typeof LOGO_STYLES)[number]["id"];

/** Look up a style by id (defaults to "auto"). */
export function getLogoStyle(id: string | undefined | null) {
  return LOGO_STYLES.find((s) => s.id === id) ?? LOGO_STYLES[0];
}

/**
 * Four personality axes, 0–100. 0 is the first word, 100 the second. Defaults
 * to the midpoint so an untouched slider reads as "no strong preference".
 */
export const PERSONALITY_AXES = [
  "classicModern", // 0 classic ↔ 100 modern
  "playfulSerious", // 0 playful ↔ 100 serious
  "minimalDetailed", // 0 minimal ↔ 100 detailed
  "warmCool", // 0 warm ↔ 100 cool
] as const;
export type PersonalityAxis = (typeof PERSONALITY_AXES)[number];

export const logoBriefSchema = z.object({
  businessName: z.string().trim().min(1).max(60),
  industry: z.string().trim().max(60).optional().default(""),
  logoType: z.enum(LOGO_TYPES).default("combination"),
  style: z
    .enum(LOGO_STYLES.map((s) => s.id) as [LogoStyleId, ...LogoStyleId[]])
    .default("auto"),
  colorDirection: z.enum(COLOR_DIRECTIONS).default("auto"),
  personality: z
    .object({
      classicModern: z.number().min(0).max(100).default(50),
      playfulSerious: z.number().min(0).max(100).default(50),
      minimalDetailed: z.number().min(0).max(100).default(50),
      warmCool: z.number().min(0).max(100).default(50),
    })
    .default({
      classicModern: 50,
      playfulSerious: 50,
      minimalDetailed: 50,
      warmCool: 50,
    }),
  /** Optional free-text: extra direction (colours, symbols to include/avoid). */
  notes: z.string().trim().max(300).optional().default(""),
});

export type LogoBrief = z.infer<typeof logoBriefSchema>;
