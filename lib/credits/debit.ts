import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { CREDIT_COSTS, type CreditCostKey } from './costs';

export async function debitCredits(
  workspaceId: string,
  jobId: string,
  type: CreditCostKey,
): Promise<{ success: boolean; newBalance: number }> {
  const admin = createSupabaseAdminClient();
  const cost = CREDIT_COSTS[type];

  const { data, error } = await admin.rpc('debit_credits', {
    p_workspace_id: workspaceId,
    p_job_id: jobId,
    p_cost: cost,
    p_description: `${type} job`,
  });

  if (error) {
    console.error('Credit debit RPC error:', error);
    return { success: false, newBalance: 0 };
  }

  // PostgREST returns a jsonb-returning function's result array-wrapped
  // (`[{...}]`). Unwrap to the row before reading fields, otherwise
  // `result.success` is undefined and a successful debit is misread as a
  // failure — charging credits but reporting "insufficient" (HTTP 402).
  const row = Array.isArray(data) ? data[0] : data;
  const result = row as { success: boolean; balance: number; reason?: string };

  if (!result.success) {
    console.warn(`Credit debit failed for workspace ${workspaceId}: ${result.reason}`);
    return { success: false, newBalance: result.balance };
  }

  return { success: true, newBalance: result.balance };
}
