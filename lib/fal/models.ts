export const FAL_MODELS = {
  image_generation: "fal-ai/flux-pro/v1.1-ultra",
  image_variation: "fal-ai/flux-pro/kontext",
  upscale: "fal-ai/clarity-upscaler",
  video_10s: "fal-ai/kling-video/v2.1/pro/image-to-video",
  video_30s: "fal-ai/kling-video/v2.1/pro/image-to-video",
  video_60s: "fal-ai/kling-video/v2.1/pro/image-to-video",
  music_generation: "fal-ai/stable-audio",
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
];

export function getMusicModel(id: string | undefined | null): MusicModel {
  return (
    MUSIC_MODELS.find((m) => m.id === id) ??
    MUSIC_MODELS.find((m) => m.id === DEFAULT_MUSIC_MODEL)!
  );
}
