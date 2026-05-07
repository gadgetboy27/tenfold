import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { setAnchorSchema } from '@/lib/validation/schemas';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const { assetId } = setAnchorSchema.parse(await req.json());
    const admin = createSupabaseAdminClient();

    // Confirm asset belongs to this campaign + workspace
    const { data: asset } = await admin
      .from('assets')
      .select('id')
      .eq('id', assetId)
      .eq('campaign_id', id)
      .eq('workspace_id', session.workspaceId)
      .single();

    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const { data: updated, error } = await admin
      .from('campaigns')
      .update({ anchor_asset_id: assetId, status: 'expanding' })
      .eq('id', id)
      .eq('workspace_id', session.workspaceId)
      .select()
      .single();

    if (error || !updated) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
