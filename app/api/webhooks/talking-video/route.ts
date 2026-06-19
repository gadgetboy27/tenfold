import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { handleTalkingWebhook } from "@/lib/fal/talking-pipeline";

// Dedicated webhook for the talking-video pipeline. Separate from
// /api/webhooks/fal so the two flows never interfere. fal calls this once per
// stage with ?j=<jobId>&stage=tts|lipsync.
export async function POST(req: Request) {
  const raw: unknown = await req.json();
  const admin = createSupabaseAdminClient();

  const requestId = (raw as Record<string, unknown>)?.request_id as
    | string
    | undefined;
  if (!requestId) return NextResponse.json({ ok: true });

  // 1. Log FIRST (idempotency). Duplicate webhooks hit the unique constraint.
  const { error: logErr } = await admin.from("webhook_logs").insert({
    source: "fal-talking",
    event_id: requestId,
    payload: raw as Record<string, unknown>,
  });
  if (logErr) {
    if (logErr.code === "23505") return NextResponse.json({ ok: true }); // duplicate
    return NextResponse.json({ error: logErr.message }, { status: 500 });
  }

  // 2. Advance the pipeline. Never throw a 4xx — fal would retry forever.
  const url = new URL(req.url);
  await handleTalkingWebhook({
    jobId: url.searchParams.get("j"),
    stage: url.searchParams.get("stage"),
    requestId,
    raw,
  });

  await admin
    .from("webhook_logs")
    .update({ processed: true })
    .eq("event_id", requestId);
  return NextResponse.json({ ok: true });
}
