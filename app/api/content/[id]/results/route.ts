import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// GET /api/content/[id]/results — polled every 3s by ContentReview while a
// submission runs, so it is exempt from the shared per-IP bucket.
export const GET = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    const { id } = params;

    const { data: submission } = await db
      .from("content_submissions")
      .select("*")
      .eq("id", id)
      .single();

    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data: pipelineResults } = await db
      .from("content_pipeline_results")
      .select("*")
      .eq("submission_id", id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      submission,
      pipelineResults: pipelineResults || [],
    });
  },
  { rateLimit: false },
);
