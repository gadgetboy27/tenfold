'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { v4 as uuidv4 } from 'uuid';

export async function signInWithPassword(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'Email and password are required' };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const user = data.user;
  const admin = createSupabaseAdminClient();

  // Check for existing workspace
  const { data: existing } = await admin
    .from('workspace_members')
    .select('workspace_id, workspaces!inner(slug)')
    .eq('user_id', user.id)
    .limit(1);

  if (existing?.length) {
    const row = existing[0] as unknown as { workspaces: { slug: string } };
    redirect(`/${row.workspaces?.slug ?? user.id}`);
  }

  // First login — provision workspace
  const workspaceId = uuidv4();
  const baseName =
    (user.user_metadata?.full_name as string | undefined) ??
    email.split('@')[0] ??
    'My Workspace';
  const slug =
    baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) +
    '-' + workspaceId.slice(0, 6);

  await admin.from('workspaces').insert({ id: workspaceId, name: baseName, slug, owner_id: user.id });
  await admin.from('workspace_members').insert({ workspace_id: workspaceId, user_id: user.id, role: 'owner' });
  await admin.from('credit_accounts').insert({ workspace_id: workspaceId, cached_balance: 50 });
  await admin.from('credit_transactions').insert({
    workspace_id: workspaceId, type: 'grant', amount: 50, balance_after: 50, description: 'Welcome credits',
  });
  await admin.auth.admin.updateUserById(user.id, { user_metadata: { workspace_slug: slug } });

  redirect(`/${slug}`);
}

