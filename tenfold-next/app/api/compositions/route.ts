import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { compositions, assets } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { createCompositionSchema } from '@/lib/validation/schemas';
import { composeImage } from '@/lib/composition/image';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createCompositionSchema.parse(await req.json());

    const anchor = await db.query.assets.findFirst({
      where: and(
        eq(assets.id, body.anchorAssetId),
        eq(assets.workspaceId, session.workspaceId),
      ),
    });
    if (!anchor) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const id = uuidv4();
    const needsComposition = body.textOverlays.length > 0 || body.branding.logo || body.branding.primaryColor;

    const [composition] = await db
      .insert(compositions)
      .values({
        id,
        campaignId: body.campaignId,
        workspaceId: session.workspaceId,
        anchorAssetId: body.anchorAssetId,
        format: body.format,
        textOverlays: body.textOverlays,
        branding: body.branding,
        caption: body.caption,
        hashtags: body.hashtags,
        status: needsComposition ? 'composing' : 'draft',
      })
      .returning();

    if (!needsComposition) {
      return NextResponse.json(composition, { status: 201 });
    }

    // Run Sharp pipeline synchronously (< 2s for images under 5MB)
    const outputAssetId = uuidv4();
    const storagePath = `${session.workspaceId}/${body.campaignId}/composed-${outputAssetId}.jpg`;

    const publicUrl = await composeImage({
      sourceUrl: anchor.url,
      storagePath,
      format: body.format,
      textOverlays: body.textOverlays,
    });

    const [outputAsset] = await db
      .insert(assets)
      .values({
        id: outputAssetId,
        campaignId: body.campaignId,
        workspaceId: session.workspaceId,
        jobId: anchor.jobId,
        type: 'composed_image',
        url: publicUrl,
        storagePath,
        widthPx: anchor.widthPx,
        heightPx: anchor.heightPx,
      })
      .returning();

    const [ready] = await db
      .update(compositions)
      .set({ outputAssetId: outputAsset.id, status: 'ready', updatedAt: new Date() })
      .where(eq(compositions.id, id))
      .returning();

    return NextResponse.json(ready, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
