import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// POST /api/campaigns/[id]/submit-review — any workspace member moves a
// campaign from draft into the review queue. Only valid from draft (a
// campaign already pending/approved doesn't need re-submitting).
export const POST = withWorkspace<{ id: string }>(
  async (_req, { db, params }) => {
    const { data: updated, error } = await db
      .from("campaigns")
      .update({
        approval_status: "pending_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .eq("approval_status", "draft")
      .select("id, approval_status")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) {
      return NextResponse.json(
        { error: "Campaign not found, or it's not in draft" },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  },
);
