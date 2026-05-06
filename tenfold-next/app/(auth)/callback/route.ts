import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const API_URL = process.env.VITE_API_URL ?? '';

/** Ask the Vercel backend for the authed user's workspace slug. */
async function fetchWorkspaceSlug(token: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Try singular endpoint first
  try {
    const res = await fetch(`${API_URL}/api/workspaces/me`, { headers });
    if (res.ok) {
      const j = await res.json() as Record<string, unknown>;
      const slug =
        (j.slug as string | undefined) ??
        ((j.workspace as Record<string, unknown> | undefined)?.slug as string | undefined);
      if (slug) return slug;
    }
  } catch { /* continue */ }

  // Try list endpoint
  try {
    const res = await fetch(`${API_URL}/api/workspaces`, { headers });
    if (res.ok) {
      const j = await res.json() as unknown;
      const arr = Array.isArray(j) ? j : (j as Record<string, unknown>).workspaces;
      if (Array.isArray(arr) && arr.length > 0) {
        const slug = (arr[0] as Record<string, unknown>).slug as string | undefined;
        if (slug) return slug;
      }
    }
  } catch { /* continue */ }

  return null;
}

/** Ask the Vercel backend to provision a new workspace for a first-time user. */
async function provisionWorkspace(
  token: string,
  payload: { name: string; slug: string },
): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const j = await res.json() as Record<string, unknown>;
      return (j.slug as string | undefined) ?? payload.slug;
    }
  } catch { /* continue */ }
  return null;
}

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

  const user = data.user;
  const token = data.session?.access_token;

  if (!token) {
    return NextResponse.redirect(`${origin}/login?error=no_token`);
  }

  // 1. Check if user already has a workspace on the Vercel backend
  let slug = await fetchWorkspaceSlug(token);

  // 2. First login — provision workspace on the Vercel backend
  if (!slug) {
    const email = user.email ?? '';
    const baseName =
      (user.user_metadata?.full_name as string | undefined) ??
      email.split('@')[0] ??
      'my-workspace';
    const candidate = baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);

    slug = await provisionWorkspace(token, { name: baseName, slug: candidate });
  }

  if (!slug) {
    // Backend didn't return a slug — redirect with an error the user can see
    return NextResponse.redirect(`${origin}/login?error=workspace_unavailable`);
  }

  // 3. Store the real slug in Supabase user metadata so password login stays in sync
  try {
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { workspace_slug: slug },
    });
  } catch { /* non-fatal */ }

  return NextResponse.redirect(`${origin}/${slug}`);
}
