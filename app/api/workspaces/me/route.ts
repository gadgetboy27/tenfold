import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    return NextResponse.json({
      workspaceId: session.workspaceId,
      slug: session.workspaceSlug,
      role: session.role,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : msg === 'Not a workspace member' ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
