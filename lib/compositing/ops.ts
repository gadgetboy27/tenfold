/**
 * Image Compositing — AI op registry. Every endpoint + input schema below was
 * verified LIVE against fal.ai/models before wiring (Jul 2026) — never hand-
 * build these inputs elsewhere; add a case here instead (same discipline as
 * lib/fal/models.ts videoInputFor).
 *
 * job type string (composite_<op>) is the single key shared by:
 *   - lib/fal/models.ts FAL_MODELS   (which endpoint it calls)
 *   - lib/credits/costs.ts CREDIT_COSTS (what it costs)
 *   - creative_jobs.type              (what the webhook is handling)
 */

export type CompositeOp = "cutout" | "inpaint" | "relight" | "blend" | "depth";

export const COMPOSITE_JOB_TYPE: Record<CompositeOp, string> = {
  cutout: "composite_cutout",
  inpaint: "composite_inpaint",
  relight: "composite_relight",
  blend: "composite_blend",
  depth: "composite_depth",
};

export interface CutoutParams {
  imageUrl: string;
}

export interface InpaintParams {
  imageUrl: string;
  maskUrl: string;
  prompt: string;
}

export type RelightDirection = "None" | "Left" | "Right" | "Top" | "Bottom";

export interface RelightParams {
  imageUrl: string;
  prompt: string;
  /** Which side the light appears to come from — fal's `initial_latent`. */
  direction?: RelightDirection;
}

export interface BlendParams {
  /** 2–5 reference images, per fal-ai/flux-pro/kontext/max/multi's contract. */
  imageUrls: string[];
  prompt: string;
}

export interface DepthParams {
  imageUrl: string;
}

export type CompositeParams =
  | { op: "cutout"; params: CutoutParams }
  | { op: "inpaint"; params: InpaintParams }
  | { op: "relight"; params: RelightParams }
  | { op: "blend"; params: BlendParams }
  | { op: "depth"; params: DepthParams };

/**
 * Build the exact fal input for a composite op. Each branch mirrors the
 * verified schema for its endpoint (see lib/fal/models.ts composite_* comments)
 * — do not add fields here without verifying them live first.
 */
export function buildCompositeInput(
  args: CompositeParams,
): Record<string, unknown> {
  switch (args.op) {
    case "cutout":
      // Same fal-ai/birefnet/v2 call already verified working via bg_remove.
      return {
        image_url: args.params.imageUrl,
        output_format: "png",
        refine_foreground: true,
      };
    case "inpaint":
      // fal-ai/flux-pro/v1/fill: prompt*, image_url*, mask_url* (verified live).
      return {
        prompt: args.params.prompt,
        image_url: args.params.imageUrl,
        mask_url: args.params.maskUrl,
        output_format: "png",
      };
    case "relight":
      // fal-ai/iclight-v2: prompt*, image_url* (verified live).
      return {
        prompt: args.params.prompt,
        image_url: args.params.imageUrl,
        ...(args.params.direction
          ? { initial_latent: args.params.direction }
          : {}),
        output_format: "png",
      };
    case "blend":
      // fal-ai/flux-pro/kontext/max/multi: prompt*, image_urls* (verified
      // live) — only these two fields are confirmed; don't add optional knobs
      // without verifying them against this exact endpoint first.
      return {
        prompt: args.params.prompt,
        image_urls: args.params.imageUrls,
      };
    case "depth":
      // fal-ai/image-preprocessors/depth-anything/v2: image_url* only (verified live).
      return { image_url: args.params.imageUrl };
  }
}

/** 2–5 images required by fal-ai/flux-pro/kontext/max/multi's contract. */
export function isValidBlendCount(n: number): boolean {
  return n >= 2 && n <= 5;
}
