import type { User } from '@supabase/supabase-js';

const API_URL = process.env.VITE_API_URL ?? '';

function pickSlug(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (typeof j.slug === 'string' && j.slug) return j.slug;
  const ws = j.workspace as Record<string, unknown> | undefined;
  if (ws && typeof ws.slug === 'string' && ws.slug) return ws.slug;
  return null;
}

async function getExisting(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) return pickSlug(await res.json().catch(() => null));
  } catch { /* fall through */ }
  return null;
}

async function provision(token: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces/provision`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.ok) return pickSlug(await res.json().catch(() => null));
  } catch { /* fall through */ }
  return null;
}

/**
 * Resolve the user's real workspace slug, in order of preference:
 *   1. `user_metadata.workspace_slug` (fast path — no network)
 *   2. GET  /api/workspaces/me       — discover existing workspace
 *   3. POST /api/workspaces/provision — idempotent create-or-return
 *
 * Returns `null` if every path fails. Callers should redirect to an error page.
 * The literal `"test-workspace"` in metadata is treated as invalid and skipped.
 */
export async function resolveWorkspaceSlug(
  user: User,
  token: string,
): Promise<string | null> {
  const meta =
    (user.user_metadata?.workspace_slug as string | undefined) ??
    (user.user_metadata?.workspaceSlug as string | undefined);
  if (meta && meta !== 'test-workspace') return meta;

  return (await getExisting(token)) ?? (await provision(token));
}
