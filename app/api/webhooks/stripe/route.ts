import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyStripeWebhook, handleStripeEvent } from "@/lib/stripe/webhooks";

// Raw body required for Stripe signature verification — do not use req.json()
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature") ?? "";

  let event;
  try {
    event = verifyStripeWebhook(body, signature);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // Log first for idempotency — clean duplicates are acknowledged, not reprocessed
  const { error: logErr } = await admin.from("webhook_logs").insert({
    source: "stripe",
    event_id: event.id,
    payload: JSON.parse(body) as Record<string, unknown>,
  });

  if (logErr) {
    if (logErr.code !== "23505") {
      return NextResponse.json({ error: logErr.message }, { status: 500 });
    }
    // Seen before. Only a CLEAN earlier run is a true duplicate; a row that
    // recorded an error means Stripe is retrying a failure we asked it to
    // retry, so process again (every handler is idempotent).
    const { data: prior } = await admin
      .from("webhook_logs")
      .select("processed, error")
      .eq("event_id", event.id)
      .maybeSingle();
    const p = prior as { processed: boolean; error: string | null } | null;
    if (!p || (p.processed && !p.error)) return NextResponse.json({ ok: true });
  }

  let processingError: string | undefined;
  try {
    await handleStripeEvent(event);
  } catch (err) {
    processingError = err instanceof Error ? err.message : "Unknown error";
  }

  await admin
    .from("webhook_logs")
    .update({ processed: true, error: processingError ?? null })
    .eq("event_id", event.id);

  if (processingError) {
    return NextResponse.json({ error: processingError }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
