import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const { data: submission } = await admin
      .from('content_submissions')
      .select('id, workspace_id, created_by')
      .eq('id', id)
      .single();

    if (!submission || submission.workspace_id !== session.workspaceId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const sendEvent = (data: unknown) => {
          const json = JSON.stringify(data);
          controller.enqueue(encoder.encode(`data: ${json}\n\n`));
        };

        const pollInterval = 2000;
        const timeout = 5 * 60 * 1000;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
          const { data: results } = await admin
            .from('content_pipeline_results')
            .select('*')
            .eq('submission_id', id)
            .order('created_at', { ascending: true });

          if (results) {
            sendEvent({
              timestamp: new Date().toISOString(),
              stages: results,
            });

            const allDone = results.every((r) =>
              ['completed', 'failed'].includes((r as { status: string }).status),
            );

            if (allDone) {
              controller.close();
              return;
            }
          }

          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Status stream error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
