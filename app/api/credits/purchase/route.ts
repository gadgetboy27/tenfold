import { NextResponse } from "next/server";
import { withWorkspace } from "@/lib/api/with-workspace";
import { getOrCreateStripeCustomer } from "@/lib/stripe/subscriptions";
import { createCheckoutSession } from "@/lib/stripe/checkout";
import { purchaseCreditsSchema } from "@/lib/validation/schemas";

export const POST = withWorkspace(async (req, { session }) => {
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
});
