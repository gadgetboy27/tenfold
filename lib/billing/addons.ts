import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Purchasable per-workspace add-ons — separate from the tier subscription
 * (a workspace can hold its main tier subscription AND one or more add-ons
 * simultaneously, each its own Stripe subscription). Today there's one:
 * Business-tier Blend Package, which unlocks the `blend` compositing op
 * without requiring a full Agency upgrade.
 */
export type AddonKey = "blend_package";

export interface AddonPlan {
  key: AddonKey;
  name: string;
  priceNzd: number;
  priceId: string | null;
  /** One-line pitch shown next to the Business plan. */
  blurb: string;
}

export const ADDONS: AddonPlan[] = [
  {
    key: "blend_package",
    name: "Blend Package",
    priceNzd: 19,
    priceId: process.env.STRIPE_PRICE_BLEND_ADDON ?? null,
    blurb: "Unlock multi-image AI blending on the Business plan.",
  },
];

export function getAddonPlan(key: AddonKey): AddonPlan {
  return ADDONS.find((a) => a.key === key)!;
}

/** Which add-on (if any) a Stripe price ID corresponds to. */
export function addonForPriceId(priceId: string): AddonPlan | undefined {
  return ADDONS.find((a) => a.priceId === priceId);
}

/** Whether a workspace currently has an active (or trialing/past_due-grace) add-on. */
export async function hasActiveAddon(
  workspaceId: string,
  key: AddonKey,
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("workspace_addons")
    .select("status")
    .eq("workspace_id", workspaceId)
    .eq("addon_key", key)
    .maybeSingle();
  const status = (data as { status: string } | null)?.status;
  return status === "active" || status === "past_due"; // grace period on payment failure
}
