import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// POST /api/campaigns/[id]/submit-review — any workspace member moves a
// campaign from draft into the review queue. Only valid from draft (a
// campaign already pending/approved doesn't need re-submitting).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const admin = createSupabaseAdminClient();

    const { data: updated, error } = await admin
      .from("campaigns")
      .update({
        approval_status: "pending_review",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", session.workspaceId)
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status =
      msg === "Unauthorized" ? 401 : msg === "Not a workspace member" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
