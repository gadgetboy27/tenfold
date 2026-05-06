import { stripe } from './client';
import { db } from '@/db';
import { subscriptions, workspaces } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getOrCreateStripeCustomer(workspaceId: string): Promise<string> {
  const existing = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.workspaceId, workspaceId),
  });

  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });

  const customer = await stripe.customers.create({
    name: workspace?.name,
    metadata: { workspaceId },
  });

  await db
    .insert(subscriptions)
    .values({
      workspaceId,
      stripeCustomerId: customer.id,
      tier: 'payg',
      status: 'active',
      creditsPerPeriod: 0,
    })
    .onConflictDoUpdate({
      target: subscriptions.workspaceId,
      set: { stripeCustomerId: customer.id, updatedAt: new Date() },
    });

  return customer.id;
}
