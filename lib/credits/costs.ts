export const CREDIT_COSTS = {
  image_generation: 12,
  // Variety pack: 6 anchors across 3 premium models (2 each) — pricier raw
  // inference than a single-model set, and a Pro upsell.
  image_variety: 20,
  image_variation: 3,
  upscale: 2,
  // Kling v3: 10s/15s are single calls; 30s is a real 2×15s render (drives the
  // higher cost — genuine 30s of footage is ~3× the inference of a 10s clip).
  video_10s: 25,
  video_15s: 40,
  video_30s: 100,
  talking_video: 130,
  virtual_tryon: 8,
  auto_caption: 5,
  hook_variants: 2,
  product_shot: 6,
  // ── Logo Studio (Recraft V4.1). All async via the fal webhook pipeline. ──
  logo_concepts: 5, // 6 × Recraft V4.1 text-to-vector @ $0.08 = $0.48 raw
  logo_refine: 1, // 1 × Recraft v3 image-to-image variation
  logo_finalize: 3, // 1 × Recraft V4.1 Pro text-to-vector @ $0.30 raw
  logo_vectorize: 1, // raster upload → SVG @ $0.01 raw
  logo_mockups: 2, // 4 × FLUX contextual mockups @ $0.03 = $0.12 (Phase 3)
  brand_package: 10, // export bundle + brand kit generation (Phase 3)
  music_generation: 8,
  script_generation: 1,
  layout_autofix: 3,
} as const satisfies Record<string, number>;

export type CreditCostKey = keyof typeof CREDIT_COSTS;
