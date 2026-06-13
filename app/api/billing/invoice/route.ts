import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { stripe } from "@/lib/stripe/client";

// GET /api/billing/invoice?txId=… — returns the Stripe-hosted receipt URL for a
// purchase transaction (printable / saveable as a branded PDF). The lookup is
// workspace-scoped via `db`, so callers can only fetch their own receipts.
export const GET = withWorkspace(async (req, { db }) => {
  const txId = new URL(req.url).searchParams.get("txId");
  if (!txId) {
    return NextResponse.json({ error: "Missing txId" }, { status: 400 });
  }

  const { data: tx } = await db
    .from("credit_transactions")
    .select("stripe_payment_intent_id")
    .eq("id", txId)
    .single();

  const pi = (tx as { stripe_payment_intent_id: string | null } | null)
    ?.stripe_payment_intent_id;
  if (!pi) {
    return NextResponse.json(
      { error: "No receipt available for this transaction" },
      { status: 404 },
    );
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(pi, {
      expand: ["latest_charge"],
    });
    const charge = intent.latest_charge as { receipt_url?: string } | null;
    const url = charge?.receipt_url;
    if (!url) {
      return NextResponse.json(
        { error: "Receipt isn't ready yet — try again shortly." },
        { status: 404 },
      );
    }
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: "Could not fetch the receipt." },
      { status: 502 },
    );
  }
});
