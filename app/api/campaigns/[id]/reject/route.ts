import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST /api/campaigns/[id]/reject — owner/admin only. Sends a pending_review
// campaign back to draft ("changes requested") rather than leaving the
// submitter stuck with no way to revise and resubmit.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession(req);
    if (session.role !== "owner" && session.role !== "admin") {
      return NextResponse.json(
        { error: "Only a workspace owner or admin can request changes" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: updated, error } = await admin
      .from("campaigns")
      .update({
        approval_status: "draft",
        approved_by: null,
        approved_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status =
      msg === "Unauthorized" ? 401 : msg === "Not a workspace member" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
