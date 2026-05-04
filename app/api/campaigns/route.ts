import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { campaigns } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { createCampaignSchema } from '@/lib/validation/schemas';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const list = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.workspaceId, session.workspaceId))
      .orderBy(desc(campaigns.createdAt))
      .limit(50);
    return NextResponse.json(list);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Not a workspace member' ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession(req);
    const body = createCampaignSchema.parse(await req.json());

    const id = uuidv4();
    const [campaign] = await db
      .insert(campaigns)
      .values({
        id,
        workspaceId: session.workspaceId,
        createdBy: session.userId,
        prompt: body.prompt,
        parameters: body.parameters ?? {},
        status: 'generating',
      })
      .returning();

    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
