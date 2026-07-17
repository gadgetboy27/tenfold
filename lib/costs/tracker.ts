import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  PROVIDER_COST_USD,
  creditValueUsd,
  NZD_USD_RATE,
  type CreditSource,
} from "./rates";
import { PACKS, PLANS } from "@/lib/billing/plans";

/**
 * What this workspace's credits were actually worth: money genuinely collected,
 * divided by every credit they ever received.
 *
 * BLENDED on purpose. Two cheaper heuristics are both wrong:
 *
 *  - A flat rate (the old `CREDIT_VALUE_USD = 0.1`) is a price nobody paid;
 *    subscribers pay ~$0.05 and packs $0.24–$0.37, so it roughly doubled the
 *    reported margin on the path that matters.
 *  - "Did they ever buy? then price everything at the pack rate" is just as
 *    wrong the other way: a real workspace here holds 500 granted credits and
 *    50 purchased ones, so that rule valued free credits at $0.24 and invented
 *    ~$30 of revenue.
 *
 * Grants are counted as credits acquired at $0 — which is the point. They
 * dilute the rate exactly as much as they dilute the real economics.
 */
async function creditRateFor(
  workspaceId: string,
): Promise<{ rate: number; source: CreditSource }> {
  const admin = createSupabaseAdminClient();

  const { data: rows } = await admin
    .from("credit_transactions")
    .select("type, amount, description")
    .eq("workspace_id", workspaceId);
  const txns = (rows ?? []) as {
    type: string;
    amount: number;
    description: string | null;
  }[];

  let usdIn = 0;
  let creditsIn = 0;
  let paidTier: CreditSource | null = null;
  for (const t of txns) {
    if (t.amount <= 0) continue; // spends and refunds aren't acquisitions
    creditsIn += t.amount;
    if (t.type === "purchase") {
      usdIn += packRevenueUsd(t.amount);
      continue;
    }
    // A grant is valued by what it WAS, read from the transaction itself — not
    // by the account's current tier. Valuing by current tier was wrong twice
    // over: a churned subscriber's paid grants read $0 (they're "payg" now),
    // and a live subscriber's free welcome grant read as paid (both are type
    // 'grant'). subscriptionGrantTier looks at the description + amount, so a
    // grant's value survives the account changing plan or cancelling.
    const grantTier = subscriptionGrantTier(t.type, t.description, t.amount);
    if (grantTier) {
      usdIn += t.amount * creditValueUsd(grantTier);
      paidTier = grantTier;
    }
    // Welcome credits, promos, admin top-ups: free, contribute $0.
  }

  if (creditsIn === 0) return { rate: 0, source: "grant" };
  const rate = usdIn / creditsIn;
  // Report the source by what actually funded the credits.
  const source: CreditSource = usdIn === 0 ? "grant" : (paidTier ?? "payg");
  return { rate, source };
}

/**
 * The paid tier a grant transaction represents, or null if it was free.
 *
 * grantCredits() (lib/stripe/webhooks.ts) stamps subscription grants with the
 * description "Monthly subscription credits" and an amount equal to that tier's
 * monthly allowance. Both together identify it: the description rules out
 * welcome/promo/admin grants that happen to share an amount, and the amount
 * names the tier. Historical, so it's correct even after the account churns.
 */
export function subscriptionGrantTier(
  type: string,
  description: string | null,
  amount: number,
): Exclude<CreditSource, "grant" | "payg"> | null {
  if (type !== "grant") return null;
  if (!/subscription/i.test(description ?? "")) return null;
  const plan = PLANS.find((p) => p.creditsPerMonth === amount);
  if (!plan || plan.id === "payg") return null;
  return plan.id as Exclude<CreditSource, "grant" | "payg">;
}

/** USD a top-up of N credits brought in, matched to the pack that sells N. */
function packRevenueUsd(credits: number): number {
  const pack = PACKS.find((p) => p.credits === credits);
  if (pack) return pack.priceNzd * NZD_USD_RATE;
  // Unknown size (pack repriced/retired since). Value at the nearest pack's
  // per-credit rate rather than $0 — silently free would understate revenue.
  const nearest = [...PACKS].sort(
    (a, b) => Math.abs(a.credits - credits) - Math.abs(b.credits - credits),
  )[0];
  if (!nearest) return 0;
  return credits * ((nearest.priceNzd * NZD_USD_RATE) / nearest.credits);
}

export async function recordJobCost(
  jobId: string,
  jobType: string,
  overrideCostUsd?: number,
  durationMs?: number,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const actualCostUsd = overrideCostUsd ?? PROVIDER_COST_USD[jobType] ?? 0;
  await admin
    .from("creative_jobs")
    .update({
      actual_cost_usd: actualCostUsd,
      ...(durationMs !== undefined ? { provider_duration_ms: durationMs } : {}),
    })
    .eq("id", jobId);
}

export interface UsageSummary {
  periodStart: Date;
  periodEnd: Date;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalCreditsCharged: number;
  revenueUsd: number;
  actualCostUsd: number;
  grossMarginUsd: number;
  grossMarginPct: number;
  /** How this workspace's credits were valued, and at what rate. Reported so a
   *  margin figure can never again be read without knowing what it assumes —
   *  "grant" means these credits were free and the margin is -100% by design. */
  creditSource: CreditSource;
  creditRateUsd: number;
  byType: JobTypeSummary[];
}

export interface JobTypeSummary {
  type: string;
  jobs: number;
  creditsCharged: number;
  revenueUsd: number;
  actualCostUsd: number;
  marginUsd: number;
  marginPct: number;
}

export async function getUsageSummary(
  workspaceId: string,
  from: Date,
  _to: Date,
): Promise<UsageSummary> {
  const admin = createSupabaseAdminClient();
  const { rate: creditRate, source: creditSource } =
    await creditRateFor(workspaceId);
  const { data: rows } = await admin
    .from("creative_jobs")
    .select("type, status, credits_charged, actual_cost_usd")
    .eq("workspace_id", workspaceId)
    .gte("created_at", from.toISOString());

  const jobs = (rows ?? []) as {
    type: string;
    status: string;
    credits_charged: number;
    actual_cost_usd: number | null;
  }[];

  const byType: Record<string, JobTypeSummary> = {};
  let totalJobs = 0,
    completedJobs = 0,
    failedJobs = 0;
  let totalCredits = 0,
    totalRevenue = 0,
    totalCost = 0;

  for (const job of jobs) {
    totalJobs++;
    if (job.status === "completed") completedJobs++;
    if (job.status === "failed") failedJobs++;

    const credits = job.credits_charged ?? 0;
    const costUsd = job.actual_cost_usd ?? PROVIDER_COST_USD[job.type] ?? 0;
    const revenueUsd = credits * creditRate;

    totalCredits += credits;
    totalRevenue += revenueUsd;
    totalCost += costUsd;

    if (!byType[job.type]) {
      byType[job.type] = {
        type: job.type,
        jobs: 0,
        creditsCharged: 0,
        revenueUsd: 0,
        actualCostUsd: 0,
        marginUsd: 0,
        marginPct: 0,
      };
    }
    byType[job.type].jobs++;
    byType[job.type].creditsCharged += credits;
    byType[job.type].revenueUsd += revenueUsd;
    byType[job.type].actualCostUsd += costUsd;
  }

  const byTypeArr = Object.values(byType).map((row) => ({
    ...row,
    revenueUsd: round(row.revenueUsd),
    actualCostUsd: round(row.actualCostUsd),
    marginUsd: round(row.revenueUsd - row.actualCostUsd),
    // Same as the total: free credits that cost real money are -100%, not 0%.
    marginPct:
      row.revenueUsd > 0
        ? round(((row.revenueUsd - row.actualCostUsd) / row.revenueUsd) * 100)
        : row.actualCostUsd > 0
          ? -100
          : 0,
  }));

  const grossMarginUsd = totalRevenue - totalCost;
  return {
    periodStart: from,
    periodEnd: _to,
    totalJobs,
    completedJobs,
    failedJobs,
    totalCreditsCharged: totalCredits,
    revenueUsd: round(totalRevenue),
    actualCostUsd: round(totalCost),
    grossMarginUsd: round(grossMarginUsd),
    // Free credits earn nothing, so margin is -100% whenever cost was incurred.
    // Reporting 0% there (as a `revenue > 0` guard does) would hide exactly the
    // spend this summary exists to expose.
    grossMarginPct:
      totalRevenue > 0
        ? round((grossMarginUsd / totalRevenue) * 100)
        : totalCost > 0
          ? -100
          : 0,
    creditSource,
    creditRateUsd: round(creditRate),
    byType: byTypeArr.sort((a, b) => b.actualCostUsd - a.actualCostUsd),
  };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
