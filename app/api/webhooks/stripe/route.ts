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

  // Log first, so a crash mid-processing still leaves a record (CLAUDE.md §5).
  const { error: logErr } = await admin.from("webhook_logs").insert({
    source: "stripe",
    event_id: event.id,
    payload: JSON.parse(body) as Record<string, unknown>,
  });

  if (logErr) {
    if (logErr.code !== "23505") {
      return NextResponse.json({ error: logErr.message }, { status: 500 });
    }
    // Seen before — but "seen" is not "handled". Skipping every duplicate meant
    // a failed attempt could never be retried: the row already existed, so
    // Stripe's redelivery was answered `ok` and dropped. A transient blip while
    // handling invoice.payment_succeeded therefore lost the event permanently,
    // and the customer paid without ever receiving their credits.
    const { data: prior } = await admin
      .from("webhook_logs")
      .select("processed")
      .eq("event_id", event.id)
      .maybeSingle();
    if ((prior as { processed: boolean } | null)?.processed) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    // Fall through and try again. Re-running is safe: the grants are keyed on
    // the invoice/session id, so a repeat is a no-op rather than a double credit.
  }

  let processingError: string | undefined;
  try {
    await handleStripeEvent(event);
  } catch (err) {
    processingError = err instanceof Error ? err.message : "Unknown error";
  }

  await admin
    .from("webhook_logs")
    // processed = it actually worked. Marking a failure processed is what made
    // the retry above unreachable.
    .update({ processed: !processingError, error: processingError ?? null })
    .eq("event_id", event.id);

  if (processingError) {
    // 500 asks Stripe to redeliver; the row stays unprocessed so it will.
    return NextResponse.json({ error: processingError }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
