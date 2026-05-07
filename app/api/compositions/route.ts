import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createCompositionSchema } from '@/lib/validation/schemas';
import { composeImage } from '@/lib/composition/image';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createCompositionSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    const { data: anchor } = await admin
      .from('assets')
      .select('*')
      .eq('id', body.anchorAssetId)
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!anchor) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const a = anchor as { url: string; job_id: string; width_px: number | null; height_px: number | null };
    const id = uuidv4();
    const needsComposition = body.textOverlays.length > 0 || body.branding.logo || body.branding.primaryColor;

    const { data: composition, error: compErr } = await admin
      .from('compositions')
      .insert({
        id,
        campaign_id: body.campaignId,
        workspace_id: session.workspaceId,
        anchor_asset_id: body.anchorAssetId,
        format: body.format,
        text_overlays: body.textOverlays,
        branding: body.branding,
        caption: body.caption,
        hashtags: body.hashtags,
        status: needsComposition ? 'composing' : 'draft',
      })
      .select()
      .single();

    if (compErr || !composition) throw new Error(compErr?.message ?? 'Insert failed');
    if (!needsComposition) return NextResponse.json(composition, { status: 201 });

    // Run Sharp pipeline synchronously
    const outputAssetId = uuidv4();
    const storagePath = `${session.workspaceId}/${body.campaignId}/composed-${outputAssetId}.jpg`;

    const publicUrl = await composeImage({
      sourceUrl: a.url,
      storagePath,
      format: body.format,
      textOverlays: body.textOverlays,
    });

    await admin.from('assets').insert({
      id: outputAssetId,
      campaign_id: body.campaignId,
      workspace_id: session.workspaceId,
      job_id: a.job_id,
      type: 'composed_image',
      url: publicUrl,
      storage_path: storagePath,
      width_px: a.width_px,
      height_px: a.height_px,
    });

    const { data: ready } = await admin
      .from('compositions')
      .update({ output_asset_id: outputAssetId, status: 'ready' })
      .eq('id', id)
      .select()
      .single();

    return NextResponse.json(ready, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
