import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { PROVIDER_COST_USD, CREDIT_VALUE_USD } from './rates';

export async function recordJobCost(
  jobId: string,
  jobType: string,
  overrideCostUsd?: number,
  durationMs?: number,
): Promise<void> {
  const admin = createSupabaseAdminClient();
  const actualCostUsd = overrideCostUsd ?? PROVIDER_COST_USD[jobType] ?? 0;
  await admin
    .from('creative_jobs')
    .update({
      actual_cost_usd: actualCostUsd,
      ...(durationMs !== undefined ? { provider_duration_ms: durationMs } : {}),
    })
    .eq('id', jobId);
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
  const { data: rows } = await admin
    .from('creative_jobs')
    .select('type, status, credits_charged, actual_cost_usd')
    .eq('workspace_id', workspaceId)
    .gte('created_at', from.toISOString());

  const jobs = (rows ?? []) as {
    type: string;
    status: string;
    credits_charged: number;
    actual_cost_usd: number | null;
  }[];

  const byType: Record<string, JobTypeSummary> = {};
  let totalJobs = 0, completedJobs = 0, failedJobs = 0;
  let totalCredits = 0, totalRevenue = 0, totalCost = 0;

  for (const job of jobs) {
    totalJobs++;
    if (job.status === 'completed') completedJobs++;
    if (job.status === 'failed') failedJobs++;

    const credits = job.credits_charged ?? 0;
    const costUsd = job.actual_cost_usd ?? PROVIDER_COST_USD[job.type] ?? 0;
    const revenueUsd = credits * CREDIT_VALUE_USD;

    totalCredits += credits;
    totalRevenue += revenueUsd;
    totalCost += costUsd;

    if (!byType[job.type]) {
      byType[job.type] = { type: job.type, jobs: 0, creditsCharged: 0, revenueUsd: 0, actualCostUsd: 0, marginUsd: 0, marginPct: 0 };
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
    marginPct: row.revenueUsd > 0 ? round(((row.revenueUsd - row.actualCostUsd) / row.revenueUsd) * 100) : 0,
  }));

  const grossMarginUsd = totalRevenue - totalCost;
  return {
    periodStart: from, periodEnd: _to,
    totalJobs, completedJobs, failedJobs,
    totalCreditsCharged: totalCredits,
    revenueUsd: round(totalRevenue),
    actualCostUsd: round(totalCost),
    grossMarginUsd: round(grossMarginUsd),
    grossMarginPct: totalRevenue > 0 ? round((grossMarginUsd / totalRevenue) * 100) : 0,
    byType: byTypeArr.sort((a, b) => b.revenueUsd - a.revenueUsd),
  };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}
