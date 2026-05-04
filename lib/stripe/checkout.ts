import { stripe } from './client';

function isSubscriptionPrice(priceId: string): boolean {
  return [
    process.env.STRIPE_PRICE_CREATOR_MONTHLY,
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY,
    process.env.STRIPE_PRICE_AGENCY_MONTHLY,
  ].includes(priceId);
}

export async function createCheckoutSession(opts: {
  workspaceId: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const session = await stripe.checkout.sessions.create({
    customer: opts.customerId,
    mode: isSubscriptionPrice(opts.priceId) ? 'subscription' : 'payment',
    line_items: [{ price: opts.priceId, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    // priceId in metadata so the webhook can map payment → credit grant
    metadata: { workspaceId: opts.workspaceId, priceId: opts.priceId },
  });

  return { url: session.url!, sessionId: session.id };
}
