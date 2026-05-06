import type { User } from '@supabase/supabase-js';

const API_URL = process.env.VITE_API_URL ?? '';

function pickSlug(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (typeof j.slug === 'string' && j.slug) return j.slug;
  const ws = j.workspace as Record<string, unknown> | undefined;
  if (ws && typeof ws.slug === 'string' && ws.slug) return ws.slug;
  const arr = Array.isArray(j) ? j : (j.workspaces as unknown[] | undefined);
  if (Array.isArray(arr) && arr.length > 0) {
    const first = arr[0] as Record<string, unknown>;
    if (typeof first.slug === 'string' && first.slug) return first.slug;
  }
  return null;
}

/** GET the user's existing workspace from the Vercel backend. */
async function discoverFromBackend(token: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  for (const path of ['/api/workspaces/me', '/api/workspaces']) {
    try {
      const res = await fetch(`${API_URL}${path}`, { headers });
      if (res.ok) {
        const slug = pickSlug(await res.json().catch(() => null));
        if (slug) return slug;
      }
    } catch { /* try next */ }
  }
  return null;
}

/** Ask the Vercel backend to provision a new workspace. */
async function provisionOnBackend(
  token: string,
  payload: { name: string; slug: string },
): Promise<string | null> {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Preferred: dev/setup endpoint that handles full first-time provisioning
  try {
    const res = await fetch(`${API_URL}/api/dev/provision-workspace`, {
      method: 'POST', headers, body: JSON.stringify(payload),
    });
    if (res.ok) {
      const slug = pickSlug(await res.json().catch(() => null));
      if (slug) return slug;
    }
  } catch { /* fall through */ }

  // Fallback: standard create endpoint
  try {
    const res = await fetch(`${API_URL}/api/workspaces`, {
      method: 'POST', headers, body: JSON.stringify(payload),
    });
    if (res.ok) {
      const slug = pickSlug(await res.json().catch(() => null));
      if (slug) return slug;
    }
  } catch { /* fall through */ }

  return null;
}

function buildSlugCandidate(user: User): { name: string; slug: string } {
  const email = user.email ?? '';
  const name =
    (user.user_metadata?.full_name as string | undefined) ??
    email.split('@')[0] ??
    'my-workspace';
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'workspace';
  return { name, slug };
}

/**
 * Resolve the user's real workspace slug, in order of preference:
 *   1. `user_metadata.workspace_slug` (fast path — already provisioned)
 *   2. Backend GET — discover existing workspace
 *   3. Backend POST — provision a new workspace (cold-start case)
 *
 * Returns `null` if every path fails. Callers should redirect to an error page.
 * `"test-workspace"` in metadata is treated as invalid and skipped.
 */
export async function resolveWorkspaceSlug(
  user: User,
  token: string,
): Promise<string | null> {
  // 1. Fast path: trust user metadata if it looks valid
  const meta =
    (user.user_metadata?.workspace_slug as string | undefined) ??
    (user.user_metadata?.workspaceSlug as string | undefined);
  if (meta && meta !== 'test-workspace') {
    return meta;
  }

  // 2. Backend discovery
  const discovered = await discoverFromBackend(token);
  if (discovered) return discovered;

  // 3. Backend provisioning (cold-start)
  const candidate = buildSlugCandidate(user);
  const provisioned = await provisionOnBackend(token, candidate);
  if (provisioned) return provisioned;

  return null;
}
