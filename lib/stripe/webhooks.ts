import Stripe from "stripe";
import { stripe } from "./client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * How long a past_due subscription keeps its tier after a failed payment.
 *
 * Roughly matches Stripe's default dunning window (retries over ~2 weeks), so
 * the retries get a chance to succeed before we take anything away. Data is
 * never deleted on downgrade — the workspace simply falls back to free-tier
 * entitlements, and paying restores it instantly.
 */
export const PAYMENT_GRACE_DAYS = 7;

/** A fresh grace deadline, PAYMENT_GRACE_DAYS from now. */
export function graceDeadline(from: Date = new Date()): string {
  return new Date(
    from.getTime() + PAYMENT_GRACE_DAYS * 86_400_000,
  ).toISOString();
}

/**
 * What `grace_until` should become for a subscription moving to `status`.
 *
 * Returns `{}` to leave it alone — an empty spread, so callers can merge it into
 * an update without branching.
 *
 * The rules exist because Stripe's events race. A decline emits both
 * invoice.payment_failed and customer.subscription.updated, in either order,
 * and every retry emits payment_failed again:
 *
 *  - opening a window only when there ISN'T one keeps retries from rolling the
 *    deadline forward forever, which would mean the downgrade never lands;
 *  - clearing it the moment the subscription is healthy again stops a spent
 *    window being mistaken for an open one the next time a card fails.
 */
async function resolveGrace(
  customerId: string,
  status: string,
): Promise<{ grace_until?: string | null }> {
  const admin = createSupabaseAdminClient();

  if (status === "active" || status === "trialing") {
    return { grace_until: null };
  }
  if (status !== "past_due") return {};

  const { data } = await admin
    .from("subscriptions")
    .select("grace_until")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  const open = (data as { grace_until: string | null } | null)?.grace_until;
  return open ? {} : { grace_until: graceDeadline() };
}

export function verifyStripeWebhook(
  body: string,
  signature: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    body,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET!,
  );
}

function creditGrantForPack(priceId: string): number | undefined {
  const map: Record<string, number> = {
    [process.env.STRIPE_PRICE_25CR!]: 25,
    [process.env.STRIPE_PRICE_100CR!]: 100,
    [process.env.STRIPE_PRICE_300CR!]: 300,
  };
  return map[priceId];
}

function creditsForSubscriptionTier(
  priceId: string,
): { tier: string; credits: number } | undefined {
  const map: Record<string, { tier: string; credits: number }> = {
    [process.env.STRIPE_PRICE_CREATOR_MONTHLY!]: {
      tier: "creator",
      credits: 350,
    },
    [process.env.STRIPE_PRICE_BUSINESS_MONTHLY!]: {
      tier: "business",
      credits: 1000,
    },
    [process.env.STRIPE_PRICE_AGENCY_MONTHLY!]: {
      tier: "agency",
      credits: 3000,
    },
  };
  return map[priceId];
}

async function grantCredits(
  workspaceId: string,
  amount: number,
  description: string,
  idempotencyKey?: string,
): Promise<void> {
  const admin = createSupabaseAdminClient();

  // Atomic + idempotent in one DB statement (lock account row → dedup on the
  // Stripe payment/invoice id → ledger insert + balance bump). Replaces the old
  // read-modify-write, which lost concurrent grants and wrote the balance
  // directly (CLAUDE.md §2). Idempotency protects against webhook retries and
  // any manual backfill ever double-crediting the same purchase.
  const { error } = await admin.rpc("grant_credits", {
    p_workspace_id: workspaceId,
    p_amount: amount,
    p_description: description,
    p_idempotency_key: idempotencyKey ?? null,
  });

  if (error) {
    // Throw so the webhook returns non-200 and Stripe retries — the grant is
    // idempotent, so a retry can't double-credit.
    console.error("grant_credits RPC error:", error);
    throw new Error(`grant_credits failed: ${error.message}`);
  }
}

export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  const admin = createSupabaseAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "payment") break;

      const workspaceId = session.metadata?.workspaceId;
      const priceId = session.metadata?.priceId;
      if (!workspaceId || !priceId) break;

      const credits = creditGrantForPack(priceId);
      if (credits) {
        await grantCredits(
          workspaceId,
          credits,
          "Credit pack purchase",
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : undefined,
        );
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason === "manual") break;

      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;
      if (!customerId) break;

      const { data: sub } = await admin
        .from("subscriptions")
        .select("workspace_id, stripe_subscription_id")
        .eq("stripe_customer_id", customerId)
        .single();

      if (!sub) break;
      const s = sub as {
        workspace_id: string;
        stripe_subscription_id: string | null;
      };
      if (!s.stripe_subscription_id) break;

      const invoiceSub = await stripe.subscriptions.retrieve(
        s.stripe_subscription_id,
      );
      const priceId = invoiceSub.items.data[0]?.price?.id;
      if (!priceId) break;

      const result = creditsForSubscriptionTier(priceId);
      if (result) {
        // One grant per invoice — guards against the same renewal being credited
        // twice (Stripe replays, or both invoice + subscription events firing).
        await grantCredits(
          s.workspace_id,
          result.credits,
          "Monthly subscription credits",
          invoice.id,
        );
      }

      // They paid — any grace from an earlier failure is spent. Leaving it set
      // would hand out a second free window the next time a card blips.
      await admin
        .from("subscriptions")
        .update({ grace_until: null })
        .eq("stripe_customer_id", customerId);
      break;
    }

    // A renewal (or the first charge) was declined. Stripe has already flipped
    // the subscription to past_due, and it retries on its own dunning schedule
    // for days. Hold the tier for the same window rather than downgrading on the
    // first blip: this is usually an expired card, and yanking video mid-work
    // before the customer has even seen an email is how you lose one.
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId =
        typeof invoice.customer === "string"
          ? invoice.customer
          : invoice.customer?.id;
      if (!customerId) break;

      // Same helper as subscription.updated, so the two paths cannot disagree
      // about the window. It already declines to extend an open one — Stripe
      // fires this on every dunning retry, and refreshing the deadline each
      // time would postpone the downgrade indefinitely.
      const grace = await resolveGrace(customerId, "past_due");
      await admin
        .from("subscriptions")
        .update({ status: "past_due", ...grace })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof stripeSub.customer === "string"
          ? stripeSub.customer
          : stripeSub.customer.id;
      const priceId = stripeSub.items.data[0]?.price?.id;
      const tierResult = priceId
        ? creditsForSubscriptionTier(priceId)
        : undefined;
      const tier = tierResult?.tier ?? "payg";

      const firstItem = stripeSub.items
        .data[0] as (typeof stripeSub.items.data)[0] & {
        current_period_start?: number;
        current_period_end?: number;
      };

      // Keep grace consistent with the status we're about to write. Stripe
      // fires this event AND invoice.payment_failed on a decline, in no
      // guaranteed order, so this can't assume the other one has run:
      //  - arriving first with past_due and no window would downgrade instantly
      //    until payment_failed landed;
      //  - returning to active (e.g. they paid in the portal) must clear the
      //    window, or the next decline sees a stale one, skips opening a fresh
      //    one, and downgrades on the spot.
      const graceUpdate = await resolveGrace(customerId, stripeSub.status);

      await admin
        .from("subscriptions")
        .update({
          stripe_subscription_id: stripeSub.id,
          tier,
          status: stripeSub.status,
          credits_per_period: tierResult?.credits ?? 0,
          current_period_start: firstItem.current_period_start
            ? new Date(firstItem.current_period_start * 1000).toISOString()
            : null,
          current_period_end: firstItem.current_period_end
            ? new Date(firstItem.current_period_end * 1000).toISOString()
            : null,
          ...graceUpdate,
        })
        .eq("stripe_customer_id", customerId);
      break;
    }

    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof stripeSub.customer === "string"
          ? stripeSub.customer
          : stripeSub.customer.id;
      await admin
        .from("subscriptions")
        .update({ tier: "payg", status: "canceled", credits_per_period: 0 })
        .eq("stripe_customer_id", customerId);
      break;
    }
  }
}
