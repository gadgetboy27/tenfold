const BACKEND = import.meta.env.VITE_API_URL ?? 'https://marketyou-mu.vercel.app';
const LOCAL_BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

export interface ApiOptions extends RequestInit {
  token?: string;
  workspaceSlug?: string;
}

/**
 * Call the Vercel backend.
 * Automatically attaches the Bearer token and x-workspace-slug header.
 */
export async function api(path: string, options: ApiOptions = {}): Promise<Response> {
  const { token, workspaceSlug, ...fetchOpts } = options;
  return fetch(`${BACKEND}${path}`, {
    ...fetchOpts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(workspaceSlug ? { 'x-workspace-slug': workspaceSlug } : {}),
      ...(fetchOpts.headers ?? {}),
    },
  });
}

/**
 * Call the local Express API (prompt analysis, dev tools).
 */
export async function localApi(path: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${LOCAL_BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}
