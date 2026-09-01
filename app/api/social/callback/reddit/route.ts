import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { encryptProfileTokens } from "@/lib/social/token-crypto";
import { recordSocialEvent } from "@/lib/social/audit";
import {
  exchangeRedditCode,
  getRedditUsername,
} from "@/lib/social/direct/reddit";
import { verifyOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // Forged or expired state resolves to null and is treated as a denial.
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
    return NextResponse.redirect(`${base}/settings/social?error=reddit_denied`);
  }

  try {
    const tokens = await exchangeRedditCode(code);
    const username = await getRedditUsername(tokens.accessToken);

    const { error } = await admin.from("social_profiles").upsert(
      encryptProfileTokens({
        workspace_id: workspaceId,
        platform: "reddit",
        handle: `u/${username}`,
        profile_display_name: username,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expires_at: tokens.expiresAt.toISOString(),
        connected_at: new Date().toISOString(),
      }),
      { onConflict: "workspace_id,platform" },
    );
    if (error) throw new Error(error.message);

    // No subreddit is chosen yet, and a submission can't go anywhere without
    // one — send the user straight to the picker rather than letting them
    // discover the gap at publish time.
    // Security log: a connected account is standing permission to post in
    // this business's name. See lib/social/audit.ts.
    await recordSocialEvent(admin, { workspaceId }, "reddit", "connected");
    return NextResponse.redirect(
      `${base}/settings/social?connected=reddit&needs=subreddit`,
    );
  } catch (err) {
    console.error(
      "[Reddit OAuth] connect failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.redirect(`${base}/settings/social?error=reddit_failed`);
  }
}
