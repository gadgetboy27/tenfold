import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasActiveAddon } from "@/lib/billing/addons";

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
  /** Pro "AI Photoshop" effects this tier unlocks (keys match the effects UI:
   *  removebg, inpaint, blend, borders, motion). A higher tier unlocks more. */
  proEffects: string[];
}

// Effect keys, ordered from most accessible to most premium. Kept in one place
// so the tiers below and the effects UI never drift.
export const PRO_EFFECTS = [
  "removebg",
  "borders",
  "blend",
  "inpaint",
  "motion",
] as const;

const TIERS: Record<Tier, Entitlements> = {
  payg: {
    tier: "payg",
    label: "Pay-as-you-go",
    isPro: false,
    videoDurations: [10, 15],
    maxVariations: 4,
    hdExport: false,
    whiteLabel: false,
    priorityQueue: false,
    apiAccess: false,
    advancedAnalytics: false,
    maxWorkspaces: 1,
    proEffects: [], // none — Pro effects are the upgrade nudge
  },
  creator: {
    tier: "creator",
    label: "Creator",
    isPro: true,
    videoDurations: [10, 15, 30],
    maxVariations: 4,
    hdExport: false,
    whiteLabel: false,
    priorityQueue: false,
    apiAccess: false,
    advancedAnalytics: false,
    maxWorkspaces: 1,
    proEffects: ["removebg"],
  },
  business: {
    tier: "business",
    label: "Business",
    isPro: true,
    videoDurations: [10, 15, 30],
    maxVariations: 6,
    hdExport: true,
    whiteLabel: false,
    priorityQueue: true,
    apiAccess: false,
    advancedAnalytics: true,
    maxWorkspaces: 3,
    // "blend" is NOT bundled free on Business — it requires the Blend Package
    // add-on (see getEntitlements below), matching lib/compositing/access.ts's
    // server-side gate. Keeping it out of this static list is what makes the
    // Studio's lock icons agree with what the API will actually allow.
    proEffects: ["removebg", "borders"],
  },
  agency: {
    tier: "agency",
    label: "Agency",
    isPro: true,
    videoDurations: [10, 15, 30],
    maxVariations: 8,
    hdExport: true,
    whiteLabel: true,
    priorityQueue: true,
    apiAccess: true,
    advancedAnalytics: true,
    maxWorkspaces: 5,
    proEffects: [...PRO_EFFECTS], // every effect
  },
};

export function entitlementsForTier(
  tier: string | null | undefined,
): Entitlements {
  return TIERS[(tier as Tier) ?? "payg"] ?? TIERS.payg;
}

/**
 * Admin override for live testing: if a workspace owner's email is in the
 * ADMIN_EMAILS allowlist (comma-separated env var), unlock the full toolset
 * regardless of subscription. Guarded by the env var, so there is ZERO extra
 * work when it isn't configured (normal users / dev). Returns the top "agency"
 * tier for matches.
 */
async function adminOverride(
  workspaceId: string,
): Promise<Entitlements | null> {
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return null;

  const admin = createSupabaseAdminClient();
  const { data: owner } = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner")
    .limit(1)
    .single();
  const ownerId = (owner as { user_id: string } | null)?.user_id;
  if (!ownerId) return null;

  const { data: u } = await admin.auth.admin.getUserById(ownerId);
  const email = u?.user?.email?.toLowerCase();
  return email && allow.includes(email) ? TIERS.agency : null;
}

/** Resolve a workspace's entitlements from its (active) subscription tier. */
export async function getEntitlements(
  workspaceId: string,
): Promise<Entitlements> {
  const override = await adminOverride(workspaceId);
  if (override) return override;

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("tier, status")
    .eq("workspace_id", workspaceId)
    .single();
  const sub = data as { tier: string | null; status: string | null } | null;
  // Only honour the tier while the subscription is active/trialing.
  const active = sub?.status === "active" || sub?.status === "trialing";
  const base = entitlementsForTier(active ? sub?.tier : "payg");

  // Blend is bundled free on Agency but requires the Blend Package add-on on
  // Business — checked here so proEffects (which drives the Studio UI's lock
  // icons) always agrees with lib/compositing/access.ts's server-side gate.
  if (base.tier === "business") {
    const hasBlend = await hasActiveAddon(workspaceId, "blend_package");
    if (hasBlend) return { ...base, proEffects: [...base.proEffects, "blend"] };
  }
  return base;
}
