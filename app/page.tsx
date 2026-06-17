import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { v4 as uuidv4 } from 'uuid';
import { Landing } from '@/components/marketing/Landing';

export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Logged-out visitors get the public marketing landing — the front door.
  // Logged-in users fall through to workspace resolution + redirect below.
  if (!user) {
    return <Landing />;
  }

  // Fast path: slug already cached in user_metadata from a previous provision
  const cached =
    (user.user_metadata?.workspace_slug as string | undefined) ??
    (user.user_metadata?.workspaceSlug as string | undefined);

  if (cached) {
    redirect(`/${cached}`);
  }

  // Slow path: look up workspace via admin client
  const admin = createSupabaseAdminClient();
  const { data: rows } = await admin
    .from('workspace_members')
    .select('workspaces!inner(slug)')
    .eq('user_id', user.id)
    .limit(1);

  const existingSlug = (rows?.[0] as { workspaces: { slug: string }[] } | undefined)?.workspaces[0]?.slug;

  if (existingSlug) {
    await admin.auth.admin.updateUserById(user.id, { user_metadata: { workspace_slug: existingSlug } });
    redirect(`/${existingSlug}`);
  }

  // No workspace yet — create one (same logic as /api/workspaces/provision)
  const workspaceId = uuidv4();
  const email = user.email ?? '';
  const baseName =
    (user.user_metadata?.full_name as string | undefined) ??
    email.split('@')[0] ??
    'My Workspace';
  const slug =
    baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) +
    '-' + workspaceId.slice(0, 6);

  const { error: wsErr } = await admin.from('workspaces').insert({ id: workspaceId, name: baseName, slug, owner_id: user.id });
  if (wsErr) redirect('/login?error=workspace_failed');

  await admin.from('workspace_members').insert({ workspace_id: workspaceId, user_id: user.id, role: 'owner' });
  await admin.from('credit_accounts').insert({ workspace_id: workspaceId, cached_balance: 50 });
  await admin.from('credit_transactions').insert({
    workspace_id: workspaceId, type: 'grant', amount: 50, balance_after: 50, description: 'Welcome credits',
  });
  await admin.auth.admin.updateUserById(user.id, { user_metadata: { workspace_slug: slug } });

  redirect(`/${slug}`);
}
