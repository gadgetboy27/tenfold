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
    if (pages.length === 0) {
      return NextResponse.redirect(
        `${process.env.APP_URL}/${slug}/settings/social?error=facebook_no_pages`,
      );
    }

    // Default to the first page; the user can switch via the Page picker. Store
    // every managed page (with its permanent token) in metadata so switching
    // needs no re-auth.
    const page = pages[0];
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
    const ig = await getInstagramAccount(page.id, page.access_token);
    if (ig.account) {
      // Instagram uses the Facebook page's access token for all publishing calls
      await admin.from("social_profiles").upsert(
        {
          workspace_id: workspaceId,
          platform: "instagram",
          handle: ig.account.username,
          profile_display_name: ig.account.name ?? ig.account.username,
          platform_page_id: page.id, // needed to call the Graph API
          platform_account_id: ig.account.id, // IG Business Account ID
          access_token: page.access_token,
          connected_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id,platform" },
      );
    } else {
      // Don't leave them guessing. Connecting Facebook and silently getting no
      // Instagram — with no hint that the Page needs an Instagram Business
      // account attached — is indistinguishable from the product being broken.
      console.warn(
        `[Meta OAuth] no Instagram for page ${page.id}: ${ig.reason}${ig.detail ? ` — ${ig.detail}` : ""}`,
      );
    }

    const params = new URLSearchParams({
      connected: ig.account ? "facebook,instagram" : "facebook",
    });
    if (!ig.account) params.set("instagram", ig.reason);
    return NextResponse.redirect(
      `${process.env.APP_URL}/${slug}/settings/social?${params}`,
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
