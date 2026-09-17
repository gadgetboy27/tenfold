import { NextResponse } from "next/server";
import { z } from "zod";
import { isOpsRequest } from "@/lib/api/ops-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// The feedback queue, across every workspace — for whoever works through it.
//
// Auth is the ops bearer (CRON_SECRET), the same gate as the crons and the
// verbose health check, because this is vendor-side: a workspace owner sees
// their own reports through RLS; this sees all of them.
//
//   GET  /api/ops/feedback?status=new|seen|done|all&limit=50
//   PATCH /api/ops/feedback  { id, status, note? }

export async function GET(req: Request) {
  if (!isOpsRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "new";
  const limit = Math.min(200, Number(url.searchParams.get("limit")) || 50);

  const admin = createSupabaseAdminClient();
  let q = admin
    .from("feedback")
    .select(
      "id, workspace_id, user_email, category, message, reply_to, context, status, note, created_at, updated_at, workspaces(slug)",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status !== "all") q = q.eq("status", status);
  const { data, error } = await q;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ status, count: data?.length ?? 0, items: data });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "seen", "done"]),
  note: z.string().max(1000).optional(),
});

export async function PATCH(req: Request) {
  if (!isOpsRequest(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { id, status, note } = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("feedback")
    .update({
      status,
      ...(note !== undefined ? { note } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, status, note")
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}
