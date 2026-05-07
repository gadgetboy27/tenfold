import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: campaign } = await admin
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [{ data: jobs }, { data: campaignAssets }] = await Promise.all([
      admin.from('creative_jobs').select('*').eq('campaign_id', id),
      admin.from('assets').select('*').eq('campaign_id', id),
    ]);

    const jobList = jobs ?? [];
    const allDone = jobList.length > 0 && jobList.every((j: { status: string }) => j.status === 'completed');
    const anyFailed = jobList.every((j: { status: string }) => j.status === 'failed');
    const computedStatus = allDone ? 'ready' : anyFailed ? 'failed' : (campaign as { status: string }).status;

    return NextResponse.json({ ...campaign, status: computedStatus, jobs: jobList, assets: campaignAssets ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const body = (await req.json()) as { status?: string; prompt?: string };
    const admin = createSupabaseAdminClient();

    const { data: updated, error } = await admin
      .from('campaigns')
      .update(body)
      .eq('id', id)
      .eq('workspace_id', session.workspaceId)
      .select()
      .single();

    if (error || !updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
