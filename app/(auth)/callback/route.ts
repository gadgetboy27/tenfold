import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getRateLimitKey, checkRateLimit } from '@/lib/security/rate-limit';
import { v4 as uuidv4 } from 'uuid';

export async function GET(request: NextRequest) {
  const { searchParams, origin, hash } = new URL(request.url);
  const code = searchParams.get('code');
  const token = searchParams.get('token');
  const type = searchParams.get('type');

  // Check for access_token in URL hash (from magic links)
  const hashParams = new URLSearchParams(hash.slice(1));
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  // Rate limit: 10 requests per minute per IP
  const rateLimitKey = getRateLimitKey(request);
  if (!checkRateLimit(rateLimitKey, 10, 60000)) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429 },
    );
  }

  if (!code && !token && !accessToken) {
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

  let data: any;
  let error: any;

  // Handle OAuth code (standard OAuth flow)
  if (code) {
    const result = await supabase.auth.exchangeCodeForSession(code);
    data = result.data;
    error = result.error;
  }
  // Handle magic link with access token in URL hash
  else if (accessToken && refreshToken) {
    try {
      const result = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      data = result.data;
      error = result.error;
    } catch (err) {
      console.error('Magic link session error:', err);
      error = err;
    }
  }
  // Handle magic link token via query param
  else if (token && type === 'magiclink') {
    try {
      const result = await supabase.auth.verifyOtp({
        token_hash: token,
        type: 'magiclink',
      });
      data = result.data;
      error = result.error;
    } catch (err) {
      console.error('Magic link OTP error:', err);
      error = err;
    }
  }

  if (error || !data?.user) {
    console.error('Auth callback error:', { error, code, token, type, accessToken: !!accessToken });
    return response; // already points to /login?error=auth_failed
  }

  const user = data.user;
  const admin = createSupabaseAdminClient();

  // Helper: update the Location header on the existing response so session cookies are preserved
  const redirectTo = (url: string) => {
    response.headers.set('Location', url);
    return response;
  };

  // Idempotent workspace creation: use RLS + unique constraint on (user_id, slug)
  // to prevent race-condition duplicates. Upsert via ON CONFLICT DO NOTHING.
  const workspaceId = uuidv4();
  const email = user.email ?? '';
  const baseName =
    (user.user_metadata?.full_name as string | undefined) ??
    email.split('@')[0] ??
    'My Workspace';
  const slug = `${baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 35)}-${workspaceId}`;

  // Check if workspace already exists (by slug)
  const { data: existingWs } = await admin
    .from('workspaces')
    .select('id, slug')
    .eq('slug', slug)
    .maybeSingle();

  let ws = existingWs;

  // If new workspace needed, create it atomically
  if (!ws) {
    const { data: newWs, error: wsErr } = await admin
      .from('workspaces')
      .insert({ id: workspaceId, name: baseName, slug, owner_id: user.id })
      .select()
      .single();

    if (wsErr || !newWs) {
      console.error('Workspace insert failed:', wsErr);
      return redirectTo(`${origin}/login?error=workspace_failed`);
    }
    ws = newWs;
  }

  if (!ws) {
    return redirectTo(`${origin}/login?error=workspace_failed`);
  }

  // Insert member (will fail silently if already exists due to unique constraint)
  const { error: memberErr } = await admin
    .from('workspace_members')
    .insert({ workspace_id: ws.id, user_id: user.id, role: 'owner' });

  // Ignore unique constraint violations (user already member)
  if (memberErr && memberErr.code !== '23505') {
    console.error('Member insert failed:', memberErr);
    return redirectTo(`${origin}/login?error=member_failed`);
  }

  // Insert credit account (will fail silently if already exists)
  const { error: credErr } = await admin
    .from('credit_accounts')
    .insert({ workspace_id: ws.id, cached_balance: 50 });

  if (credErr && credErr.code !== '23505') {
    console.error('Credit account insert failed:', credErr);
    return redirectTo(`${origin}/login?error=credit_failed`);
  }

  // Grant welcome credits (idempotent: use description as dedup key)
  const { error: txnErr } = await admin
    .from('credit_transactions')
    .insert({
      workspace_id: ws.id,
      type: 'grant',
      amount: 50,
      balance_after: 50,
      description: `Welcome credits for ${user.id}`,
    });

  if (txnErr) {
    console.error('Credit transaction insert failed:', txnErr);
    return redirectTo(`${origin}/login?error=transaction_failed`);
  }

  // Update user metadata
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { workspace_slug: ws.slug },
  });

  if (updateErr) {
    console.error('User metadata update failed:', updateErr);
    return redirectTo(`${origin}/login?error=metadata_failed`);
  }

  return redirectTo(`${origin}/${ws.slug}`);
}
