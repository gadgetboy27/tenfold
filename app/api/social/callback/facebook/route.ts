import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  exchangeCodeForToken,
  getLongLivedUserToken,
  getUserPages,
  getInstagramAccount,
} from "@/lib/social/meta";
import { verifyOAuthState } from "@/lib/social/oauth-state";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // Verify the signed state and recover the workspaceId — a forged/expired state
  // resolves to null and is treated as a denied connection (CSRF protection).
  const workspaceId = verifyOAuthState(url.searchParams.get("state"));
  const metaError = url.searchParams.get("error");

  // Resolve workspace slug for redirect URL — needed before we can redirect anywhere
  const admin = createSupabaseAdminClient();

  async function workspaceSlug(): Promise<string | null> {
    if (!workspaceId) return null;
    const { data, error } = await admin
      .from("workspaces")
      .select("slug")
      .eq("id", workspaceId)
      .single();
    if (error)
      console.error("[Meta OAuth] workspace lookup failed:", error.message);
    return (data as { slug: string } | null)?.slug ?? null;
  }

  if (metaError || !code || !workspaceId) {
    const slug = await workspaceSlug();
    const base = slug ? `${process.env.APP_URL}/${slug}` : process.env.APP_URL!;
    return NextResponse.redirect(
      `${base}/settings/social?error=facebook_denied`,
    );
  }

  let slug: string | null = null;
  try {
    slug = await workspaceSlug();
    if (!slug) throw new Error("Workspace not found");

    // 1. Exchange auth code → short-lived user token
    const shortToken = await exchangeCodeForToken(code);

    // 2. Exchange → long-lived user token (60 days).
    //    Page access tokens from a long-lived user token never expire.
    const userToken = await getLongLivedUserToken(shortToken);

    // 3. Discover all Facebook Pages this user manages
    const pages = await getUserPages(userToken);
    // Diagnostic (ids/names only, never tokens): if this logs fewer Pages than
    // the user ticked in Facebook, the grant didn't propagate — a Meta-side
    // caching / Business-Manager scope issue, not our storage.
    console.error(
      "[Meta OAuth] pages from /me/accounts:",
      pages.length,
      pages.map((p) => `${p.name}(${p.id})`).join(", "),
    );
    if (pages.length === 0) {
      return NextResponse.redirect(
        `${process.env.APP_URL}/${slug}/settings/social?error=facebook_no_pages`,
      );
    }

    // Preserve the Page the user previously chose across reconnects — otherwise
    // every re-auth silently resets the active Page back to pages[0] (which is
    // whatever Meta returns first, often not the intended one). Only fall back
    // to pages[0] on a genuinely new connection or if the old Page is gone.
    const { data: existing } = await admin
      .from("social_profiles")
      .select("platform_page_id")
      .eq("workspace_id", workspaceId)
      .eq("platform", "facebook")
      .maybeSingle();
    const priorPageId = (existing as { platform_page_id: string | null } | null)
      ?.platform_page_id;
    const page = pages.find((p) => p.id === priorPageId) ?? pages[0];
    const facebook_pages = pages.map((p) => ({
      id: p.id,
      name: p.name,
      access_token: p.access_token,
    }));

    // 4. Upsert Facebook profile with permanent page access token
    await admin.from("social_profiles").upsert(
      {
        workspace_id: workspaceId,
        platform: "facebook",
        handle: page.id,
        profile_display_name: page.name,
        platform_page_id: page.id,
        access_token: page.access_token,
        metadata: { facebook_pages },
        connected_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,platform" },
    );

    // 5. Check for linked Instagram Business account on that page
    const igAccount = await getInstagramAccount(page.id, page.access_token);
    if (igAccount) {
      // Instagram uses the Facebook page's access token for all publishing calls
      await admin.from("social_profiles").upsert(
        {
          workspace_id: workspaceId,
          platform: "instagram",
          handle: igAccount.username,
          profile_display_name: igAccount.name ?? igAccount.username,
          platform_page_id: page.id, // needed to call the Graph API
          platform_account_id: igAccount.id, // IG Business Account ID
          access_token: page.access_token,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,platform" },
      );
    }

    const connected = igAccount ? "facebook,instagram" : "facebook";
    return NextResponse.redirect(
      `${process.env.APP_URL}/${slug}/settings/social?connected=${connected}`,
    );
  } catch (err) {
    console.error(
      "[Meta OAuth callback]",
      err instanceof Error ? err.message : err,
    );
    const base = slug ? `${process.env.APP_URL}/${slug}` : process.env.APP_URL!;
    return NextResponse.redirect(
      `${base}/settings/social?error=facebook_failed`,
    );
  }
}
