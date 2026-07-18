// Actual provider costs in USD per job type.
// Update these whenever fal.ai or Anthropic change their pricing.
// Source: https://fal.ai/pricing  https://www.anthropic.com/pricing

export const PROVIDER_COST_USD: Record<string, number> = {
  // fal.ai — FLUX Pro v1.1 @ $0.05/image × 6 images
  image_generation: 0.3,
  // fal.ai — FLUX Kontext (single variation)
  image_variation: 0.04,
  // fal.ai — Clarity Upscaler
  upscale: 0.012,
  // fal.ai — Kling v3 Pro (charged per second of output, ~$0.095/s). 30s renders
  // as 2× 15s segments, so ~2× the 15s cost. Tune against live fal pricing.
  video_5s: 0.48,
  video_10s: 0.95,
  video_30s: 2.85,
  // Talking video pipeline: ElevenLabs TTS (~$0.05) + VEED Fabric lip-sync
  // (~$1.20 for ~15s @ 480p) + Claude script (~$0.002). Tune with resolution/length.
  talking_video: 1.25,
  // fal.ai — FASHN Virtual Try-On v1.6 ($0.075/generation)
  virtual_tryon: 0.075,
  // fal.ai — auto-caption (video→video; ~estimate, tune when billed)
  auto_caption: 0.05,
  // Anthropic — claude-sonnet-4-6, one call for N hook variants
  hook_variants: 0.005,
  // fal.ai — Bria Product Shot (~estimate, tune when billed)
  product_shot: 0.06,
  // fal.ai — Stable Audio
  // Logo Studio raw provider costs (fal Recraft).
  logo_concepts: 0.48, // 6 × V4.1 text-to-vector @ $0.08
  logo_refine: 0.08, // v3 image-to-image
  logo_finalize: 0.3, // V4.1 Pro text-to-vector
  logo_vectorize: 0.01, // vectorize
  logo_mockups: 0.12, // 4 × FLUX
  brand_package: 0.05, // Claude copy for guidelines/fonts
  music_generation: 0.02,
  // Anthropic — claude-sonnet-4-6 (~200 in + 100 out tokens typical)
  script_generation: 0.002,
} as const;

// Credit pack value in USD (used for margin calculations)
// 1 credit ≈ NZD 0.17 ≈ USD 0.10 at 1.65 exchange rate
export const CREDIT_VALUE_USD = 0.1;

// NZD/USD exchange rate — update quarterly
export const NZD_USD_RATE = 0.61;
