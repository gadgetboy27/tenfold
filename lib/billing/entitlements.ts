import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Subscription tiers (mirror app/api/billing PLANS + the pay-as-you-go default). */
export type Tier = "payg" | "creator" | "business" | "agency";

export interface Entitlements {
  tier: Tier;
  label: string;
  /** Any paid subscription (gates the "Pro" / commercial toolset). */
  isPro: boolean;
  /** Video lengths (seconds) this tier may generate. */
  videoDurations: number[];
  /** Distinct anchor directions generated per campaign. */
  maxVariations: number;
  /** High-resolution / print-ready upscaled exports. */
  hdExport: boolean;
  /** Export without the tenfold watermark / branded frame. */
  whiteLabel: boolean;
  /** Jobs jump the generation queue. */
  priorityQueue: boolean;
  /** Programmatic generation via API tokens. */
  apiAccess: boolean;
  /** Advanced per-post analytics + reporting. */
  advancedAnalytics: boolean;
  /** Workspaces (brands/clients) the owner may run. */
  maxWorkspaces: number;
}

const TIERS: Record<Tier, Entitlements> = {
  payg: {
    tier: "payg",
    label: "Pay-as-you-go",
    isPro: false,
    videoDurations: [10],
    maxVariations: 4,
    hdExport: false,
    whiteLabel: false,
    priorityQueue: false,
    apiAccess: false,
    advancedAnalytics: false,
    maxWorkspaces: 1,
  },
  creator: {
    tier: "creator",
    label: "Creator",
    isPro: true,
    videoDurations: [10, 30],
    maxVariations: 4,
    hdExport: false,
    whiteLabel: false,
    priorityQueue: false,
    apiAccess: false,
    advancedAnalytics: false,
    maxWorkspaces: 1,
  },
  business: {
    tier: "business",
    label: "Business",
    isPro: true,
    videoDurations: [10, 30, 60],
    maxVariations: 6,
    hdExport: true,
    whiteLabel: false,
    priorityQueue: true,
    apiAccess: false,
    advancedAnalytics: true,
    maxWorkspaces: 3,
  },
  agency: {
    tier: "agency",
    label: "Agency",
    isPro: true,
    videoDurations: [10, 30, 60],
    maxVariations: 8,
    hdExport: true,
    whiteLabel: true,
    priorityQueue: true,
    apiAccess: true,
    advancedAnalytics: true,
    maxWorkspaces: 5,
  },
};

export function entitlementsForTier(
  tier: string | null | undefined,
): Entitlements {
  return TIERS[(tier as Tier) ?? "payg"] ?? TIERS.payg;
}

/** Resolve a workspace's entitlements from its (active) subscription tier. */
export async function getEntitlements(
  workspaceId: string,
): Promise<Entitlements> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("tier, status")
    .eq("workspace_id", workspaceId)
    .single();
  const sub = data as { tier: string | null; status: string | null } | null;
  // Only honour the tier while the subscription is active/trialing.
  const active = sub?.status === "active" || sub?.status === "trialing";
  return entitlementsForTier(active ? sub?.tier : "payg");
}
