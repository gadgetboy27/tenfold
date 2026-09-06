import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canManageConnections, CONNECTION_FORBIDDEN } from "@/lib/social/authz";
import { isPlatformConfigured } from "@/lib/social/configured";
import { getMetaOAuthUrl } from "@/lib/social/meta";
import { signOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    // Connecting sets where the whole workspace publishes — owner/admin only.
    // See lib/social/authz.ts for why this matches the publish approval roles.
    if (!canManageConnections(session)) {
      return NextResponse.json(CONNECTION_FORBIDDEN, { status: 403 });
    }
    // The one connect route that used to skip this. getMetaOAuthUrl reads
    // META_APP_ID with a non-null assertion, so without the check a deployment
    // missing it redirected to Facebook with `client_id=undefined` and let Meta
    // show the error — while every other platform answered a clean 503. Reading
    // the same isPlatformConfigured the settings badge reads is what stops the
    // UI advertising a connection this deployment cannot start.
    if (!isPlatformConfigured("facebook")) {
      return NextResponse.json(
        {
          error: "Facebook publishing isn't configured on this deployment yet.",
        },
        { status: 503 },
      );
    }
    // Signed OAuth state carries the workspaceId through the round-trip so the
    // callback can trust which workspace to attach pages to (CSRF protection).
    const url = getMetaOAuthUrl(
      signOAuthState(session.workspaceId, session.userId),
    );
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
