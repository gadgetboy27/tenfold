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

        await admin.from("workspace_addons").upsert(
          {
            workspace_id: workspaceId,
            addon_key: addon.key,
            status: "active",
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId ?? null,
          },
          { onConflict: "workspace_id,addon_key" },
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
        await admin
          .from("workspace_addons")
          .update({
            status: stripeSub.status,
            current_period_end: firstItem.current_period_end
              ? new Date(firstItem.current_period_end * 1000).toISOString()
              : null,
          })
          .eq("stripe_subscription_id", stripeSub.id);
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

      await admin
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
        .eq("stripe_customer_id", customerId);
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
        await admin
          .from("workspace_addons")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", stripeSub.id);
        break;
      }

      await admin
        .from("subscriptions")
        .update({ tier: "payg", status: "canceled", credits_per_period: 0 })
        .eq("stripe_customer_id", customerId);
      break;
    }
  }
}
