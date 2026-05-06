import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveWorkspaceSlug } from '@/lib/workspace';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  const token = data.session?.access_token;
  if (!token) {
    return NextResponse.redirect(`${origin}/login?error=no_token`);
  }

  // Discover existing workspace OR provision one for cold-start users
  const slug = await resolveWorkspaceSlug(data.user, token);

  if (!slug) {
    return NextResponse.redirect(`${origin}/login?error=workspace_unavailable`);
  }

  // Persist the resolved slug to user metadata so subsequent password logins skip the backend roundtrip
  const currentMeta = data.user.user_metadata?.workspace_slug as string | undefined;
  if (currentMeta !== slug) {
    try {
      const admin = createSupabaseAdminClient();
      await admin.auth.admin.updateUserById(data.user.id, {
        user_metadata: { workspace_slug: slug },
      });
    } catch { /* non-fatal */ }
  }

  return NextResponse.redirect(`${origin}/${slug}`);
}
