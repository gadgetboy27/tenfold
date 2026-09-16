import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { publishToAyrshare } from "@/lib/content-agent/stage5-publish";
import { approvePublishSchema } from "@/lib/validation/content-schemas";

export const POST = withWorkspace<{ id: string }>(
  async (req, { db, admin, session, params }) => {
    const { id } = params;
    const body = approvePublishSchema.parse(await req.json());

    const { data: submission } = await db
      .from("content_submissions")
      .select("id, workspace_id, created_by")
      .eq("id", id)
      .single();

    if (!submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 },
      );
    }

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

    const publishResult = await publishToAyrshare(body.schedule, {
      workspaceId: session.workspaceId,
      profileKey: workspace.ayrshare_profile_key,
      userId: session.userId,
      // The pipeline writes across tables by hand; it takes the raw client.
      db: admin,
    });

    await db
      .from("content_submissions")
      .update({ status: "published" })
      .eq("id", id);

    return NextResponse.json(publishResult, { status: 200 });
  },
);
