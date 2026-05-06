import { NextResponse } from 'next/server';
import { db } from '@/db';
import { webhookLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { verifyStripeWebhook, handleStripeEvent } from '@/lib/stripe/webhooks';

// Raw body required for signature verification — do not use req.json()
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  let event;
  try {
    event = verifyStripeWebhook(body, signature);
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Log first for idempotency — duplicate events are silently dropped
  const logged = await db
    .insert(webhookLogs)
    .values({
      source: 'stripe',
      eventId: event.id,
      payload: JSON.parse(body) as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning();

  if (logged.length === 0) return NextResponse.json({ ok: true });

  let processingError: string | undefined;
  try {
    await handleStripeEvent(event);
  } catch (err) {
    processingError = err instanceof Error ? err.message : 'Unknown error';
  }

  await db
    .update(webhookLogs)
    .set({ processed: true, error: processingError })
    .where(eq(webhookLogs.eventId, event.id));

  if (processingError) {
    return NextResponse.json({ error: processingError }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
