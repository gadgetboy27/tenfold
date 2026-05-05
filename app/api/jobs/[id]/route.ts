import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { creativeJobs, assets } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession(req);
    const { id } = await params;

    const job = await db.query.creativeJobs.findFirst({
      where: and(eq(creativeJobs.id, id), eq(creativeJobs.workspaceId, session.workspaceId)),
    });

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const jobAssets = await db
      .select({ id: assets.id, url: assets.url, type: assets.type })
      .from(assets)
      .where(eq(assets.jobId, job.id));

    const outputUrls = jobAssets.map((a) => a.url);
    const outputText = job.status === 'completed' && job.type === 'script_generation'
      ? undefined
      : undefined;

    return NextResponse.json({
      id: job.id,
      status: job.status === 'completed' ? 'ready' : job.status,
      type: job.type,
      creditCost: job.creditsCharged,
      assets: jobAssets,
      outputUrls,
      outputText,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
