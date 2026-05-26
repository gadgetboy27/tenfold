import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getMetaOAuthUrl } from '@/lib/social/meta';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    // Use workspaceId as OAuth state so the callback knows which workspace to update.
    // For production, sign this value to prevent CSRF.
    const url = getMetaOAuthUrl(session.workspaceId);
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
