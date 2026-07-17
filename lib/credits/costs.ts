export const CREDIT_COSTS = {
  image_generation: 12,
  image_variation: 3,
  upscale: 2,
  // Kling v3 Pro bills ~$0.095 per second of output, and caps at 15s per call.
  // 5s/10s/15s are single calls; 30s is a real 2×15s render, stitched.
  //
  // Priced at ~3x the inference cost, deliberately — NOT the 10x in CLAUDE.md
  // §1, which video cannot reach at these plan prices. 10x on a 10s clip is 188
  // credits, i.e. ONE video a month on Creator, or Creator at NZD 218. The 10x
  // model holds for actions where inference is ~free (script 25x, music 20x);
  // it collapses on the product we actually sell. These were 15/25/-/100, which
  // priced video at 1.3–1.8x and left an all-video Creator at 25% gross margin.
  video_5s: 28,
  video_10s: 56,
  // The flagship: the longest SINGLE Kling call, so no concat and no half-failed
  // stitch, and 7–15s is the viral Reels window (lib/composition/formats.ts).
  video_15s: 85,
  video_30s: 169,
  talking_video: 130,
  virtual_tryon: 8,
  auto_caption: 5,
  hook_variants: 2,
  product_shot: 6,
  music_generation: 8,
  script_generation: 1,
  layout_autofix: 3,
} as const satisfies Record<string, number>;

export type CreditCostKey = keyof typeof CREDIT_COSTS;
