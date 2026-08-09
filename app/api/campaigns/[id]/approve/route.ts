import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST /api/campaigns/[id]/approve — owner/admin only. Callable from draft OR
// pending_review, so an owner/admin can self-approve directly without the
// review round-trip (the whole point of the role gate: it restricts
// "member"-role publishing, not solo/owner workflows).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession(req);
    if (session.role !== "owner" && session.role !== "admin") {
      return NextResponse.json(
        { error: "Only a workspace owner or admin can approve" },
        { status: 403 },
      );
    }
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: updated, error } = await admin
      .from("campaigns")
      .update({
        approval_status: "approved",
        approved_by: session.userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status =
      msg === "Unauthorized"
        ? 401
        : msg === "Not a workspace member"
          ? 403
          : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
