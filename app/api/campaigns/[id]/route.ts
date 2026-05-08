import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { fetchAndProcessFalJob } from '@/lib/fal/result-fetcher';

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

    let jobList = jobs ?? [];

    // Fallback: if any jobs have been processing >20s with no webhook, poll fal.ai directly
    const stuckJobs = jobList.filter((j: { status: string; fal_request_id: string | null; created_at: string }) =>
      j.status === 'processing' &&
      j.fal_request_id &&
      Date.now() - new Date(j.created_at).getTime() > 20_000,
    );

    if (stuckJobs.length > 0) {
      await Promise.all(stuckJobs.map((j: { id: string; campaign_id: string; workspace_id: string; type: string; fal_request_id: string }) =>
        fetchAndProcessFalJob(j),
      ));
      // Re-fetch after potential updates
      const [{ data: refreshedJobs }, { data: refreshedAssets }] = await Promise.all([
        admin.from('creative_jobs').select('*').eq('campaign_id', id),
        admin.from('assets').select('*').eq('campaign_id', id),
      ]);
      jobList = refreshedJobs ?? jobList;
      if (refreshedAssets) {
        const allDone2 = jobList.length > 0 && jobList.every((j: { status: string }) => j.status === 'completed');
        const anyFailed2 = jobList.length > 0 && jobList.some((j: { status: string }) => j.status === 'failed');
        const status2 = allDone2 ? 'ready' : anyFailed2 ? 'failed' : (campaign as { status: string }).status;
        return NextResponse.json({ ...campaign, status: status2, jobs: jobList, assets: refreshedAssets });
      }
    }

    const allDone = jobList.length > 0 && jobList.every((j: { status: string }) => j.status === 'completed');
    const anyFailed = jobList.length > 0 && jobList.some((j: { status: string }) => j.status === 'failed');
    const computedStatus = allDone ? 'ready' : anyFailed ? 'failed' : (campaign as { status: string }).status;

    return NextResponse.json({ ...campaign, status: computedStatus, jobs: jobList, assets: campaignAssets ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Not a workspace member' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const raw = (await req.json()) as {
      status?: string; prompt?: string; name?: string;
      current_step?: number; expansion_data?: Record<string, unknown>;
    };
    // Whitelist updatable fields
    const update: Record<string, unknown> = {};
    if (raw.status !== undefined)         update.status         = raw.status;
    if (raw.prompt !== undefined)         update.prompt         = raw.prompt;
    if (raw.name !== undefined)           update.name           = String(raw.name).slice(0, 200);
    if (raw.current_step !== undefined)   update.current_step   = Math.min(5, Math.max(1, Number(raw.current_step)));
    if (raw.expansion_data !== undefined) update.expansion_data = raw.expansion_data;
    const admin = createSupabaseAdminClient();

    const { data: updated, error } = await admin
      .from('campaigns')
      .update(update)
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

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    // Confirm campaign belongs to this workspace
    const { data: campaign } = await admin
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Collect all storage paths before deleting rows
    const { data: assets } = await admin
      .from('assets')
      .select('storage_path')
      .eq('campaign_id', id);

    const storagePaths = (assets ?? [])
      .map(a => a.storage_path as string)
      .filter(Boolean);

    // Delete storage files (best-effort — don't fail the whole request if some are missing)
    if (storagePaths.length > 0) {
      await admin.storage.from('assets').remove(storagePaths);
    }

    // Delete campaign — CASCADE removes assets, creative_jobs, compositions
    const { error: delErr } = await admin
      .from('campaigns')
      .delete()
      .eq('id', id)
      .eq('workspace_id', session.workspaceId);

    if (delErr) throw new Error(delErr.message);

    return NextResponse.json({ deleted: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
