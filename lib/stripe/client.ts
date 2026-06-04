import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return stripeClient;
}

// For backwards compatibility
export const stripe = new Proxy({} as Stripe, {
  get: (_, prop) => {
    return (getStripeClient() as any)[prop];
  },
});
