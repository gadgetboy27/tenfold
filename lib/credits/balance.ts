import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function getBalance(workspaceId: string): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('credit_accounts')
    .select('cached_balance')
    .eq('workspace_id', workspaceId)
    .single();
  return (data as { cached_balance: number } | null)?.cached_balance ?? 0;
}

export async function getBalanceWithHistory(workspaceId: string) {
  const admin = createSupabaseAdminClient();
  const [accountRes, txRes] = await Promise.all([
    admin
      .from('credit_accounts')
      .select('cached_balance')
      .eq('workspace_id', workspaceId)
      .single(),
    admin
      .from('credit_transactions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  return {
    balance: (accountRes.data as { cached_balance: number } | null)?.cached_balance ?? 0,
    transactions: txRes.data ?? [],
  };
}
