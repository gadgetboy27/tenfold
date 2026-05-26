import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin   = createSupabaseAdminClient();

    const { data: profiles } = await admin
      .from('social_profiles')
      .select('id, platform, handle, profile_display_name, connected_at')
      .eq('workspace_id', session.workspaceId);

    return NextResponse.json(profiles ?? []);
  } catch (err) {
    const msg    = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
