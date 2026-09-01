import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canManageConnections, CONNECTION_FORBIDDEN } from "@/lib/social/authz";
import { getTikTokOAuthUrl } from "@/lib/social/direct/tiktok";
import { signOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    // Connecting sets where the whole workspace publishes — owner/admin only.
    // See lib/social/authz.ts for why this matches the publish approval roles.
    if (!canManageConnections(session)) {
      return NextResponse.json(CONNECTION_FORBIDDEN, { status: 403 });
    }
    if (!process.env.TIKTOK_CLIENT_KEY) {
      return NextResponse.json(
        { error: "TikTok publishing isn't configured on this deployment yet." },
        { status: 503 },
      );
    }
    // Signed state carries the workspaceId through the round-trip, so a forged
    // callback can't attach an account to someone else's workspace.
    return NextResponse.redirect(
      getTikTokOAuthUrl(signOAuthState(session.workspaceId)),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
