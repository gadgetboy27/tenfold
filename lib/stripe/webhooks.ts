import Stripe from 'stripe';
import { stripe } from './client';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export function verifyStripeWebhook(body: string, signature: string): Stripe.Event {
  return stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}

function creditGrantForPack(priceId: string): number | undefined {
  const map: Record<string, number> = {
    [process.env.STRIPE_PRICE_25CR!]: 25,
    [process.env.STRIPE_PRICE_100CR!]: 100,
    [process.env.STRIPE_PRICE_300CR!]: 300,
  };
  return map[priceId];
}

function creditsForSubscriptionTier(priceId: string): { tier: string; credits: number } | undefined {
  const map: Record<string, { tier: string; credits: number }> = {
    [process.env.STRIPE_PRICE_CREATOR_MONTHLY!]: { tier: 'creator', credits: 350 },
    [process.env.STRIPE_PRICE_BUSINESS_MONTHLY!]: { tier: 'business', credits: 1000 },
    [process.env.STRIPE_PRICE_AGENCY_MONTHLY!]: { tier: 'agency', credits: 3000 },
  };
  return map[priceId];
}

async function grantCredits(
  workspaceId: string,
  amount: number,
  description: string,
  stripePaymentIntentId?: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: account } = await admin
    .from('credit_accounts')
    .select('cached_balance')
    .eq('workspace_id', workspaceId)
    .single();

  if (!account) return;
  const newBalance = (account as { cached_balance: number }).cached_balance + amount;

  await admin.from('credit_transactions').insert({
    workspace_id: workspaceId,
    type: 'purchase',
    amount,
    balance_after: newBalance,
    description,
    stripe_payment_intent_id: stripePaymentIntentId ?? null,
  });

  await admin
    .from('credit_accounts')
    .update({ cached_balance: newBalance })
    .eq('workspace_id', workspaceId);
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const admin = createSupabaseAdminClient();

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'payment') break;

      const workspaceId = session.metadata?.workspaceId;
      const priceId = session.metadata?.priceId;
      if (!workspaceId || !priceId) break;

      const credits = creditGrantForPack(priceId);
      if (credits) {
        await grantCredits(
          workspaceId,
          credits,
          'Credit pack purchase',
          typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
        );
      }
      break;
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason === 'manual') break;

      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      const { data: sub } = await admin
        .from('subscriptions')
        .select('workspace_id, stripe_subscription_id')
        .eq('stripe_customer_id', customerId)
        .single();

      if (!sub) break;
      const s = sub as { workspace_id: string; stripe_subscription_id: string | null };
      if (!s.stripe_subscription_id) break;

      const invoiceSub = await stripe.subscriptions.retrieve(s.stripe_subscription_id);
      const priceId = invoiceSub.items.data[0]?.price?.id;
      if (!priceId) break;

      const result = creditsForSubscriptionTier(priceId);
      if (result) {
        await grantCredits(s.workspace_id, result.credits, 'Monthly subscription credits');
      }
      break;
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
      const priceId = stripeSub.items.data[0]?.price?.id;
      const tierResult = priceId ? creditsForSubscriptionTier(priceId) : undefined;
      const tier = tierResult?.tier ?? 'payg';

      const firstItem = stripeSub.items.data[0] as (typeof stripeSub.items.data[0]) & {
        current_period_start?: number;
        current_period_end?: number;
      };

      await admin
        .from('subscriptions')
        .update({
          stripe_subscription_id: stripeSub.id,
          tier,
          status: stripeSub.status,
          credits_per_period: tierResult?.credits ?? 0,
          current_period_start: firstItem.current_period_start
            ? new Date(firstItem.current_period_start * 1000).toISOString() : null,
          current_period_end: firstItem.current_period_end
            ? new Date(firstItem.current_period_end * 1000).toISOString() : null,
        })
        .eq('stripe_customer_id', customerId);
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
      await admin
        .from('subscriptions')
        .update({ tier: 'payg', status: 'canceled', credits_per_period: 0 })
        .eq('stripe_customer_id', customerId);
      break;
    }
  }
}
