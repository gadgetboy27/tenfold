export const CREDIT_COSTS = {
  image_generation: 12,
  image_variation: 3,
  upscale: 2,
  video_10s: 15,
  video_30s: 40,
  video_60s: 80,
  talking_video: 130,
  music_generation: 8,
  script_generation: 1,
} as const satisfies Record<string, number>;

export type CreditCostKey = keyof typeof CREDIT_COSTS;
