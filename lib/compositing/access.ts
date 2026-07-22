import type { Tier } from "@/lib/billing/entitlements";
import type { CompositeOp } from "@/lib/compositing/ops";

/**
 * Access rule for the Image Compositing module: Agency-only by default. The
 * one carve-out is `blend` (AI multi-image merge AND the mechanical Sharp
 * blends) — Business can unlock it by purchasing the Blend Package add-on
 * without a full Agency upgrade. Every other op (cutout, inpaint, relight,
 * depth) stays Agency-exclusive regardless of add-ons.
 */
export type CompositingCapability = CompositeOp | "mechanical_blend";

export interface CompositingAccessResult {
  allowed: boolean;
  /** Present only when `allowed` is false — surfaced to the client as the 403 reason. */
  reason?: string;
}

const BLEND_CAPABILITIES = new Set<CompositingCapability>([
  "blend",
  "mechanical_blend",
]);

export function canUseCompositing(
  tier: Tier,
  capability: CompositingCapability,
  hasBlendAddon: boolean,
): CompositingAccessResult {
  if (tier === "agency") return { allowed: true };

  if (BLEND_CAPABILITIES.has(capability)) {
    if (tier === "business" && hasBlendAddon) return { allowed: true };
    return {
      allowed: false,
      reason:
        tier === "business"
          ? "Blend requires the Blend Package add-on — or upgrade to Agency for the full compositing suite."
          : "Blend is a Business (with the Blend Package add-on) or Agency feature.",
    };
  }

  return {
    allowed: false,
    reason: "Image compositing is an Agency feature.",
  };
}
