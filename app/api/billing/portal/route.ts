import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getOrCreateStripeCustomer,
  createBillingPortalSession,
} from "@/lib/stripe/subscriptions";

// POST /api/billing/portal — open the Stripe Customer Portal for self-serve
// subscription management (change plan, update card, view invoices, cancel).
export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const customerId = await getOrCreateStripeCustomer(session.workspaceId);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
    const { url } = await createBillingPortalSession({
      customerId,
      returnUrl: `${appUrl}/${session.workspaceSlug}/settings/billing`,
    });

    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
