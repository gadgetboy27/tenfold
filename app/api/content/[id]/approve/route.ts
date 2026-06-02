import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { publishToAyrshare } from '@/lib/content-agent/stage5-publish';
import { approvePublishSchema } from '@/lib/validation/content-schemas';

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getSession(req);
    const body = approvePublishSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const { data: submission } = await admin
      .from('content_submissions')
      .select('id, workspace_id, created_by')
      .eq('id', params.id)
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!submission) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const { data: workspace } = await admin
      .from('workspaces')
      .select('ayrshare_profile_key')
      .eq('id', session.workspaceId)
      .single();

    if (!workspace?.ayrshare_profile_key) {
      return NextResponse.json(
        { error: 'Workspace has not connected Ayrshare' },
        { status: 400 },
      );
    }

    const publishResult = await publishToAyrshare(body.schedule, {
      workspaceId: session.workspaceId,
      profileKey: workspace.ayrshare_profile_key,
      userId: session.userId,
      db: admin,
    });

    await admin
      .from('content_submissions')
      .update({ status: 'published' })
      .eq('id', params.id);

    return NextResponse.json(publishResult, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Approve publish error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
