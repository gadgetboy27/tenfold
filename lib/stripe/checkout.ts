import { stripe } from "./client";
import { ADDONS } from "@/lib/billing/addons";

function isSubscriptionPrice(priceId: string): boolean {
  return [
    process.env.STRIPE_PRICE_CREATOR_MONTHLY,
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
    process.env.STRIPE_PRICE_AGENCY_MONTHLY,
    // Add-ons (e.g. the Blend Package) are recurring too — a second, separate
    // Stripe subscription alongside the workspace's main tier subscription.
    ...ADDONS.map((a) => a.priceId),
  ].includes(priceId);
}

export async function createCheckoutSession(opts: {
  workspaceId: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const mode = isSubscriptionPrice(opts.priceId) ? "subscription" : "payment";
  const session = await stripe.checkout.sessions.create({
    customer: opts.customerId,
    mode,
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    // priceId in metadata so the webhook can map payment → credit grant
    metadata: { workspaceId: opts.workspaceId, priceId: opts.priceId },
    // One-off credit packs: generate a proper (branded) invoice so customers
    // get a downloadable PDF. Subscriptions invoice automatically, and Stripe
    // rejects invoice_creation for subscription mode.
    ...(mode === "payment" ? { invoice_creation: { enabled: true } } : {}),
  });

  return { url: session.url!, sessionId: session.id };
}
