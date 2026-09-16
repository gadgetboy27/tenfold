import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import {
  getOrCreateStripeCustomer,
  createBillingPortalSession,
} from "@/lib/stripe/subscriptions";

// POST /api/billing/portal — open the Stripe Customer Portal for self-serve
// subscription management (change plan, update card, view invoices, cancel).
export const POST = withWorkspace(async (_req, { session }) => {
  const customerId = await getOrCreateStripeCustomer(session.workspaceId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const { url } = await createBillingPortalSession({
    customerId,
    returnUrl: `${appUrl}/${session.workspaceSlug}/settings/billing`,
  });

  return NextResponse.json({ url });
});
