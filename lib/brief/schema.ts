import { z } from "zod";

/**
 * The guided-brief contract (slice 1 of the one-prompt work).
 *
 * The job: take whatever a user typed — which is usually one short line — and
 * work out what's missing before anything is generated, what would genuinely
 * improve the result, and which of their own assets the platform should ask
 * for. Better briefs produce better generations even with nothing downstream
 * automated, which is why this ships first.
 *
 * Design rule that matters more than any other here: **nothing this returns is
 * a gate.** The product's current strength is that a bare sentence works. If
 * the assessment turns into a form the user must complete before generating,
 * we've made the product worse than the thing it replaced. Every ask is
 * skippable and framed as an improvement, never a requirement.
 */

/** Asset kinds the app can already accept, so an ask is always actionable. */
export const ASSET_KINDS = [
  "product_photo",
  "logo",
  "brand_colours",
  "presenter_photo",
  "garment_photo",
  "reference_design",
  "website_url",
  "slogan",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Where the user can satisfy an ask — all of these surfaces already exist. */
export const ASSET_SOURCES = [
  "upload",
  "gallery",
  "brand_kit",
  "text",
] as const;

export const assetAskSchema = z.object({
  kind: z.enum(ASSET_KINDS),
  /** Shown to the user, in their language, not ours. */
  label: z.string().min(1).max(80),
  /** WHY it helps — an ask without a reason reads as bureaucracy. */
  reason: z.string().min(1).max(200),
  /** Never "required" in the blocking sense; this only orders the list. */
  importance: z.enum(["high", "medium", "low"]),
  sources: z.array(z.enum(ASSET_SOURCES)).min(1),
});
export type AssetAsk = z.infer<typeof assetAskSchema>;

export const briefGapSchema = z.object({
  /** What the prompt doesn't say, e.g. "who it's for". */
  missing: z.string().min(1).max(80),
  /** A question phrased so the user can answer in a few words. */
  question: z.string().min(1).max(160),
  /** A concrete example answer — far more useful than the question alone. */
  example: z.string().min(1).max(160),
});
export type BriefGap = z.infer<typeof briefGapSchema>;

export const briefAssessmentSchema = z.object({
  /**
   * 0-100. Deliberately coarse: this drives a "good enough to generate?" hint,
   * not a score anyone should optimise. Anything >= 60 generates well.
   */
  completeness: z.number().int().min(0).max(100),
  /** One-line read of what they appear to want. Confirms we understood. */
  understanding: z.string().min(1).max(240),
  /** Ordered most-useful-first, capped so the UI never becomes a form. */
  gaps: z.array(briefGapSchema).max(4),
  assetAsks: z.array(assetAskSchema).max(4),
  /**
   * The prompt rewritten with everything we *can* infer already folded in —
   * usable immediately, with no further input from the user.
   */
  improvedPrompt: z.string().min(1).max(600),
});
export type BriefAssessment = z.infer<typeof briefAssessmentSchema>;

export const briefRequestSchema = z.object({
  prompt: z.string().min(1).max(2000),
  /** Lets the model skip asks the workspace can already satisfy. */
  hasBrandKit: z.boolean().optional(),
  hasLogo: z.boolean().optional(),
  hasGalleryImages: z.boolean().optional(),
});
export type BriefRequest = z.infer<typeof briefRequestSchema>;
