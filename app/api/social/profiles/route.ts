import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getConnectedPlatforms } from '@/lib/ayrshare/profiles';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin = createSupabaseAdminClient();

    const { data: workspace } = await admin
      .from('workspaces')
      .select('ayrshare_profile_key')
      .eq('id', session.workspaceId)
      .single();

    const ws = workspace as { ayrshare_profile_key: string | null } | null;
    if (!ws?.ayrshare_profile_key) return NextResponse.json([]);

    const activePlatforms = await getConnectedPlatforms(ws.ayrshare_profile_key);
    for (const platform of activePlatforms) {
      await admin
        .from('social_profiles')
        .upsert({ workspace_id: session.workspaceId, platform }, { onConflict: 'workspace_id,platform', ignoreDuplicates: true });
    }

    const { data: profiles } = await admin
      .from('social_profiles')
      .select('*')
      .eq('workspace_id', session.workspaceId);

    return NextResponse.json(profiles ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
