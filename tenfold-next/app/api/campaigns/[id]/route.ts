import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { campaigns, creativeJobs, assets } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;

    const campaign = await db.query.campaigns.findFirst({
      where: and(eq(campaigns.id, id), eq(campaigns.workspaceId, session.workspaceId)),
    });
    if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [jobs, campaignAssets] = await Promise.all([
      db.select().from(creativeJobs).where(eq(creativeJobs.campaignId, id)),
      db.select().from(assets).where(eq(assets.campaignId, id)),
    ]);

    return NextResponse.json({ ...campaign, jobs, assets: campaignAssets });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;
    const body = (await req.json()) as { status?: string; prompt?: string };

    const [updated] = await db
      .update(campaigns)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, session.workspaceId)))
      .returning();

    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
