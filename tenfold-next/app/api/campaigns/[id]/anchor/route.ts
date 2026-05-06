import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { campaigns, assets } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { setAnchorSchema } from '@/lib/validation/schemas';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const { assetId } = setAnchorSchema.parse(await req.json());

    // Confirm asset belongs to this campaign + workspace
    const asset = await db.query.assets.findFirst({
      where: and(
        eq(assets.id, assetId),
        eq(assets.campaignId, id),
        eq(assets.workspaceId, session.workspaceId),
      ),
    });
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const [updated] = await db
      .update(campaigns)
      .set({ anchorAssetId: assetId, status: 'expanding', updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, session.workspaceId)))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
