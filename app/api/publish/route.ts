import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { publishSchema } from '@/lib/validation/schemas';
import { ayrsharePost } from '@/lib/ayrshare/client';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = publishSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const { data: composition } = await admin
      .from('compositions')
      .select('*')
      .eq('id', body.compositionId)
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!composition) return NextResponse.json({ error: 'Composition not found' }, { status: 404 });

    const comp = composition as { output_asset_id: string | null; anchor_asset_id: string };
    const assetId = comp.output_asset_id ?? comp.anchor_asset_id;

    const { data: asset } = await admin.from('assets').select('url').eq('id', assetId).single();
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const { data: workspace } = await admin
      .from('workspaces')
      .select('ayrshare_profile_key')
      .eq('id', session.workspaceId)
      .single();

    const ws = workspace as { ayrshare_profile_key: string | null } | null;
    if (!ws?.ayrshare_profile_key) {
      return NextResponse.json(
        { error: 'No social accounts connected. Go to Settings → Social to connect.' },
        { status: 422 },
      );
    }

    const hashtags = body.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`));
    const fullCaption = hashtags.length ? `${body.caption}\n\n${hashtags.join(' ')}` : body.caption;

    const result = await ayrsharePost(ws.ayrshare_profile_key, {
      post: fullCaption,
      platforms: body.platforms,
      mediaUrls: [(asset as { url: string }).url],
      scheduleDate: body.scheduledAt,
    });

    const isScheduled = !!body.scheduledAt;
    const { data: record } = await admin
      .from('publish_records')
      .insert({
        id: uuidv4(),
        composition_id: body.compositionId,
        workspace_id: session.workspaceId,
        ayrshare_post_id: result.id,
        platforms: body.platforms,
        caption: body.caption,
        hashtags: body.hashtags,
        scheduled_at: isScheduled ? body.scheduledAt : null,
        published_at: isScheduled ? null : new Date().toISOString(),
        status: isScheduled ? 'scheduled' : 'published',
        platform_results: (result.postIds ?? []) as unknown as Record<string, unknown>,
      })
      .select()
      .single();

    await admin
      .from('compositions')
      .update({ status: 'published' })
      .eq('id', body.compositionId);

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Not a workspace member' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
