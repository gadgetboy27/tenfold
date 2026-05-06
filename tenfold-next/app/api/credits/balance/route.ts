import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { getBalanceWithHistory } from '@/lib/credits/balance';

export async function GET(req: Request) {
  try {
    const session = await getSession(req);
    const data = await getBalanceWithHistory(session.workspaceId);
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
