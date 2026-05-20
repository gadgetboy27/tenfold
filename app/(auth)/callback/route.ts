import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  // Build a temporary redirect so we can write session cookies onto it directly.
  // Using next/headers cookies() then returning a separate NextResponse loses the cookies.
  const response = NextResponse.redirect(`${origin}/login?error=auth_failed`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return response; // already points to /login?error=auth_failed
  }

  const user = data.user;
  const admin = createSupabaseAdminClient();

  // Check if user already has a workspace
  const { data: existing } = await admin
    .from('workspace_members')
    .select('workspace_id, workspaces!inner(slug)')
    .eq('user_id', user.id)
    .limit(1);

  // Helper: update the Location header on the existing response so session cookies are preserved
  const redirectTo = (url: string) => {
    response.headers.set('Location', url);
    return response;
  };

  if (existing?.length) {
    const row = existing[0] as unknown as { workspace_id: string; workspaces: { slug: string }[] };
    const slug = row.workspaces[0]?.slug ?? '';
    return redirectTo(`${origin}/${slug}`);
  }

  // First login — provision workspace + credit account via admin client
  const workspaceId = uuidv4();
  const email = user.email ?? '';
  const baseName =
    (user.user_metadata?.full_name as string | undefined) ??
    email.split('@')[0] ??
    'My Workspace';
  const slug =
    baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) +
    '-' +
    workspaceId.slice(0, 6);

  const { error: wsErr } = await admin
    .from('workspaces')
    .insert({ id: workspaceId, name: baseName, slug, owner_id: user.id });
  if (wsErr) return redirectTo(`${origin}/login?error=workspace_failed`);

  await admin.from('workspace_members').insert({ workspace_id: workspaceId, user_id: user.id, role: 'owner' });
  await admin.from('credit_accounts').insert({ workspace_id: workspaceId, cached_balance: 50 });
  await admin.from('credit_transactions').insert({
    workspace_id: workspaceId,
    type: 'grant',
    amount: 50,
    balance_after: 50,
    description: 'Welcome credits',
  });

  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { workspace_slug: slug },
  });

  return redirectTo(`${origin}/${slug}`);
}
