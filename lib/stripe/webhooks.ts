import Stripe from "stripe";
import { stripe } from "./client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { addonForPriceId } from "@/lib/billing/addons";

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

/**
 * workspace_addons.status is CHECK-constrained to active | past_due | canceled
 * (migration 0024), but Stripe reports more states than that. A raw write of
 * "unpaid" or "incomplete" is rejected by the database, so collapse Stripe's
 * set onto ours. Anything not entitled maps to "canceled", which
 * hasActiveAddon() denies; only past_due keeps its grace period.
 */
export function addonStatusFor(
  stripeStatus: string,
): "active" | "past_due" | "canceled" {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "past_due") return "past_due";
  return "canceled";
}

/**
 * supabase-js returns { error } rather than throwing, so an unchecked write
 * looks like success: the event is marked processed and Stripe never retries.
 * Throwing here makes the route record the failure and answer non-200.
 */
async function write(
  op: PromiseLike<{ error: { message: string } | null }>,
  what: string,
): Promise<void> {
  const { error } = await op;
  if (error) throw new Error(`${what} failed: ${error.message}`);
}

function isMissingResource(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "resource_missing";
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
      const workspaceId = session.metadata?.workspaceId;
      const priceId = session.metadata?.priceId;
      if (!workspaceId || !priceId) break;

      if (session.mode === "payment") {
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

      if (session.mode === "subscription") {
        // Add-on checkout (e.g. Blend Package) — a SECOND subscription beside
        // the workspace's main tier one. A tier-upgrade checkout is handled by
        // customer.subscription.created below instead (no addon match here).
        const addon = addonForPriceId(priceId);
        if (!addon) break;
        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;
        if (!subscriptionId) break;

        await write(
          admin.from("workspace_addons").upsert(
            {
              workspace_id: workspaceId,
              addon_key: addon.key,
              status: "active",
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: customerId ?? null,
            },
            { onConflict: "workspace_id,addon_key" },
          ),
          "add-on activation",
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
      break;
    }

    case "invoice.payment_failed": {
      // A declined renewal. Stripe moves the subscription to past_due (and
      // later canceled/unpaid) and also sends customer.subscription.updated,
      // but event order isn't guaranteed — so this records the subscription's
      // CURRENT status from Stripe rather than assuming "past_due", which means
      // a late or replayed failure can't mark a since-recovered subscription as
      // failing. Status only: tier and credits are left to the existing
      // subscription.updated / .deleted handlers and the invoice grant.
      const invoice = event.data.object as Stripe.Invoice;
      // Webhook payloads use the ENDPOINT's API version, not the SDK's: the
      // subscription id is under parent.subscription_details on 2025-03-31+
      // and on the invoice itself before that. Read both, or an older endpoint
      // silently never matches.
      const legacy = (
        invoice as unknown as { subscription?: string | { id: string } | null }
      ).subscription;
      const ref =
        invoice.parent?.subscription_details?.subscription ?? legacy ?? null;
      const subscriptionId = typeof ref === "string" ? ref : ref?.id;
      if (!subscriptionId) break;

      let current: Stripe.Subscription;
      try {
        current = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (err) {
        // Gone from Stripe (deleted, or another account/mode): nothing to
        // record, and customer.subscription.deleted owns that transition.
        // Throwing would 500 and make Stripe retry a permanent miss for days.
        if (isMissingResource(err)) break;
        throw err;
      }

      // Matched by subscription id so the tier row and an add-on row on the
      // same customer can never clobber each other; only one of these matches.
      await write(
        admin
          .from("subscriptions")
          .update({ status: current.status })
          .eq("stripe_subscription_id", subscriptionId),
        "subscription status",
      );
      await write(
        admin
          .from("workspace_addons")
          .update({ status: addonStatusFor(current.status) })
          .eq("stripe_subscription_id", subscriptionId),
        "add-on status",
      );
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

      const firstItem = stripeSub.items
        .data[0] as (typeof stripeSub.items.data)[0] & {
        current_period_start?: number;
        current_period_end?: number;
      };

      // Add-on subscription (e.g. Blend Package) — a workspace can hold this
      // AND its main tier subscription on the SAME Stripe customer at once, so
      // this must be matched by subscription id, never by customer id (which
      // the tier branch below uses and would otherwise clobber).
      const addon = priceId ? addonForPriceId(priceId) : undefined;
      if (addon) {
        await write(
          admin
            .from("workspace_addons")
            .update({
              status: addonStatusFor(stripeSub.status),
              current_period_end: firstItem.current_period_end
                ? new Date(firstItem.current_period_end * 1000).toISOString()
                : null,
            })
            .eq("stripe_subscription_id", stripeSub.id),
          "add-on update",
        );
        break;
      }

      // Not an add-on price — resolve as the main tier subscription. Only
      // touch `subscriptions` when the price is a RECOGNIZED tier price; an
      // unrecognized price must never silently downgrade the workspace to
      // payg (that was the pre-addon bug: any unmatched subscription event on
      // the customer reset tier).
      const tierResult = priceId
        ? creditsForSubscriptionTier(priceId)
        : undefined;
      if (!tierResult) break;

      await write(
        admin
          .from("subscriptions")
          .update({
            stripe_subscription_id: stripeSub.id,
            tier: tierResult.tier,
            status: stripeSub.status,
            credits_per_period: tierResult.credits,
            current_period_start: firstItem.current_period_start
              ? new Date(firstItem.current_period_start * 1000).toISOString()
              : null,
            current_period_end: firstItem.current_period_end
              ? new Date(firstItem.current_period_end * 1000).toISOString()
              : null,
          })
          .eq("stripe_customer_id", customerId),
        "subscription update",
      );
      break;
    }

    case "customer.subscription.deleted": {
      const stripeSub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof stripeSub.customer === "string"
          ? stripeSub.customer
          : stripeSub.customer.id;
      const priceId = stripeSub.items.data[0]?.price?.id;

      const addon = priceId ? addonForPriceId(priceId) : undefined;
      if (addon) {
        await write(
          admin
            .from("workspace_addons")
            .update({ status: "canceled" })
            .eq("stripe_subscription_id", stripeSub.id),
          "add-on cancellation",
        );
        break;
      }

      await write(
        admin
          .from("subscriptions")
          .update({ tier: "payg", status: "canceled", credits_per_period: 0 })
          .eq("stripe_customer_id", customerId),
        "subscription cancellation",
      );
      break;
    }
  }
}
