import { createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Return a job's credits to its workspace. Idempotent — the RPC no-ops if a
 * refund row for this job already exists, so webhook retries and a sweep that
 * races a late webhook can both call it safely.
 *
 * The 42 call sites only ever know the job id, but `refund_credits` needs
 * (workspace, cost) too — so this resolves them from the job's own **spend
 * row**, not from `creative_jobs`. That's deliberate: several callers refund a
 * job whose `creative_jobs` insert is exactly what failed (see the logo and
 * campaigns routes), so the job row can be absent. The debit always lands
 * first, which makes the spend transaction the one record guaranteed to be
 * there.
 */
export async function refundCredits(jobId: string): Promise<{ success: boolean; newBalance?: number }> {
  const admin = createSupabaseAdminClient();

  const { data: spend, error: lookupErr } = await admin
    .from('credit_transactions')
    .select('workspace_id, amount, description')
    .eq('job_id', jobId)
    .eq('type', 'spend')
    .maybeSingle();

  if (lookupErr) {
    console.error(`Credit refund lookup failed for job ${jobId}:`, lookupErr);
    return { success: false };
  }
  if (!spend) {
    // Nothing was ever charged for this job — refunding would mint credits.
    console.warn(`Credit refund skipped for job ${jobId}: no spend transaction`);
    return { success: false };
  }

  const row = spend as { workspace_id: string; amount: number; description: string | null };
  // Spends are stored negative; the RPC adds p_cost to the balance.
  const cost = Math.abs(row.amount);
  if (cost === 0) return { success: true };

  const { data, error } = await admin.rpc('refund_credits', {
    p_workspace_id: row.workspace_id,
    p_job_id: jobId,
    p_cost: cost,
    p_description: `Refund — ${row.description ?? 'job failed'}`,
  });

  if (error) {
    console.error('Credit refund RPC error:', error);
    return { success: false };
  }

  // PostgREST array-wraps a TABLE-returning function's result (`[{...}]`);
  // unwrap the row, or `result.success` reads undefined and a completed refund
  // is reported as a failure.
  const unwrapped = Array.isArray(data) ? data[0] : data;
  const result = unwrapped as { success: boolean; balance?: number } | undefined;

  if (!result?.success) {
    console.warn(`Credit refund did not apply for job ${jobId}`);
    return { success: false };
  }

  return { success: true, newBalance: result.balance };
}
