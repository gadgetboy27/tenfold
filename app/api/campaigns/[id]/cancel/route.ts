import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { refundCredits } from '@/lib/credits/refund';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    // Verify campaign belongs to this workspace
    const { data: campaign } = await admin
      .from('campaigns')
      .select('id, status')
      .eq('id', id)
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Find all cancellable jobs for this campaign
    const { data: jobs } = await admin
      .from('creative_jobs')
      .select('id, status, credits_charged, type')
      .eq('campaign_id', id)
      .in('status', ['queued', 'processing']);

    const cancellable = (jobs ?? []) as { id: string; status: string; credits_charged: number; type: string }[];

    // Cancel each job and refund its credits
    if (cancellable.length > 0) {
      const jobIds = cancellable.map(j => j.id);
      await admin
        .from('creative_jobs')
        .update({ status: 'cancelled', error_message: 'Cancelled by user' })
        .in('id', jobIds);

      // Refund credits for each cancelled job (only if they had a charge)
      await Promise.all(
        cancellable
          .filter(j => j.credits_charged > 0)
          .map(j => refundCredits(j.id)),
      );
    }

    // Check if any assets already exist (from a partial success)
    const { data: existingAssets } = await admin
      .from('assets')
      .select('id')
      .eq('campaign_id', id)
      .limit(1);

    const hasAssets = (existingAssets?.length ?? 0) > 0;
    const newStatus = hasAssets ? 'ready' : 'failed';

    await admin
      .from('campaigns')
      .update({ status: newStatus })
      .eq('id', id);

    return NextResponse.json({
      ok: true,
      status: newStatus,
      cancelledJobs: cancellable.length,
      creditsRefunded: cancellable.reduce((sum, j) => sum + j.credits_charged, 0),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
