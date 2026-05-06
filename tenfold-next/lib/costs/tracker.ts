import { db } from '@/db';
import { creativeJobs, creditTransactions } from '@/db/schema';
import { eq, gte, and, sql } from 'drizzle-orm';
import { PROVIDER_COST_USD, CREDIT_VALUE_USD } from './rates';

export async function recordJobCost(
  jobId: string,
  jobType: string,
  overrideCostUsd?: number,
  durationMs?: number,
): Promise<void> {
  const actualCostUsd = overrideCostUsd ?? PROVIDER_COST_USD[jobType] ?? 0;
  await db
    .update(creativeJobs)
    .set({ actualCostUsd, providerDurationMs: durationMs })
    .where(eq(creativeJobs.id, jobId));
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
  to: Date,
): Promise<UsageSummary> {
  const jobs = await db
    .select({
      type: creativeJobs.type,
      status: creativeJobs.status,
      creditsCharged: creativeJobs.creditsCharged,
      actualCostUsd: creativeJobs.actualCostUsd,
    })
    .from(creativeJobs)
    .where(
      and(
        eq(creativeJobs.workspaceId, workspaceId),
        gte(creativeJobs.createdAt, from),
      ),
    );

  const byType: Record<string, JobTypeSummary> = {};
  let totalJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let totalCredits = 0;
  let totalRevenue = 0;
  let totalCost = 0;

  for (const job of jobs) {
    totalJobs++;
    if (job.status === 'completed') completedJobs++;
    if (job.status === 'failed') failedJobs++;

    const credits = job.creditsCharged ?? 0;
    const costUsd = job.actualCostUsd ?? PROVIDER_COST_USD[job.type] ?? 0;
    const revenueUsd = credits * CREDIT_VALUE_USD;

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
    marginPct: row.revenueUsd > 0 ? round(((row.revenueUsd - row.actualCostUsd) / row.revenueUsd) * 100) : 0,
  }));

  const grossMarginUsd = totalRevenue - totalCost;

  return {
    periodStart: from,
    periodEnd: to,
    totalJobs,
    completedJobs,
    failedJobs,
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
