import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { createAyrshareProfile, generateSocialConnectUrl } from '@/lib/ayrshare/profiles';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, session.workspaceId),
    });
    if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });

    let profileKey = workspace.ayrshareProfileKey;

    if (!profileKey) {
      const profile = await createAyrshareProfile(workspace.name);
      profileKey = profile.profileKey;
      await db
        .update(workspaces)
        .set({ ayrshareProfileKey: profileKey, updatedAt: new Date() })
        .where(eq(workspaces.id, session.workspaceId));
    }

    const connectUrl = await generateSocialConnectUrl(profileKey);
    return NextResponse.json({ connectUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
