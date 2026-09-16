import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";

// POST /api/campaigns/[id]/approve — owner/admin only. Callable from draft OR
// pending_review, so an owner/admin can self-approve directly without the
// review round-trip (the whole point of the role gate: it restricts
// "member"-role publishing, not solo/owner workflows).
export const POST = withWorkspace<{ id: string }>(
  async (_req, { db, session, params }) => {
    if (session.role !== "owner" && session.role !== "admin") {
      return NextResponse.json(
        { error: "Only a workspace owner or admin can approve" },
        { status: 403 },
      );
    }

    const { data: updated, error } = await db
      .from("campaigns")
      .update({
        approval_status: "approved",
        approved_by: session.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", params.id)
      .neq("approval_status", "approved")
      .select("id, approval_status, approved_by, approved_at")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!updated) {
      return NextResponse.json(
        { error: "Campaign not found, or it's already approved" },
        { status: 404 },
      );
    }
    return NextResponse.json(updated);
  },
);
