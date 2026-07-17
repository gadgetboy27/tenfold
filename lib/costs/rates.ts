import { PLANS, PACKS } from "@/lib/billing/plans";

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
  music_generation: 0.02,
  // Anthropic — claude-sonnet-4-6 (~200 in + 100 out tokens typical)
  script_generation: 0.002,
} as const;

// NZD/USD exchange rate — update quarterly
export const NZD_USD_RATE = 0.61;

/**
 * How a credit was ACQUIRED, which is the only thing that determines what it
 * was worth. Mirrors subscriptions.tier, plus the free welcome grant.
 */
export type CreditSource = "grant" | "payg" | "creator" | "business" | "agency";

/**
 * What one credit actually sold for, in USD.
 *
 * This replaces a flat `CREDIT_VALUE_USD = 0.1`, which was not a price anyone
 * ever paid: subscribers pay ~$0.05/credit and top-up packs run $0.24–$0.37.
 * Valuing every credit at $0.10 reported roughly DOUBLE the true margin on the
 * subscription path — which is the path that matters — and hid the fact that
 * video sells at ~1.3x its inference cost, not the 10x the model assumes.
 *
 * Derived from PLANS/PACKS rather than hardcoded, so repricing a plan moves the
 * margin maths with it instead of silently invalidating it.
 */
export function creditValueUsd(source: CreditSource): number {
  // Welcome credits are free. A job run on them earns nothing — it is pure
  // COGS, and calling it revenue is how a free tier looks profitable.
  if (source === "grant") return 0;

  if (source === "payg") {
    // Bought as a top-up. Use the pack most people take (the one marked
    // popular) — the small pack's higher rate would flatter the numbers.
    const pack = PACKS.find((p) => p.popular) ?? PACKS[0];
    if (!pack) return 0;
    return (pack.priceNzd * NZD_USD_RATE) / pack.credits;
  }

  const plan = PLANS.find((p) => p.id === source);
  if (!plan || plan.creditsPerMonth <= 0) return 0;
  return (plan.priceNzd * NZD_USD_RATE) / plan.creditsPerMonth;
}
