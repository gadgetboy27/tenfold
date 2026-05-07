import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: job } = await admin
      .from('creative_jobs')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const j = job as {
      id: string; status: string; type: string; credits_charged: number;
      error_message: string | null; created_at: string; completed_at: string | null;
    };

    const { data: jobAssets } = await admin
      .from('assets')
      .select('id, url, type')
      .eq('job_id', j.id);

    const assetList = jobAssets ?? [];
    const outputUrls = assetList.map((a: { url: string }) => a.url);

    return NextResponse.json({
      id: j.id,
      status: j.status === 'completed' ? 'ready' : j.status,
      type: j.type,
      creditCost: j.credits_charged,
      assets: assetList,
      outputUrls,
      errorMessage: j.error_message,
      createdAt: j.created_at,
      completedAt: j.completed_at,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
