import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Subscription tiers (mirror app/api/billing PLANS + the pay-as-you-go default). */
export type Tier = "payg" | "creator" | "business" | "agency";

export interface Entitlements {
  tier: Tier;
  label: string;
  /** Any paid subscription (gates the "Pro" / commercial toolset). */
  isPro: boolean;
  /** Video lengths (seconds) this tier may generate. Empty = no video at all. */
  videoDurations: number[];
  /**
   * Generations per UTC day. null = uncapped.
   *
   * A backstop, not the main defence — credits already bound a free workspace
   * (50 welcome credits buys 4 image grids, ~$1.20 of fal spend, once). This
   * exists for the case credits DON'T bound: promo grants and admin top-ups
   * have handed free workspaces 500+ credits, and a runaway client loop or a
   * compromised account could otherwise burn all of it in minutes.
   */
  dailyGenerationCap: number | null;
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
    // No video on the free tier. It is both the most expensive action
    // (video_10s is $0.95 of fal spend) and the worst-margin one, so giving it
    // away is the single largest avoidable COGS on an account paying nothing.
    videoDurations: [],
    dailyGenerationCap: 15,
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
    // 15s is the longest single Kling call and the viral Reels length; 30s
    // needs two calls stitched, so it stays a Business/Agency feature.
    videoDurations: [5, 10, 15],
    dailyGenerationCap: 100,
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
    videoDurations: [5, 10, 15, 30],
    dailyGenerationCap: 300,
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
    videoDurations: [5, 10, 15, 30],
    // Uncapped: they pay per credit and credits are the limit.
    dailyGenerationCap: null,
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

/**
 * True while a subscription still earns its tier.
 *
 * `past_due` is deliberately included, but only inside its grace window. Stripe
 * flags past_due the moment a renewal card fails — which for the customer is
 * usually just an expired card — and honouring only active/trialing made that
 * an INSTANT downgrade: video gone, caps tightened, mid-work, before any dunning
 * email had even arrived. Stripe retries for days; we hold the tier for the same
 * window and let the retries do their job. Exported for the tests, because the
 * cost of getting either edge wrong is a real customer.
 */
export function isEntitled(
  sub: { status: string | null; grace_until?: string | null } | null,
  now: Date = new Date(),
): boolean {
  if (!sub) return false;
  if (sub.status === "active" || sub.status === "trialing") return true;
  if (sub.status !== "past_due") return false;
  // past_due with no grace recorded gets none — fail closed rather than hand
  // out an unbounded free ride to a subscription that predates this column.
  if (!sub.grace_until) return false;
  const until = Date.parse(sub.grace_until);
  return Number.isFinite(until) && until > now.getTime();
}

/** Resolve a workspace's entitlements from its subscription tier. */
export async function getEntitlements(
  workspaceId: string,
): Promise<Entitlements> {
  const override = await adminOverride(workspaceId);
  if (override) return override;

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("subscriptions")
    .select("tier, status, grace_until")
    .eq("workspace_id", workspaceId)
    .single();
  const sub = data as {
    tier: string | null;
    status: string | null;
    grace_until: string | null;
  } | null;
  return entitlementsForTier(isEntitled(sub) ? sub?.tier : "payg");
}
