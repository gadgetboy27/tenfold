import { NextResponse } from 'next/server';
import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  let dbHost = 'parse-error';
  let dbUser = 'parse-error';
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    dbHost = u.hostname;
    dbUser = u.username;
  } catch {}

  const checks: Record<string, string> = {
    db: 'untested',
    dbHost,
    dbUser,
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'MISSING',
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING',
  };

  try {
    // Query for the known test workspace — if this row comes back we're on the right DB
    const TEST_WORKSPACE_ID = '78141a59-d721-4207-a527-e24d4520405c';
    const rows = await db
      .select({ id: workspaces.id, slug: workspaces.slug })
      .from(workspaces)
      .limit(5);

    const testRow = rows.find(r => r.id === TEST_WORKSPACE_ID);
    checks.db = 'ok';
    checks.rowCount = String(rows.length);
    checks.testWorkspace = testRow ? `FOUND (slug: ${testRow.slug})` : 'NOT FOUND — wrong database or tables empty';
    checks.allSlugs = rows.map(r => r.slug).join(', ') || '(none)';
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string; hint?: string; routine?: string };
    checks.db = JSON.stringify({
      message: e.message,
      code: e.code,
      detail: e.detail,
      hint: e.hint,
      routine: e.routine,
    });
  }

  const ok = checks.db === 'ok';
  return NextResponse.json(checks, { status: ok ? 200 : 500 });
}
