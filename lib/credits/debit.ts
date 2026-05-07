import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { CREDIT_COSTS, type CreditCostKey } from './costs';

export async function debitCredits(
  workspaceId: string,
  jobId: string,
  type: CreditCostKey,
): Promise<{ success: boolean; newBalance: number }> {
  const admin = createSupabaseAdminClient();
  const cost = CREDIT_COSTS[type];

  const { data: account } = await admin
    .from('credit_accounts')
    .select('cached_balance')
    .eq('workspace_id', workspaceId)
    .single();

  const currentBalance = (account as { cached_balance: number } | null)?.cached_balance ?? 0;

  if (currentBalance < cost) {
    return { success: false, newBalance: currentBalance };
  }

  const newBalance = currentBalance - cost;

  await admin.from('credit_transactions').insert({
    workspace_id: workspaceId,
    job_id: jobId,
    type: 'spend',
    amount: -cost,
    balance_after: newBalance,
    description: `${type} job`,
  });

  await admin
    .from('credit_accounts')
    .update({ cached_balance: newBalance })
    .eq('workspace_id', workspaceId);

  return { success: true, newBalance };
}
