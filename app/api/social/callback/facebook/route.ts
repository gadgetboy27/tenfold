import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  exchangeCodeForToken,
  getLongLivedUserToken,
  getUserPages,
  getInstagramAccount,
} from '@/lib/social/meta';

export async function GET(req: Request) {
  const url         = new URL(req.url);
  const code        = url.searchParams.get('code');
  const state       = url.searchParams.get('state');  // workspaceId
  const metaError   = url.searchParams.get('error');

  // Resolve workspace slug for redirect URL — needed before we can redirect anywhere
  const admin = createSupabaseAdminClient();

  async function workspaceSlug(): Promise<string | null> {
    if (!state) return null;
    const { data } = await admin.from('workspaces').select('slug').eq('id', state).single();
    return (data as { slug: string } | null)?.slug ?? null;
  }

  if (metaError || !code || !state) {
    const slug = await workspaceSlug();
    const base = slug ? `${process.env.APP_URL}/${slug}` : process.env.APP_URL!;
    return NextResponse.redirect(`${base}/settings/social?error=facebook_denied`);
  }

  let slug: string | null = null;
  try {
    slug = await workspaceSlug();
    if (!slug) throw new Error('Workspace not found');

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

    // Use the first page (MVP — we'll add a picker if users have multiple pages)
    const page = pages[0];

    // 4. Upsert Facebook profile with permanent page access token
    await admin.from('social_profiles').upsert(
      {
        workspace_id:         state,
        platform:             'facebook',
        handle:               page.id,
        profile_display_name: page.name,
        platform_page_id:     page.id,
        access_token:         page.access_token,
        connected_at:         new Date().toISOString(),
      },
      { onConflict: 'workspace_id,platform' },
    );

    // 5. Check for linked Instagram Business account on that page
    const igAccount = await getInstagramAccount(page.id, page.access_token);
    if (igAccount) {
      // Instagram uses the Facebook page's access token for all publishing calls
      await admin.from('social_profiles').upsert(
        {
          workspace_id:         state,
          platform:             'instagram',
          handle:               igAccount.username,
          profile_display_name: igAccount.name ?? igAccount.username,
          platform_page_id:     page.id,           // needed to call the Graph API
          platform_account_id:  igAccount.id,      // IG Business Account ID
          access_token:         page.access_token,
          connected_at:         new Date().toISOString(),
        },
        { onConflict: 'workspace_id,platform' },
      );
    }

    const connected = igAccount ? 'facebook,instagram' : 'facebook';
    return NextResponse.redirect(
      `${process.env.APP_URL}/${slug}/settings/social?connected=${connected}`,
    );
  } catch (err) {
    console.error('[Meta OAuth callback]', err instanceof Error ? err.message : err);
    const base = slug ? `${process.env.APP_URL}/${slug}` : process.env.APP_URL!;
    return NextResponse.redirect(`${base}/settings/social?error=facebook_failed`);
  }
}
