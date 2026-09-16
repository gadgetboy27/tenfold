import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// POST /api/campaigns/[id]/reject — owner/admin only. Sends a pending_review
// campaign back to draft ("changes requested") rather than leaving the
// submitter stuck with no way to revise and resubmit.
export const POST = withWorkspace<{ id: string }>(
  async (_req, { db, session, params }) => {
    if (session.role !== "owner" && session.role !== "admin") {
      return NextResponse.json(
        { error: "Only a workspace owner or admin can request changes" },
        { status: 403 },
      );
    }

    const { data: updated, error } = await db
      .from("campaigns")
      .update({
        approval_status: "draft",
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("approval_status", "pending_review")
      .select("id, approval_status")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) {
      return NextResponse.json(
        { error: "Campaign not found, or it's not pending review" },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  },
);
