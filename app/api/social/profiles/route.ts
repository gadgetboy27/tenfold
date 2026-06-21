import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const admin   = createSupabaseAdminClient();

    const { data: profiles } = await admin
      .from('social_profiles')
      .select('id, platform, handle, profile_display_name, platform_page_id, metadata, connected_at')
      .eq('workspace_id', session.workspaceId);

    // For Facebook, surface the managed-page list (id + name only — never tokens)
    // and which page is active, so the UI can render the Page picker.
    const out = (profiles ?? []).map((p) => {
      const row = p as {
        id: string;
        platform: string;
        handle: string | null;
        profile_display_name: string | null;
        platform_page_id: string | null;
        metadata: { facebook_pages?: { id: string; name: string }[] } | null;
        connected_at: string | null;
      };
      const base = {
        id: row.id,
        platform: row.platform,
        handle: row.handle,
        profile_display_name: row.profile_display_name,
        connected_at: row.connected_at,
      };
      if (row.platform === 'facebook' && row.metadata?.facebook_pages?.length) {
        return {
          ...base,
          activePageId: row.platform_page_id,
          availablePages: row.metadata.facebook_pages.map((fp) => ({
            id: fp.id,
            name: fp.name,
          })),
        };
      }
      return base;
    });

    return NextResponse.json(out);
  } catch (err) {
    const msg    = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
