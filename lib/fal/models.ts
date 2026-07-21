// Single source for the current default video endpoint — the VIDEO_MODELS
// registry below owns model identity; FAL_MODELS keeps the duration-tier keys
// (video_10s/15s/30s) pointing at it so enqueueJob() keeps resolving by tier.
const DEFAULT_VIDEO_ENDPOINT = "fal-ai/kling-video/v3/pro/image-to-video";

export const FAL_MODELS = {
  image_generation: "fal-ai/flux-pro/v1.1-ultra",
  image_variation: "fal-ai/flux-pro/kontext",
  upscale: "fal-ai/clarity-upscaler",
  // Pro effect — BiRefNet v2: image_url → transparent-PNG cutout (verified live
  // Jul 2026). Output is a single `image` object, coalesced in the fal webhook.
  bg_remove: "fal-ai/birefnet/v2",
  // Kling v3 Pro (image-to-video): 3–15s per call. 10s/15s are single calls;
  // video_30s renders as 2× 15s segments concatenated (see webhooks/fal + jobs).
  // Input schema + field names come from VIDEO_MODELS / videoInputFor — NOT
  // hand-built (it's start_image_url, duration as a STRING, generate_audio off).
  video_10s: DEFAULT_VIDEO_ENDPOINT,
  video_15s: DEFAULT_VIDEO_ENDPOINT,
  video_30s: DEFAULT_VIDEO_ENDPOINT,
  music_generation: "fal-ai/stable-audio",
  // ── Logo Studio (Recraft V4.1). Endpoint IDs verified live against fal.ai.
  // CONCEPTS + REFINE are the fast RASTER path (text-to-image, $0.035, verified
  // Jul 2026): the browse/pick phase doesn't need true SVG, and raster generates
  // far quicker than text-to-vector — so 6 previews land fast. The winner is
  // rendered as a real SVG at FINALIZE (Pro text-to-vector), which re-generates
  // from the CHOSEN concept's prompt so the deliverable matches what was picked.
  logo_concepts: "fal-ai/recraft/v4.1/text-to-image", // fast raster previews
  logo_refine: "fal-ai/recraft/v4.1/text-to-image", // "more like this" (raster)
  logo_finalize: "fal-ai/recraft/v4.1/pro/text-to-vector", // premium SVG (the deliverable)
  logo_vectorize: "fal-ai/recraft/vectorize", // raster upload → single SVG `image`
  // Recraft V3 text-to-image — the ONE Recraft family exposing the named `style`
  // enum (vector_illustration/line_art, bold_stroke, engraving…). Engaged only
  // when the user picks a Style; vector_illustration styles return SVG, so it
  // serves BOTH styled concepts and the styled finalize. Verified live Jul 2026.
  logo_styled: "fal-ai/recraft/v3/text-to-image",
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
 * Video models (image-to-video). Kling v3 Pro is the default — cinematic motion,
 * 3–15s per call. Endpoints + schemas verified LIVE (Jul 2026). CRITICAL: each
 * model's input fields differ, so build inputs via videoInputFor() — never by
 * hand. Kling wants `start_image_url` (NOT image_url), `duration` as a STRING
 * ("3"–"15"), and `generate_audio` defaults true (we compose our own music, so
 * we turn it OFF — ~35% faster + cheaper: $0.112 vs $0.168 per second). Refresh
 * on the monthly model review; add a model here + a videoInputFor branch to wire.
 */
export interface VideoModel {
  id: string;
  label: string;
  endpoint: string;
  blurb: string;
  /** Longest clip this model renders per call (seconds). */
  maxDurationSec: number;
  /** Whether it's wired into generation today (vs. registered for review only). */
  wired: boolean;
}

export const DEFAULT_VIDEO_MODEL = "kling-v3-pro";

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: "kling-v3-pro",
    label: "Kling v3 Pro",
    endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
    blurb: "Cinematic motion, sharp detail. Our default (3–15s/call).",
    maxDurationSec: 15,
    wired: true,
  },
  {
    id: "veo-3.1-fast",
    label: "Veo 3.1 Fast",
    endpoint: "fal-ai/veo3.1/fast/image-to-video",
    blurb: "Faster renders, strong realism — ~8s clips, different schema.",
    maxDurationSec: 8,
    wired: false,
  },
];

export function getVideoModel(id: string | undefined | null): VideoModel {
  return (
    VIDEO_MODELS.find((m) => m.id === id) ??
    VIDEO_MODELS.find((m) => m.id === DEFAULT_VIDEO_MODEL)!
  );
}

export interface VideoInputOpts {
  imageUrl: string;
  prompt: string;
  durationSec: number;
  negativePrompt?: string;
  /** Native audio off by default — the app composes its own music track. */
  generateAudio?: boolean;
}

/** Build a video model's fal input, mapping common fields onto its own schema. */
export function videoInputFor(
  model: VideoModel,
  opts: VideoInputOpts,
): Record<string, unknown> {
  const seconds = Math.min(opts.durationSec, model.maxDurationSec);
  const generateAudio = opts.generateAudio ?? false;
  if (model.id.startsWith("veo")) {
    // Veo: image_url + duration with a trailing "s" (verified live).
    return {
      image_url: opts.imageUrl,
      prompt: opts.prompt,
      duration: `${seconds}s`,
      generate_audio: generateAudio,
    };
  }
  // Kling v3 family (verified live): start_image_url + string duration.
  return {
    start_image_url: opts.imageUrl,
    prompt: opts.prompt,
    duration: String(seconds),
    negative_prompt: opts.negativePrompt ?? "blur, distort, and low quality",
    generate_audio: generateAudio,
  };
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
