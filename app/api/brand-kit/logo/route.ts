import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
    if (!['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) {
      return NextResponse.json({ error: 'File must be PNG, JPG, WEBP, or SVG' }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 5 MB' }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const storagePath = `brand-kits/${session.workspaceId}/logo.${ext}`;
    const buffer = await file.arrayBuffer();

    await admin.storage.from('assets').upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    });

    const { data: urlData } = admin.storage.from('assets').getPublicUrl(storagePath);

    await admin.from('brand_kits').upsert(
      {
        workspace_id: session.workspaceId,
        logo_url: urlData.publicUrl,
        logo_storage_path: storagePath,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id' },
    );

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
