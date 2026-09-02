import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canManageConnections, CONNECTION_FORBIDDEN } from "@/lib/social/authz";
import { isPlatformConfigured } from "@/lib/social/configured";
import { getPinterestOAuthUrl } from "@/lib/social/direct/pinterest";
import { signOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    // Connecting sets where the whole workspace publishes — owner/admin only.
    // See lib/social/authz.ts for why this matches the publish approval roles.
    if (!canManageConnections(session)) {
      return NextResponse.json(CONNECTION_FORBIDDEN, { status: 403 });
    }
    if (!isPlatformConfigured("pinterest")) {
      return NextResponse.json(
        {
          error:
            "Pinterest publishing isn't configured on this deployment yet.",
        },
        { status: 503 },
      );
    }
    return NextResponse.redirect(
      getPinterestOAuthUrl(signOAuthState(session.workspaceId, session.userId)),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
