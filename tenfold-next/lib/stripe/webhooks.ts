import Stripe from 'stripe';
import { getStripe } from './client';
import { db } from '@/db';
import { creditAccounts, creditTransactions, subscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export function verifyStripeWebhook(body: string, signature: string): Stripe.Event {
  return getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}

// These are evaluated at call time so env vars are always populated
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
    [process.env.STRIPE_PRICE_CREATOR_MONTHLY!]: { tier: 'creator', credits: 50 },
    [process.env.STRIPE_PRICE_BUSINESS_MONTHLY!]: { tier: 'business', credits: 200 },
    [process.env.STRIPE_PRICE_AGENCY_MONTHLY!]: { tier: 'agency', credits: 600 },
  };
  return map[priceId];
}

async function grantCredits(
  workspaceId: string,
  amount: number,
  description: string,
  stripePaymentIntentId?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.workspaceId, workspaceId))
      .for('update');

    if (!account) return;

    const newBalance = account.cachedBalance + amount;

    await tx.insert(creditTransactions).values({
      workspaceId,
      type: 'purchase',
      amount,
      balanceAfter: newBalance,
      description,
      stripePaymentIntentId,
    });

    await tx
      .update(creditAccounts)
      .set({ cachedBalance: newBalance, updatedAt: new Date() })
      .where(eq(creditAccounts.workspaceId, workspaceId));
  });
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Only handle one-off credit pack purchases here;
      // subscription initial payment is handled via invoice.payment_succeeded
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
      if (invoice.billing_reason === 'manual') break; // skip manual invoices

      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;

      const sub = await db.query.subscriptions.findFirst({
        where: eq(subscriptions.stripeCustomerId, customerId),
      });
      if (!sub) break;

      // Retrieve subscription to get current price (SDK v22: line items no longer carry price directly)
      // Use the stripeSubscriptionId we already have stored rather than invoice.subscription (removed in v22)
      const stripeSubId = sub.stripeSubscriptionId;
      if (!stripeSubId) break;

      const invoiceSub = await getStripe().subscriptions.retrieve(stripeSubId);
      const priceId = invoiceSub.items.data[0]?.price?.id;
      if (!priceId) break;

      const result = creditsForSubscriptionTier(priceId);
      if (result) {
        await grantCredits(sub.workspaceId, result.credits, 'Monthly subscription credits');
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

      // current_period_* removed from Stripe.Subscription type in SDK v22 — read from items
      const firstItem = stripeSub.items.data[0] as (typeof stripeSub.items.data[0]) & {
        current_period_start?: number;
        current_period_end?: number;
      };
      const periodStart = firstItem.current_period_start
        ? new Date(firstItem.current_period_start * 1000)
        : undefined;
      const periodEnd = firstItem.current_period_end
        ? new Date(firstItem.current_period_end * 1000)
        : undefined;

      await db
        .update(subscriptions)
        .set({
          stripeSubscriptionId: stripeSub.id,
          tier,
          status: stripeSub.status,
          creditsPerPeriod: tierResult?.credits ?? 0,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.stripeCustomerId, customerId));
      break;
    }

    case 'customer.subscription.deleted': {
      const stripeSub = event.data.object as Stripe.Subscription;
      const customerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer.id;
      await db
        .update(subscriptions)
        .set({ tier: 'payg', status: 'canceled', creditsPerPeriod: 0, updatedAt: new Date() })
        .where(eq(subscriptions.stripeCustomerId, customerId));
      break;
    }
  }
}
