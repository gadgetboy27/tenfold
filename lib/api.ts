import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public-client";

function getSupabaseClient() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } =
    getPublicEnv();
  if (!url || !key) return null;
  return createBrowserClient(url, key);
}

interface ApiOptions extends RequestInit {
  workspaceSlug?: string;
  token?: string;
}

export async function api(
  path: string,
  options: ApiOptions = {},
): Promise<Response> {
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
    ...(fetchOptions.headers as Record<string, string>),
  };
  // Let the browser set the multipart boundary for FormData (file uploads);
  // only default to JSON for everything else.
  if (!(fetchOptions.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (workspaceSlug) headers["x-workspace-slug"] = workspaceSlug;

  const base = process.env.NEXT_PUBLIC_API_URL ?? "";
  return fetch(`${base}${path}`, { ...fetchOptions, headers });
}
