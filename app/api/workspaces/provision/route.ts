import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { db } from '@/db';
import { workspaces, workspaceMembers, creditAccounts, creditTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  let userId: string | undefined;

  // Bearer token path (Replit / external frontend) — same anon-key verification
  // used by getSession(), which is already working for /api/workspaces/me
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data } = await supabase.auth.getUser(bearerToken);
    userId = data.user?.id;
  } else {
    // Cookie path (Next.js SSR pages)
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Already provisioned — return existing workspace
  const existingMember = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.userId, userId),
  });

  if (existingMember) {
    const existing = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, existingMember.workspaceId),
    });
    return NextResponse.json({
      workspaceId: existingMember.workspaceId,
      slug: existing?.slug,
      alreadyProvisioned: true,
    });
  }

  // Resolve display name from Supabase Auth
  const admin = createSupabaseAdminClient();
  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const authUser = userData?.user;
  const email = authUser?.email ?? '';
  const baseName =
    (authUser?.user_metadata?.full_name as string | undefined) ??
    email.split('@')[0] ??
    'My Workspace';

  const workspaceId = uuidv4();
  const slug =
    baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) +
    '-' +
    workspaceId.slice(0, 6);

  const WELCOME_CREDITS = 50;

  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({ id: workspaceId, name: baseName, slug, ownerId: userId! });
    await tx.insert(workspaceMembers).values({ workspaceId, userId: userId!, role: 'owner' });
    await tx.insert(creditAccounts).values({ workspaceId, cachedBalance: WELCOME_CREDITS });
    await tx.insert(creditTransactions).values({
      workspaceId,
      type: 'grant',
      amount: WELCOME_CREDITS,
      balanceAfter: WELCOME_CREDITS,
      description: 'Welcome credits',
    });
  });

  // Cache slug in user metadata so next login skips this endpoint entirely
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { workspace_slug: slug },
  });

  return NextResponse.json({ workspaceId, slug, credits: WELCOME_CREDITS }, { status: 201 });
}
