import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { checkAllApiKeys } from '@/lib/diagnostics/api-health';

export async function GET(req: Request) {
  try {
    await getSession(req);
    const results = await checkAllApiKeys();
    const allValid = results.every(r => r.valid);
    return NextResponse.json({ ok: allValid, services: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
