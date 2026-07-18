import { z } from "zod";

/**
 * The logo brief — the questionnaire answers that drive concept generation.
 * Every field is skippable with a sensible default (spec: ≤90s to submit), so
 * the schema is permissive and the composer fills gaps.
 *
 * Stored as-is in logo_projects.brief (jsonb), and re-read on refine/finalize.
 */

export const LOGO_TYPES = ["wordmark", "icon", "combination", "emblem"] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

/**
 * Colour direction → an optional Recraft `colors` palette (RGB). "auto" passes
 * no palette and lets the model choose. Kept small and named; the composer
 * turns these into the API's {r,g,b} shape.
 */
export const COLOR_DIRECTIONS = [
  "auto",
  "monochrome",
  "bold",
  "earthy",
  "pastel",
  "vibrant",
] as const;
export type ColorDirection = (typeof COLOR_DIRECTIONS)[number];

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
