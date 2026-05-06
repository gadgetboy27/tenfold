import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getOrCreateStripeCustomer } from '@/lib/stripe/subscriptions';
import { createCheckoutSession } from '@/lib/stripe/checkout';
import { purchaseCreditsSchema } from '@/lib/validation/schemas';

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const { priceId } = purchaseCreditsSchema.parse(await req.json());

    const customerId = await getOrCreateStripeCustomer(session.workspaceId);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const billingPath = `/${session.workspaceSlug}/settings/billing`;

    const { url } = await createCheckoutSession({
      workspaceId: session.workspaceId,
      customerId,
      priceId,
      successUrl: `${appUrl}${billingPath}?success=1`,
      cancelUrl: `${appUrl}${billingPath}`,
    });

    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
