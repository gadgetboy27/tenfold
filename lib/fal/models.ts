export const FAL_MODELS = {
  image_generation: "fal-ai/flux-pro/v1.1-ultra",
  image_variation: "fal-ai/flux-pro/kontext",
  upscale: "fal-ai/clarity-upscaler",
  // Kling v3 Pro (image-to-video): 3–15s per call, native audio, sharper motion.
  // video_30s renders as 2× 15s segments concatenated (see webhooks/fal + jobs).
  video_5s: "fal-ai/kling-video/v3/pro/image-to-video",
  video_10s: "fal-ai/kling-video/v3/pro/image-to-video",
  video_30s: "fal-ai/kling-video/v3/pro/image-to-video",
  music_generation: "fal-ai/stable-audio",
  // ── Logo Studio (Recraft V4.1). Endpoint IDs verified against fal.ai/models
  // at build time (the spec's v4/text-to-image was wrong — text-to-VECTOR is the
  // one returning true SVG, and its $0.08 price matches the spec's cost table).
  logo_concepts: "fal-ai/recraft/v4.1/text-to-vector", // SVG; no style/num_images
  // Refine is text-to-vector too, NOT image-to-image: image-to-image rejects an
  // SVG anchor with 422 (verified live), and its output is raster — off-model
  // for an all-SVG deliverable. "More like this" regenerates a vector from the
  // brief plus the user's adjustment, keeping the result a true SVG.
  logo_refine: "fal-ai/recraft/v4.1/text-to-vector",
  logo_finalize: "fal-ai/recraft/v4.1/pro/text-to-vector", // premium SVG
  logo_vectorize: "fal-ai/recraft/vectorize", // raster upload → single SVG `image`
} as const;

// v2.1 uses the same path for queue status/result as submission — no alias needed
export const FAL_QUEUE_MODELS: Partial<Record<FalModelKey, string>> = {};

export type FalModelKey = keyof typeof FAL_MODELS;

/**
 * Curated image-generation models the user can pick for the anchor set. fal.ai
 * is the single gateway — every one of these is a fal endpoint, so adding model
 * choice costs us one registry entry (no extra keys, billing, or webhooks).
 *
 * - `creditCost` is the per-campaign cost of choosing this model (10× markup on
 *   inference). Premium models cost more.
 * - `proOnly` gates a model to paid tiers (a Business/Agency upsell).
 * - FLUX Pro is the default and the universal fallback target — known-reliable.
 */
export interface ImageModel {
  id: string;
  label: string;
  endpoint: string;
  creditCost: number;
  proOnly: boolean;
  blurb: string;
}

export const DEFAULT_IMAGE_MODEL = "flux-pro";

export const IMAGE_MODELS: ImageModel[] = [
  // Customer-facing names are Tenfold-styled; the `endpoint` is the real engine.
  {
    id: "flux-pro",
    label: "Sharp",
    endpoint: "fal-ai/flux-pro/v1.1-ultra",
    creditCost: 12,
    proOnly: false,
    blurb: "Crisp, true-to-life photography. The reliable default.",
  },
  {
    id: "nano-banana",
    label: "Fusion",
    endpoint: "fal-ai/nano-banana",
    creditCost: 12,
    proOnly: false,
    blurb: "Great at composites, product shots & in-image text.",
  },
  {
    id: "ideogram",
    label: "Typeset",
    endpoint: "fal-ai/ideogram/v3",
    creditCost: 14,
    proOnly: true,
    blurb: "Best-in-class typography and in-image text. Pro.",
  },
  {
    id: "recraft",
    label: "Studio",
    endpoint: "fal-ai/recraft-v3",
    creditCost: 16,
    proOnly: true,
    blurb: "Vector, brand & design-grade output. Pro.",
  },
];

export function getImageModel(id: string | undefined | null): ImageModel {
  return (
    IMAGE_MODELS.find((m) => m.id === id) ??
    IMAGE_MODELS.find((m) => m.id === DEFAULT_IMAGE_MODEL)!
  );
}

/**
 * "Variety pack": the current top image models, so an anchor set can span three
 * models (2 images each) instead of one. Endpoints + params verified LIVE
 * (Jul 2026) — each takes a different size param, so imageInputFor() maps the
 * campaign's FLUX-style image_size onto each model's own knob. Refresh this
 * list on the monthly model review.
 */
export interface VarietyModel {
  id: string;
  label: string;
  endpoint: string;
  /** Which aspect knob this model uses (verified live). */
  sizeParam: "image_size" | "aspect_ratio";
}

export const VARIETY_IMAGE_MODELS: VarietyModel[] = [
  {
    id: "flux-2-pro",
    label: "FLUX.2 Pro",
    endpoint: "fal-ai/flux-2-pro",
    sizeParam: "image_size",
  },
  {
    id: "nano-banana-2",
    label: "Nano Banana 2",
    endpoint: "fal-ai/nano-banana-2",
    sizeParam: "aspect_ratio",
  },
  {
    id: "seedream-4.5",
    label: "Seedream 4.5",
    endpoint: "fal-ai/bytedance/seedream/v4.5/text-to-image",
    sizeParam: "image_size",
  },
];

/** FLUX image_size value → the aspect_ratio string models like Nano Banana use. */
const IMAGE_SIZE_TO_ASPECT: Record<string, string> = {
  square_hd: "1:1",
  square: "1:1",
  portrait_16_9: "9:16",
  portrait_4_3: "3:4",
  landscape_16_9: "16:9",
  landscape_4_3: "4:3",
};

/** Build a model's fal input from the shared prompt + campaign image_size. */
export function imageInputFor(
  model: VarietyModel,
  prompt: string,
  imageSize: string,
): Record<string, unknown> {
  if (model.sizeParam === "aspect_ratio") {
    return {
      prompt,
      aspect_ratio: IMAGE_SIZE_TO_ASPECT[imageSize] ?? "1:1",
      num_images: 1,
    };
  }
  return { prompt, image_size: imageSize, num_images: 1 };
}

/**
 * Ordered fallback endpoints for image generation, used when the chosen model
 * fails to submit (fal queue error / bad call). Try the chosen model first,
 * then progressively more reliable ones, always ending at FLUX Pro.
 */
export function imageFallbackEndpoints(chosenId: string): string[] {
  const chosen = getImageModel(chosenId);
  const reliable = ["nano-banana", "flux-pro"]
    .map((id) => getImageModel(id).endpoint)
    .filter((ep) => ep !== chosen.endpoint);
  return [...new Set([chosen.endpoint, ...reliable])];
}

/**
 * Music models. Stable Audio is the default (fast, length-controllable). Lyria 2
 * is offered as a richer, more natural instrumental option. If the chosen model
 * fails at submit, the job route falls back to Stable Audio.
 */
export interface MusicModel {
  id: string;
  label: string;
  endpoint: string;
  blurb: string;
  /** Sings lyrics (ACE-Step) rather than instrumental — takes a different input
   *  schema (tags + lyrics), handled in the jobs route. */
  vocals?: boolean;
}

export const DEFAULT_MUSIC_MODEL = "stable-audio";

export const MUSIC_MODELS: MusicModel[] = [
  {
    id: "stable-audio",
    label: "Balanced",
    endpoint: "fal-ai/stable-audio",
    blurb: "Fast and flexible — matched to your video length.",
  },
  {
    id: "lyria2",
    label: "Natural",
    endpoint: "fal-ai/lyria2",
    blurb: "Richer, more natural instrumental sound.",
  },
  {
    // ACE-Step: text-to-song with real vocals. Input is `tags` (genre) + `lyrics`
    // ([inst] = instrumental). Verified schema Jul 2026 — output is `audio.url`,
    // normalized to audio_file in the fal webhook.
    id: "ace-step",
    label: "Vocals",
    endpoint: "fal-ai/ace-step",
    blurb: "Sings a jingle — real vocals from your lyrics (or auto-written).",
    vocals: true,
  },
];

export function getMusicModel(id: string | undefined | null): MusicModel {
  return (
    MUSIC_MODELS.find((m) => m.id === id) ??
    MUSIC_MODELS.find((m) => m.id === DEFAULT_MUSIC_MODEL)!
  );
}
