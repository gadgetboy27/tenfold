import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function RootPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const workspaceSlug =
    (user.user_metadata?.workspace_slug as string | undefined) ??
    (user.user_metadata?.workspaceSlug as string | undefined) ??
    user.id;

  redirect(`/${workspaceSlug}`);
}
