import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getProvider } from "@/lib/social/providers";
import { signOAuthState } from "@/lib/social/oauth-state";
import "@/lib/social/register";

// GET /api/social/connect/:provider — start the OAuth round-trip.
//
// One route for every directly-integrated network. Facebook keeps its own
// route (/connect/facebook) because its callback also enumerates Pages and
// exchanges for long-lived Page tokens, which is Meta-specific work.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
) {
  try {
    const { provider: id } = await ctx.params;
    const provider = getProvider(id);
    if (!provider) {
      return NextResponse.json(
        { error: `${id} isn't a direct integration yet.` },
        { status: 404 },
      );
    }
    const session = await getSession(req);
    // The signed state carries the workspaceId through the provider and back,
    // so the callback can trust which workspace to attach the account to.
    // Without it, anyone could forge a callback and connect their own account
    // to someone else's workspace.
    return NextResponse.redirect(
      provider.authUrl(signOAuthState(session.workspaceId)),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
