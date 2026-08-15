import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPinterestOAuthUrl } from "@/lib/social/direct/pinterest";
import { signOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    if (!process.env.PINTEREST_APP_ID) {
      return NextResponse.json(
        {
          error:
            "Pinterest publishing isn't configured on this deployment yet.",
        },
        { status: 503 },
      );
    }
    return NextResponse.redirect(
      getPinterestOAuthUrl(signOAuthState(session.workspaceId)),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: msg },
      { status: msg === "Unauthorized" ? 401 : 500 },
    );
  }
}
