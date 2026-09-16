import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { internalSecretHeader } from "@/lib/api/ops-auth";
import { submitContentSchema } from "@/lib/validation/content-schemas";
import { runContentPipeline } from "@/lib/content-agent";
import { v4 as uuidv4 } from "uuid";

export const POST = withWorkspace(async (req, { db, admin, session }) => {
  const body = submitContentSchema.parse(await req.json());

  const submissionId = uuidv4();

  const { data: workspace } = await db
    .from("workspaces")
    .select("ayrshare_profile_key")
    .eq("id", session.workspaceId)
    .single();

  if (!workspace?.ayrshare_profile_key) {
    return NextResponse.json(
      { error: "Workspace has not connected Ayrshare" },
      { status: 400 },
    );
  }

  const { error: insertError } = await db.from("content_submissions").insert({
    id: submissionId,
    workspace_id: session.workspaceId,
    created_by: session.userId,
    raw_transcript: body.transcript,
    status: "queued",
  });

  if (insertError) {
    console.error("Failed to insert submission:", insertError);
    return NextResponse.json(
      { error: "Failed to create submission" },
      { status: 500 },
    );
  }

  const stages = ["analyse", "repurpose", "schedule", "thumbnails", "publish"];
  const { error: stagesError } = await db
    .from("content_pipeline_results")
    .insert(
      stages.map((stage) => ({
        submission_id: submissionId,
        stage,
        status: "pending",
        output_json: null,
        error: null,
      })),
    );

  if (stagesError) {
    console.error("Failed to insert pipeline stages:", stagesError);
    return NextResponse.json(
      { error: "Failed to initialize pipeline" },
      { status: 500 },
    );
  }

  // Fire-and-forget background pipeline execution
  // Vercel: use after() (non-blocking, runs after response sent)
  // Other platforms: use self-call via fetch (doesn't block response)
  if (typeof globalThis !== "undefined" && "after" in globalThis) {
    (
      globalThis as unknown as { after: (cb: () => Promise<void>) => void }
    ).after(async () => {
      try {
        await runContentPipeline({
          submissionId,
          workspaceId: session.workspaceId,
          userId: session.userId,
          transcript: body.transcript,
          profileKey: workspace.ayrshare_profile_key!,
          // The pipeline writes across tables by hand; raw client.
          db: admin,
        });
      } catch (error) {
        console.error("Pipeline execution failed:", error);
      }
    });
  } else {
    // Non-Vercel platforms: trigger via dedicated endpoint (non-blocking fetch)
    const pipelineUrl = `${process.env.APP_URL}/api/content/${submissionId}/run`;
    // Null when CRON_SECRET is unset — the receiver now fails closed, so
    // firing the request anyway would only ever earn a 401. Say why instead.
    const internal = internalSecretHeader();
    if (!internal) {
      console.error(
        "Pipeline trigger skipped: CRON_SECRET is not set on this deployment",
      );
      return NextResponse.json({ submissionId }, { status: 201 });
    }
    fetch(pipelineUrl, {
      method: "POST",
      headers: {
        ...internal,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workspaceId: session.workspaceId,
        userId: session.userId,
        transcript: body.transcript,
        profileKey: workspace.ayrshare_profile_key,
      }),
    }).catch((err) => console.error("Pipeline trigger failed:", err));
  }

  return NextResponse.json({ submissionId }, { status: 201 });
});
