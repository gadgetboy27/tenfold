'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { resolveWorkspaceSlug } from '@/lib/workspace';

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

  const token = data.session?.access_token;
  if (!token || !data.user) {
    return { error: 'Sign-in succeeded but no session was returned' };
  }

  // Resolve workspace using the same flow as the OAuth callback:
  // metadata → backend discovery → backend provisioning
  const slug = await resolveWorkspaceSlug(data.user, token);

  if (!slug) {
    return { error: 'Your account has no workspace yet and we could not provision one. Please contact support.' };
  }

  // Sync resolved slug back to metadata if it changed (e.g. cold-start provisioning)
  const currentMeta = data.user.user_metadata?.workspace_slug as string | undefined;
  if (currentMeta !== slug) {
    try {
      const admin = createSupabaseAdminClient();
      await admin.auth.admin.updateUserById(data.user.id, {
        user_metadata: { workspace_slug: slug },
      });
    } catch { /* non-fatal */ }
  }

  redirect(`/${slug}`);
}

export async function sendMagicLink(formData: FormData) {
  const email = formData.get('email') as string;

  if (!email) {
    return { error: 'Email is required' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
