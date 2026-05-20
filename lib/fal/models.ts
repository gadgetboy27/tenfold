export const FAL_MODELS = {
  image_generation: 'fal-ai/flux-pro/v1.1-ultra',
  image_variation:  'fal-ai/flux-pro/kontext',
  upscale:          'fal-ai/clarity-upscaler',
  video_10s:        'fal-ai/kling-video/v2.1/pro/image-to-video',
  video_30s:        'fal-ai/kling-video/v2.1/pro/image-to-video',
  video_60s:        'fal-ai/kling-video/v2.1/pro/image-to-video',
  music_generation: 'fal-ai/stable-audio',
} as const;

// v2.1 uses the same path for queue status/result as submission — no alias needed
export const FAL_QUEUE_MODELS: Partial<Record<FalModelKey, string>> = {};

export type FalModelKey = keyof typeof FAL_MODELS;
