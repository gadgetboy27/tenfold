import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { recordSocialEvent } from "@/lib/social/audit";
import {
  exchangeLinkedInCode,
  getLinkedInIdentity,
} from "@/lib/social/direct/linkedin";
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
    return NextResponse.redirect(
      `${base}/settings/social?error=linkedin_denied`,
    );
  }

  try {
    const tokens = await exchangeLinkedInCode(code);
    const identity = await getLinkedInIdentity(tokens.accessToken);

    const { error } = await admin.from("social_profiles").upsert(
      {
        workspace_id: workspaceId,
        platform: "linkedin",
        handle: identity.name,
        profile_display_name: identity.name,
        // The member id is what every post is authored as — without it stored,
        // publishing would need an extra identity call on every send.
        platform_account_id: identity.memberId,
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

    await recordSocialEvent(admin, { workspaceId }, "linkedin", "connected");

    return NextResponse.redirect(`${base}/settings/social?connected=linkedin`);
  } catch (err) {
    console.error(
      "[LinkedIn OAuth] connect failed:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.redirect(
      `${base}/settings/social?error=linkedin_failed`,
    );
  }
}
