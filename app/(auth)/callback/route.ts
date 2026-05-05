import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { db } from '@/db';
import { workspaces, workspaceMembers, creditAccounts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

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

  // Check if user already has a workspace
  const existing = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.userId, user.id),
    with: { workspace: true } as never,
  });

  if (existing) {
    // Return user to their workspace
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.ownerId, user.id),
    });
    return NextResponse.redirect(`${origin}/${workspace?.slug ?? ''}`);
  }

  // First login — provision workspace + credit account in one transaction
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

  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({
      id: workspaceId,
      name: baseName,
      slug,
      ownerId: user.id,
    });
    await tx.insert(workspaceMembers).values({
      workspaceId,
      userId: user.id,
      role: 'owner',
    });
    await tx.insert(creditAccounts).values({
      workspaceId,
      cachedBalance: 0,
    });
  });

  // Store workspace slug in user metadata so the frontend can read it without an extra API call
  await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: { workspace_slug: slug },
  });

  return NextResponse.redirect(`${origin}/${slug}`);
}
