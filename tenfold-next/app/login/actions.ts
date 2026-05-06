'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const API_URL = process.env.VITE_API_URL ?? '';

/** Try to discover the user's real workspace slug from the Vercel backend. */
async function fetchWorkspaceSlugFromBackend(token: string): Promise<string | null> {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Try /api/workspaces/me (single workspace for the authed user)
  try {
    const res = await fetch(`${API_URL}/api/workspaces/me`, { headers });
    if (res.ok) {
      const json = await res.json() as Record<string, unknown>;
      const slug =
        (json.slug as string | undefined) ??
        ((json.workspace as Record<string, unknown> | undefined)?.slug as string | undefined);
      if (slug) return slug;
    }
  } catch { /* continue */ }

  // Try /api/workspaces (list)
  try {
    const res = await fetch(`${API_URL}/api/workspaces`, { headers });
    if (res.ok) {
      const json = await res.json() as unknown;
      const arr = Array.isArray(json)
        ? json
        : (json as Record<string, unknown>).workspaces;
      if (Array.isArray(arr) && arr.length > 0) {
        const slug = (arr[0] as Record<string, unknown>).slug as string | undefined;
        if (slug) return slug;
      }
    }
  } catch { /* continue */ }

  return null;
}

export async function signInWithPassword(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const token = data.session?.access_token;

  // 1. Ask the Vercel backend for the user's real workspace slug
  if (token) {
    const backendSlug = await fetchWorkspaceSlugFromBackend(token);
    if (backendSlug) {
      redirect(`/${backendSlug}`);
    }
  }

  // 2. Fall back to workspace_slug stored in Supabase user metadata
  const metaSlug =
    (data.user?.user_metadata?.workspace_slug as string | undefined) ??
    (data.user?.user_metadata?.workspaceSlug as string | undefined);

  if (metaSlug && metaSlug !== 'test-workspace') {
    redirect(`/${metaSlug}`);
  }

  // 3. Last resort: user ID (always valid as a stable identifier)
  redirect(`/${data.user.id}`);
}

export async function sendMagicLink(formData: FormData) {
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Email is required' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
