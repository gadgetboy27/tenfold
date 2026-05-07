import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function refundCredits(jobId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: job } = await admin
    .from('creative_jobs')
    .select('workspace_id, credits_charged, type')
    .eq('id', jobId)
    .single();

  const j = job as { workspace_id: string; credits_charged: number; type: string } | null;
  if (!j || j.credits_charged === 0) return;

  const { data: account } = await admin
    .from('credit_accounts')
    .select('cached_balance')
    .eq('workspace_id', j.workspace_id)
    .single();

  const currentBalance = (account as { cached_balance: number } | null)?.cached_balance ?? 0;
  const newBalance = currentBalance + j.credits_charged;

  await admin.from('credit_transactions').insert({
    workspace_id: j.workspace_id,
    job_id: jobId,
    type: 'refund',
    amount: j.credits_charged,
    balance_after: newBalance,
    description: `refund for failed ${j.type} job`,
  });

  await admin
    .from('credit_accounts')
    .update({ cached_balance: newBalance })
    .eq('workspace_id', j.workspace_id);
}
