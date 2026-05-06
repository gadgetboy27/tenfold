import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { socialProfiles, workspaces } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getConnectedPlatforms } from '@/lib/ayrshare/profiles';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, session.workspaceId),
    });

    if (!workspace?.ayrshareProfileKey) {
      return NextResponse.json([]);
    }

    // Sync live status from Ayrshare then return DB records
    const activePlatforms = await getConnectedPlatforms(workspace.ayrshareProfileKey);
    for (const platform of activePlatforms) {
      await db
        .insert(socialProfiles)
        .values({ workspaceId: session.workspaceId, platform })
        .onConflictDoNothing();
    }

    const profiles = await db
      .select()
      .from(socialProfiles)
      .where(eq(socialProfiles.workspaceId, session.workspaceId));

    return NextResponse.json(profiles);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
