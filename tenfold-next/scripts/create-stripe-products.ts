// Run with: npx dotenv -e .env -- npx tsx scripts/create-stripe-products.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PRODUCTS = [
  // ── Credit packs (one-off payments) ────────────────────────────
  {
    name: 'Starter Pack',
    description: '25 credits — enough for one full image campaign',
    mode: 'payment' as const,
    unit_amount: 500,   // NZD $5.00
    metadata: { credits: '25', type: 'pack' },
    envKey: 'STRIPE_PRICE_25CR',
  },
  {
    name: 'Standard Pack',
    description: '100 credits — approx. 5 full campaigns',
    mode: 'payment' as const,
    unit_amount: 1500,  // NZD $15.00
    metadata: { credits: '100', type: 'pack' },
    envKey: 'STRIPE_PRICE_100CR',
  },
  {
    name: 'Pro Pack',
    description: '300 credits — approx. 16 full campaigns',
    mode: 'payment' as const,
    unit_amount: 3500,  // NZD $35.00
    metadata: { credits: '300', type: 'pack' },
    envKey: 'STRIPE_PRICE_300CR',
  },
  // ── Subscriptions (monthly recurring) ──────────────────────────
  {
    name: 'Creator',
    description: '50 credits/month — solo operator, ~2 full campaigns',
    mode: 'subscription' as const,
    unit_amount: 1900,  // NZD $19.00/month
    metadata: { credits: '50', type: 'subscription' },
    envKey: 'STRIPE_PRICE_CREATOR_MONTHLY',
  },
  {
    name: 'Business',
    description: '200 credits/month — SMB, ~11 full campaigns',
    mode: 'subscription' as const,
    unit_amount: 5900,  // NZD $59.00/month
    metadata: { credits: '200', type: 'subscription' },
    envKey: 'STRIPE_PRICE_BUSINESS_MONTHLY',
  },
  {
    name: 'Agency',
    description: '600 credits/month — multi-brand, ~33 full campaigns',
    mode: 'subscription' as const,
    unit_amount: 14900, // NZD $149.00/month
    metadata: { credits: '600', type: 'subscription' },
    envKey: 'STRIPE_PRICE_AGENCY_MONTHLY',
  },
];

async function main() {
  const results: Record<string, string> = {};

  for (const product of PRODUCTS) {
    const stripeProduct = await stripe.products.create({
      name: product.name,
      description: product.description,
      metadata: product.metadata,
    });

    const price = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: product.unit_amount,
      currency: 'nzd',
      ...(product.mode === 'subscription' ? { recurring: { interval: 'month' } } : {}),
      metadata: product.metadata,
    });

    results[product.envKey] = price.id;
    console.log(`✓ ${product.name}: ${price.id}`);
  }

  console.log('\n── Add to .env ──────────────────────────────');
  for (const [key, val] of Object.entries(results)) {
    console.log(`${key}=${val}`);
  }
}

main().catch(console.error);
