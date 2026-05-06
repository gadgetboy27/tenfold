import { createBrowserClient } from '@supabase/ssr';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) return null;
  return createBrowserClient(url, key, {
    auth: {
      storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}

interface ApiOptions extends RequestInit {
  workspaceSlug?: string;
  token?: string;
}

export async function api(path: string, options: ApiOptions = {}): Promise<Response> {
  const { workspaceSlug, token: explicitToken, ...fetchOptions } = options;

  let token = explicitToken;
  if (!token) {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (workspaceSlug) headers['x-workspace-slug'] = workspaceSlug;

  return fetch(path, { ...fetchOptions, headers });
}
