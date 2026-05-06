import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { db } from '@/db';
import { workspaces, workspaceMembers, creditAccounts, creditTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

const API_URL = process.env.VITE_API_URL ?? '';

/** Ask the Vercel backend for the authed user's workspace slug. */
async function fetchWorkspaceSlugFromBackend(token: string): Promise<string | null> {
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    const res = await fetch(`${API_URL}/api/workspaces/me`, { headers });
    if (res.ok) {
      const j = await res.json() as Record<string, unknown>;
      const slug = (j.slug as string | undefined) ?? ((j.workspace as Record<string, unknown> | undefined)?.slug as string | undefined);
      if (slug) return slug;
    }
  } catch { /* continue */ }

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

/** Ask the Vercel backend to provision a new workspace. */
async function provisionWorkspaceOnBackend(
  token: string,
  payload: { name: string; slug: string },
): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
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

  // ── 1. Check Vercel backend first (source of truth) ─────────────────────
  if (token) {
    const backendSlug = await fetchWorkspaceSlugFromBackend(token);
    if (backendSlug) {
      // Keep local DB in sync
      try {
        const existing = await db.query.workspaceMembers.findFirst({
          where: eq(workspaceMembers.userId, user.id),
        });
        if (!existing) {
          const workspaceId = uuidv4();
          await db.transaction(async (tx) => {
            await tx.insert(workspaces).values({ id: workspaceId, name: backendSlug, slug: backendSlug, ownerId: user.id });
            await tx.insert(workspaceMembers).values({ workspaceId, userId: user.id, role: 'owner' });
          }).catch(() => {});
        }
      } catch { /* non-fatal */ }

      // Store in metadata so password login also picks it up
      try {
        const adminClient = createSupabaseAdminClient();
        await adminClient.auth.admin.updateUserById(user.id, { user_metadata: { workspace_slug: backendSlug } });
      } catch { /* non-fatal */ }

      return NextResponse.redirect(`${origin}/${backendSlug}`);
    }
  }

  // ── 2. Check local DB (returning user who skipped backend) ───────────────
  const existing = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.userId, user.id),
    with: { workspace: true } as never,
  });

  if (existing) {
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, user.id),
    });
    const slug = workspace?.slug ?? '';

    // Try to also create on backend if we have a token
    if (token && slug) {
      await provisionWorkspaceOnBackend(token, { name: slug, slug });
    }

    return NextResponse.redirect(`${origin}/${slug}`);
  }

  // ── 3. First login — provision workspace ─────────────────────────────────
  const workspaceId = uuidv4();
  const email = user.email ?? '';
  const baseName = (user.user_metadata?.full_name as string | undefined)
    ?? email.split('@')[0]
    ?? 'My Workspace';
  const slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    + '-'
    + workspaceId.slice(0, 6);

  // Provision on Vercel backend first
  let finalSlug = slug;
  if (token) {
    const backendSlug = await provisionWorkspaceOnBackend(token, { name: baseName, slug });
    if (backendSlug) finalSlug = backendSlug;
  }

  // Provision in local DB
  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({ id: workspaceId, name: baseName, slug: finalSlug, ownerId: user.id });
    await tx.insert(workspaceMembers).values({ workspaceId, userId: user.id, role: 'owner' });
    await tx.insert(creditAccounts).values({ workspaceId, cachedBalance: 50 });
    await tx.insert(creditTransactions).values({
      workspaceId, type: 'grant', amount: 50, balanceAfter: 50, description: 'Welcome credits',
    });
  });

  // Store slug in Supabase user metadata
  try {
    const adminClient = createSupabaseAdminClient();
    await adminClient.auth.admin.updateUserById(user.id, {
      user_metadata: { workspace_slug: finalSlug },
    });
  } catch { /* non-fatal */ }

  return NextResponse.redirect(`${origin}/${finalSlug}`);
}
