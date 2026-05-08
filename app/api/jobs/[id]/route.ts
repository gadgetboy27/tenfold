import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { fetchAndProcessFalJob } from '@/lib/fal/result-fetcher';

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

    // If job is stuck processing with a fal request ID and >20s old, poll fal.ai directly
    const j0 = job as { id: string; status: string; type: string; fal_request_id: string | null; campaign_id: string; workspace_id: string; created_at: string };
    if (
      j0.status === 'processing' &&
      j0.fal_request_id &&
      Date.now() - new Date(j0.created_at).getTime() > 20_000
    ) {
      await fetchAndProcessFalJob({
        id: j0.id,
        campaign_id: j0.campaign_id,
        workspace_id: j0.workspace_id,
        type: j0.type,
        fal_request_id: j0.fal_request_id,
      });
      // Re-fetch after potential update
      const { data: refreshed } = await admin
        .from('creative_jobs')
        .select('*')
        .eq('id', id)
        .single();
      if (refreshed) Object.assign(job, refreshed);
    }

    const j = job as {
      id: string; status: string; type: string; credits_charged: number;
      error_message: string | null; error_analysis: string | null; suggested_prompt: string | null;
      created_at: string; completed_at: string | null;
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
      errorAnalysis: j.error_analysis,
      suggestedPrompt: j.suggested_prompt,
      createdAt: j.created_at,
      completedAt: j.completed_at,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
