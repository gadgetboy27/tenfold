export const CREDIT_COSTS = {
  image_generation: 12,
  // Variety pack: 6 anchors across 3 premium models (2 each) — pricier raw
  // inference than a single-model set, and a Pro upsell.
  image_variety: 20,
  image_variation: 3,
  upscale: 2,
  bg_remove: 3, // Pro effect — BiRefNet cutout (~$0.02 raw)
  // Kling v3: 10s/15s are single calls; 30s is a real 2×15s render (drives the
  // higher cost — genuine 30s of footage is ~3× the inference of a 10s clip).
  // Repriced 2026-07-25 (PRODUCT_STRATEGY.md §4 pricing rework, Band 4): was
  // only 1.2–1.6× lib/costs/rates.ts raw cost — thin for the highest-volume,
  // most compute-heavy category. Retargeted to ~3.0×.
  video_10s: 62,
  video_15s: 94,
  video_30s: 187,
  talking_video: 130,
  virtual_tryon: 8,
  auto_caption: 5,
  hook_variants: 2,
  product_shot: 6,
  // ── Logo Studio (Recraft V4.1). All async via the fal webhook pipeline. ──
  // logo_concepts/refine/finalize/mockups repriced 2026-07-25 (PRODUCT_STRATEGY.md
  // §4 pricing rework, Band 1): were selling below lib/costs/rates.ts raw cost
  // (0.46x–0.77x) on Business-tier subscription credits — retargeted to ~3.0×.
  logo_concepts: 32, // 6 × Recraft V4.1 text-to-vector @ $0.08 = $0.48 raw
  logo_refine: 5, // 1 × Recraft v3 image-to-image variation, ~$0.08 raw
  logo_finalize: 20, // 1 × Recraft V4.1 Pro text-to-vector @ $0.30 raw
  logo_vectorize: 1, // raster upload → SVG @ $0.01 raw
  logo_mockups: 8, // 4 × FLUX contextual mockups @ $0.03 = $0.12 (Phase 3)
  brand_package: 10, // export bundle + brand kit generation (Phase 3)
  music_generation: 8,
  script_generation: 1,
  layout_autofix: 3,
  // ── Image Compositing (lib/compositing/). All async via the fal webhook
  // pipeline except the Sharp-only mechanical blends (0 credits, no fal call).
  composite_cutout: 1, // fal-ai/birefnet/v2 (~$0.02 raw) — reuses bg_remove's engine
  composite_inpaint: 3, // fal-ai/flux-pro/v1/fill (~$0.05 raw)
  composite_relight: 2, // fal-ai/iclight-v2 (~$0.04 raw)
  composite_blend: 3, // fal-ai/flux-pro/kontext/max/multi (~$0.06 raw)
  composite_depth: 1, // fal-ai/image-preprocessors/depth-anything/v2 (~$0.01 raw)
} as const satisfies Record<string, number>;

export type CreditCostKey = keyof typeof CREDIT_COSTS;
