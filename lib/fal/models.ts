export const FAL_MODELS = {
  image_generation: 'fal-ai/flux-pro/v1.1',
  image_variation:  'fal-ai/flux-pro/kontext',
  upscale:          'fal-ai/clarity-upscaler',
  video_10s:        'fal-ai/kling-video/v1.6/pro/image-to-video',
  video_30s:        'fal-ai/kling-video/v1.6/pro/image-to-video',
  video_60s:        'fal-ai/kling-video/v1.6/pro/image-to-video',
  music_generation: 'fal-ai/stable-audio',
} as const;

// fal.ai queue status/result endpoints use the root alias, not the versioned path.
// For Kling, submitting to /v1.6/pro/image-to-video but polling via /fal-ai/kling-video.
export const FAL_QUEUE_MODELS: Partial<Record<FalModelKey, string>> = {
  video_10s: 'fal-ai/kling-video',
  video_30s: 'fal-ai/kling-video',
  video_60s: 'fal-ai/kling-video',
};

export type FalModelKey = keyof typeof FAL_MODELS;
