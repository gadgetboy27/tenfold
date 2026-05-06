import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { db } from '@/db';
import { workspaces, workspaceMembers, creditAccounts, creditTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

const bodySchema = z.object({
  userId: z.string().uuid(),
  slug: z.string().min(1).max(63).optional(),
  welcomeCredits: z.number().int().min(0).default(50),
});

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { userId, welcomeCredits } = parsed.data;

  // Resolve user from Supabase Auth
  const admin = createSupabaseAdminClient();
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData.user) {
    return NextResponse.json({ error: 'User not found in Supabase Auth' }, { status: 404 });
  }

  const user = userData.user;
  const email = user.email ?? '';
  const baseName =
    (user.user_metadata?.full_name as string | undefined) ??
    email.split('@')[0] ??
    'My Workspace';

  const workspaceId = uuidv4();
  const slug =
    parsed.data.slug ??
    baseName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) +
      '-' +
      workspaceId.slice(0, 6);

  // Check if already provisioned
  const existingMember = await db.query.workspaceMembers.findFirst({
    where: eq(workspaceMembers.userId, userId),
  });

  if (existingMember) {
    const existing = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, existingMember.workspaceId),
    });
    return NextResponse.json({
      alreadyProvisioned: true,
      workspaceId: existingMember.workspaceId,
      slug: existing?.slug,
    });
  }

  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({
      id: workspaceId,
      name: baseName,
      slug,
      ownerId: userId,
    });
    await tx.insert(workspaceMembers).values({
      workspaceId,
      userId,
      role: 'owner',
    });
    await tx.insert(creditAccounts).values({
      workspaceId,
      cachedBalance: welcomeCredits,
    });
    if (welcomeCredits > 0) {
      await tx.insert(creditTransactions).values({
        workspaceId,
        type: 'grant',
        amount: welcomeCredits,
        balanceAfter: welcomeCredits,
        description: 'Welcome credits',
      });
    }
  });

  // Write slug back to user metadata
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { workspace_slug: slug },
  });

  return NextResponse.json({ workspaceId, slug, credits: welcomeCredits }, { status: 201 });
}
