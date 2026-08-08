import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env/public-client";

// One client for the whole app. A fresh client per call meant every request
// could kick off its own token refresh, so a slow or stuck refresh multiplied
// instead of being shared.
let cachedClient: ReturnType<typeof createBrowserClient> | null = null;

function getSupabaseClient() {
  if (cachedClient) return cachedClient;
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: key } =
    getPublicEnv();
  if (!url || !key) return null;
  cachedClient = createBrowserClient(url, key);
  return cachedClient;
}

/** How long to wait for a cached session before giving up on the bearer token. */
const SESSION_TIMEOUT_MS = 4000;

/**
 * The access token, or undefined if one can't be obtained promptly.
 *
 * `getSession()` can hang indefinitely when the auth client is stuck refreshing
 * — and because EVERY call in the app awaits it, a single stuck promise froze
 * the entire product: Generate stayed disabled with `generating` true, the
 * credit meter sat at 0, the gallery and past projects stayed empty, and
 * nothing ever reached the server. No error, nothing in the logs, just a dead
 * UI.
 *
 * Falling back to no bearer token is safe: the server accepts cookie auth too
 * (`getSession` in lib/auth/session.ts tries the Authorization header first,
 * then cookies), and cookies are sent automatically on same-origin requests.
 * A slow auth client should degrade, never wedge.
 */
async function getAccessToken(): Promise<string | undefined> {
  const supabase = getSupabaseClient();
  if (!supabase) return undefined;
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), SESSION_TIMEOUT_MS),
      ),
    ]);
    return result?.data?.session?.access_token;
  } catch {
    return undefined; // never let auth trouble block the request itself
  }
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

  const token = explicitToken ?? (await getAccessToken());

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
