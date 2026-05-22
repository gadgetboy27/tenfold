import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const GRANT_AMOUNT = 500;

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const { data: account } = await admin
      .from('credit_accounts')
      .select('cached_balance')
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!account) throw new Error('Credit account not found');

    const newBalance = (account as { cached_balance: number }).cached_balance + GRANT_AMOUNT;

    await admin.from('credit_transactions').insert({
      workspace_id: session.workspaceId,
      type: 'grant',
      amount: GRANT_AMOUNT,
      balance_after: newBalance,
      description: 'Test credit top-up',
    });

    await admin
      .from('credit_accounts')
      .update({ cached_balance: newBalance })
      .eq('workspace_id', session.workspaceId);

    return NextResponse.json({ granted: GRANT_AMOUNT });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
