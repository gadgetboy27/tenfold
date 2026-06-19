// Actual provider costs in USD per job type.
// Update these whenever fal.ai or Anthropic change their pricing.
// Source: https://fal.ai/pricing  https://www.anthropic.com/pricing

export const PROVIDER_COST_USD: Record<string, number> = {
  // fal.ai — FLUX Pro v1.1 @ $0.05/image × 6 images
  image_generation: 0.30,
  // fal.ai — FLUX Kontext (single variation)
  image_variation: 0.04,
  // fal.ai — Clarity Upscaler
  upscale: 0.012,
  // fal.ai — Kling v1.6 Pro (charged per second of output)
  video_10s: 0.30,
  video_30s: 0.90,
  video_60s: 1.80,
  // Talking video pipeline: ElevenLabs TTS (~$0.05) + VEED Fabric lip-sync
  // (~$1.20 for ~15s @ 480p) + Claude script (~$0.002). Tune with resolution/length.
  talking_video: 1.25,
  // fal.ai — Stable Audio
  music_generation: 0.02,
  // Anthropic — claude-sonnet-4-6 (~200 in + 100 out tokens typical)
  script_generation: 0.002,
} as const;

// Credit pack value in USD (used for margin calculations)
// 1 credit ≈ NZD 0.17 ≈ USD 0.10 at 1.65 exchange rate
export const CREDIT_VALUE_USD = 0.10;

// NZD/USD exchange rate — update quarterly
export const NZD_USD_RATE = 0.61;
