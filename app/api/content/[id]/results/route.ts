import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const { data: submission } = await admin
      .from('content_submissions')
      .select('*')
      .eq('id', params.id)
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!submission) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: pipelineResults } = await admin
      .from('content_pipeline_results')
      .select('*')
      .eq('submission_id', params.id)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      submission,
      pipelineResults: pipelineResults || [],
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Results fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
