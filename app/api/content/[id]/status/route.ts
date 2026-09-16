import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// GET /api/content/[id]/status — a server-sent event stream that polls the
// pipeline results for up to five minutes. One long-lived request per
// submission, not a burst, so the per-IP bucket is left off.
export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    const { id } = params;

    const { data: submission } = await db
      .from("content_submissions")
      .select("id, workspace_id, created_by")
      .eq("id", id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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
          const { data: results } = await db
            .from("content_pipeline_results")
            .select("*")
            .eq("submission_id", id)
            .order("created_at", { ascending: true });

          if (results) {
            sendEvent({
              timestamp: new Date().toISOString(),
              stages: results,
            });

            const allDone = results.every((r) =>
              ["completed", "failed"].includes(
                (r as { status: string }).status,
              ),
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
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
  { rateLimit: false },
);
