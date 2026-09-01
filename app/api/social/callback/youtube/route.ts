import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordSocialEvent } from "@/lib/social/audit";
import {
  exchangeYouTubeCode,
  getYouTubeChannel,
} from "@/lib/social/direct/youtube";
import { verifyOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const workspaceId = verifyOAuthState(url.searchParams.get("state"));
  const oauthError = url.searchParams.get("error");

  const admin = createSupabaseAdminClient();

  async function workspaceSlug(): Promise<string | null> {
    if (!workspaceId) return null;
    const { data } = await admin
      .from("workspaces")
      .select("slug")
      .eq("id", workspaceId)
      .single();
    return (data as { slug: string } | null)?.slug ?? null;
  }

  const slug = await workspaceSlug();
  const base = slug ? `${process.env.APP_URL}/${slug}` : process.env.APP_URL!;

  if (oauthError || !code || !workspaceId) {
    return NextResponse.redirect(
      `${base}/settings/social?error=youtube_denied`,
    );
  }

  try {
    const tokens = await exchangeYouTubeCode(code);

    // Without a refresh token the connection dies in an hour and can only be
    // revived after the user manually revokes access — see the access_type and
    // prompt params in getYouTubeOAuthUrl. Fail the connect loudly instead of
    // storing something that quietly stops working.
    if (!tokens.refreshToken) {
      throw new Error(
        "Google did not return a refresh token — revoke PrettyMuch at myaccount.google.com/permissions and connect again.",
      );
    }

    const channel = await getYouTubeChannel(tokens.accessToken);

    const { error } = await admin.from("social_profiles").upsert(
      {
        workspace_id: workspaceId,
        platform: "youtube",
        handle: channel.title,
        profile_display_name: channel.title,
        platform_account_id: channel.id,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: tokens.expiresAt.toISOString(),
        connected_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,platform" },
    );
    if (error) throw new Error(error.message);

    // Security log: a connected account is standing permission to post in

    // this business's name. See lib/social/audit.ts.

    await recordSocialEvent(admin, { workspaceId }, "youtube", "connected");

    return NextResponse.redirect(`${base}/settings/social?connected=youtube`);
  } catch (err) {
    console.error(
      "[YouTube OAuth] connect failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.redirect(
      `${base}/settings/social?error=youtube_failed`,
    );
  }
}
