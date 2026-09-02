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
  /**
   * One outside-eye review of a finished video (lib/claude/ad-watcher.ts).
   *
   * Costlier than layout_autofix (3) because it is six vision frames plus
   * adaptive thinking on Opus 5, not one still on a cheaper model — roughly
   * $0.05-0.10 of raw inference. Priced at 6 to land in the same ~3x band as
   * the other Claude actions rather than the ~20x the near-free text ones
   * carry; see PRODUCT_STRATEGY.md §4.4 on why the markup is banded, not flat.
   *
   * Charged, unlike suggestWordTreatments which is deliberately free: that one
   * is cheap exploration we want to encourage, this one runs a frontier model
   * over images and produces a change that gets applied to the ad.
   */
  ad_watch: 6,
  /**
   * One post to ONE network through the paid broker (lib/social/broker).
   *
   * Publishing to a network we reach ourselves is FREE and must stay free —
   * a direct post costs us nothing marginal, and charging for it would tax the
   * path that is better for the customer AND cheaper for us. This charge
   * exists only where a third party bills us per post.
   *
   * Benchmarked against the cheapest existing band rather than invented:
   * script_generation is 1 credit at $0.002 raw, and a brokered post is
   * ~$0.007 — about 3.5×, rounded to 2 so a multi-network publish stays
   * legible to the person paying for it.
   *
   * It should trend to zero. Every network that clears its own platform review
   * moves to lib/social/direct/* and stops being charged at all.
   */
  brokered_publish: 2,
  // "Brand Brain" (PRODUCT_STRATEGY.md §3/§4.6, 2026-07-26): one Claude call
  // analyzing a pasted URL into a campaign brief + brand palette/font
  // suggestion. Available to every tier — the flat charge is the gate, not a
  // tier lock (see app/api/campaigns/analyze-url/route.ts).
  brand_import: 8,
  // ── Image Compositing (lib/compositing/). All async via the fal webhook
  // pipeline except the Sharp-only mechanical blends (0 credits, no fal call).
  composite_cutout: 1, // fal-ai/birefnet/v2 (~$0.02 raw) — reuses bg_remove's engine
  composite_inpaint: 3, // fal-ai/flux-pro/v1/fill (~$0.05 raw)
  composite_relight: 2, // fal-ai/iclight-v2 (~$0.04 raw)
  composite_blend: 3, // fal-ai/flux-pro/kontext/max/multi (~$0.06 raw)
  composite_depth: 1, // fal-ai/image-preprocessors/depth-anything/v2 (~$0.01 raw)
} as const satisfies Record<string, number>;

export type CreditCostKey = keyof typeof CREDIT_COSTS;
