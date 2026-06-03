import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { runContentPipeline } from '@/lib/content-agent';

interface PipelineRequest {
  workspaceId: string;
  userId: string;
  transcript: string;
  profileKey: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    // Verify internal secret (prevents unauthorized pipeline triggers)
    const secret = req.headers.get('x-internal-secret');
    if (secret !== (process.env.CRON_SECRET || 'dev-secret')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: PipelineRequest = await req.json();
    const submissionId = id;
    const admin = createSupabaseAdminClient();

    // Start pipeline without awaiting (caller gets 201 immediately)
    runContentPipeline({
      submissionId,
      workspaceId: body.workspaceId,
      userId: body.userId,
      transcript: body.transcript,
      profileKey: body.profileKey,
      db: admin,
    }).catch((error) => {
      console.error(`Pipeline failed for submission ${submissionId}:`, error);
    });

    return NextResponse.json({ scheduled: true }, { status: 201 });
  } catch (error) {
    console.error('Pipeline trigger error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Pipeline trigger failed' },
      { status: 500 },
    );
  }
}
