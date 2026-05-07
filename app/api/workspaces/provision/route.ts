import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  let userId: string | undefined;

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
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  // Already provisioned — return existing workspace (idempotent)
  const { data: existingRows } = await admin
    .from('workspace_members')
    .select('workspace_id, workspaces!inner(id, slug)')
    .eq('user_id', userId)
    .limit(1);

  if (existingRows?.length) {
    const row = existingRows[0] as { workspace_id: string; workspaces: { id: string; slug: string } };
    return NextResponse.json({
      workspaceId: row.workspace_id,
      slug: row.workspaces.slug,
      alreadyProvisioned: true,
    });
  }

  // Resolve display name from Supabase Auth
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

  // Sequential inserts via admin client (service role bypasses RLS)
  const { error: wsErr } = await admin
    .from('workspaces')
    .insert({ id: workspaceId, name: baseName, slug, owner_id: userId });
  if (wsErr) return NextResponse.json({ error: `workspace: ${wsErr.message}` }, { status: 500 });

  const { error: memErr } = await admin
    .from('workspace_members')
    .insert({ workspace_id: workspaceId, user_id: userId, role: 'owner' });
  if (memErr) return NextResponse.json({ error: `member: ${memErr.message}` }, { status: 500 });

  const { error: acctErr } = await admin
    .from('credit_accounts')
    .insert({ workspace_id: workspaceId, cached_balance: WELCOME_CREDITS });
  if (acctErr) return NextResponse.json({ error: `credits: ${acctErr.message}` }, { status: 500 });

  const { error: txErr } = await admin
    .from('credit_transactions')
    .insert({
      workspace_id: workspaceId,
      type: 'grant',
      amount: WELCOME_CREDITS,
      balance_after: WELCOME_CREDITS,
      description: 'Welcome credits',
    });
  if (txErr) return NextResponse.json({ error: `tx: ${txErr.message}` }, { status: 500 });

  // Cache slug in user metadata so next login skips this endpoint
  await admin.auth.admin.updateUserById(userId, {
    user_metadata: { workspace_slug: slug },
  });

  return NextResponse.json({ workspaceId, slug, credits: WELCOME_CREDITS }, { status: 201 });
}
