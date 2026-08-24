import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getLinkedInOAuthUrl } from "@/lib/social/direct/linkedin";
import { signOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    if (!process.env.LINKEDIN_CLIENT_ID) {
      return NextResponse.json(
        {
          error:
            "LinkedIn publishing isn't configured on this deployment yet.",
        },
        { status: 503 },
      );
    }
    // Same signed state as the Meta and Reddit flows — carries the workspaceId
    // through the round-trip so a forged callback can't attach an account to
    // someone else's workspace.
    return NextResponse.redirect(
      getLinkedInOAuthUrl(signOAuthState(session.workspaceId)),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
