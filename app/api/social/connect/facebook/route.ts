import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getMetaOAuthUrl } from '@/lib/social/meta';
import { signOAuthState } from '@/lib/social/oauth-state';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    // Signed OAuth state carries the workspaceId through the round-trip so the
    // callback can trust which workspace to attach pages to (CSRF protection).
    const url = getMetaOAuthUrl(signOAuthState(session.workspaceId));
    return NextResponse.redirect(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unauthorized';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
