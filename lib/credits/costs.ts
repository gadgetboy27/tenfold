export const CREDIT_COSTS = {
  image_generation: 12,
  image_variation: 3,
  upscale: 2,
  // Kling v3: 5s/10s are single calls; 30s is a real 2×15s render (drives the
  // higher cost — genuine 30s of footage is ~3× the inference of a 10s clip).
  video_5s: 15,
  video_10s: 25,
  video_30s: 100,
  talking_video: 130,
  virtual_tryon: 8,
  auto_caption: 5,
  hook_variants: 2,
  product_shot: 6,
  // 4 logo candidates via FLUX Pro (~$0.05 each). Reuses the image pipeline.
  logo_generation: 10,
  music_generation: 8,
  script_generation: 1,
  layout_autofix: 3,
} as const satisfies Record<string, number>;

export type CreditCostKey = keyof typeof CREDIT_COSTS;
