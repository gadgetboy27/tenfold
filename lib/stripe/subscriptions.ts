import { stripe } from "./client";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getOrCreateStripeCustomer(
  workspaceId: string,
): Promise<string> {
  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", workspaceId)
    .single();

  const e = existing as { stripe_customer_id: string | null } | null;
  if (e?.stripe_customer_id) return e.stripe_customer_id;

  const { data: workspace } = await admin
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .single();

  const customer = await stripe.customers.create({
    name: (workspace as { name: string } | null)?.name,
    metadata: { workspaceId },
  });

  await admin.from("subscriptions").upsert(
    {
      workspace_id: workspaceId,
      stripe_customer_id: customer.id,
      tier: "payg",
      status: "active",
      credits_per_period: 0,
    },
    { onConflict: "workspace_id" },
  );

  return customer.id;
}

// Stripe-hosted Customer Portal — lets subscribers self-serve: change plan,
// update card, view invoices, cancel. Returns a one-time URL to redirect to.
export async function createBillingPortalSession(opts: {
  customerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const session = await stripe.billingPortal.sessions.create({
    customer: opts.customerId,
    return_url: opts.returnUrl,
  });
  return { url: session.url };
}
