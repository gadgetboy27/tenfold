import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createAyrshareProfile, generateSocialConnectUrl } from '@/lib/ayrshare/profiles';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const { data: workspace } = await admin
      .from('workspaces')
      .select('id, name, ayrshare_profile_key')
      .eq('id', session.workspaceId)
      .single();

    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    const ws = workspace as { id: string; name: string; ayrshare_profile_key: string | null };
    let profileKey = ws.ayrshare_profile_key;

    if (!profileKey) {
      const profile = await createAyrshareProfile(ws.name);
      profileKey = profile.profileKey;
      await admin
        .from('workspaces')
        .update({ ayrshare_profile_key: profileKey })
        .eq('id', session.workspaceId);
    }

    const connectUrl = await generateSocialConnectUrl(profileKey);
    return NextResponse.json({ connectUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
