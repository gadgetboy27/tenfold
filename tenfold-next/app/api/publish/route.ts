import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { compositions, assets, publishRecords, workspaces } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { publishSchema } from '@/lib/validation/schemas';
import { ayrsharePost } from '@/lib/ayrshare/client';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = publishSchema.parse(await req.json());

    const composition = await db.query.compositions.findFirst({
      where: and(
        eq(compositions.id, body.compositionId),
        eq(compositions.workspaceId, session.workspaceId),
      ),
    });
    if (!composition) {
      return NextResponse.json({ error: 'Composition not found' }, { status: 404 });
    }

    // Prefer composed output asset, fall back to raw anchor
    const assetId = composition.outputAssetId ?? composition.anchorAssetId;
    const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) });
    if (!asset) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, session.workspaceId),
    });
    if (!workspace?.ayrshareProfileKey) {
      return NextResponse.json(
        { error: 'No social accounts connected. Go to Settings → Social to connect.' },
        { status: 422 },
      );
    }

    const hashtags = body.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`));
    const fullCaption = hashtags.length
      ? `${body.caption}\n\n${hashtags.join(' ')}`
      : body.caption;

    const result = await ayrsharePost(workspace.ayrshareProfileKey, {
      post: fullCaption,
      platforms: body.platforms,
      mediaUrls: [asset.url],
      scheduleDate: body.scheduledAt,
    });

    const isScheduled = !!body.scheduledAt;
    const [record] = await db
      .insert(publishRecords)
      .values({
        id: uuidv4(),
        compositionId: body.compositionId,
        workspaceId: session.workspaceId,
        ayrsharePostId: result.id,
        platforms: body.platforms,
        caption: body.caption,
        hashtags: body.hashtags,
        scheduledAt: isScheduled ? new Date(body.scheduledAt!) : undefined,
        publishedAt: isScheduled ? undefined : new Date(),
        status: isScheduled ? 'scheduled' : 'published',
        platformResults: (result.postIds ?? []) as unknown as Record<string, unknown>,
      })
      .returning();

    await db
      .update(compositions)
      .set({ status: 'published', updatedAt: new Date() })
      .where(eq(compositions.id, body.compositionId));

    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Not a workspace member' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
