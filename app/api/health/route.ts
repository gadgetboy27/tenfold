import { NextResponse } from 'next/server';
import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  let dbHost = 'parse-error';
  let dbUser = 'parse-error';
  try {
    const u = new URL(process.env.DATABASE_URL ?? '');
    dbHost = u.hostname + ':' + u.port;
    dbUser = u.username;
  } catch {}

  const checks: Record<string, string> = {
    version: 'v3-admin-client',
    db: 'untested',
    restApi: 'untested',
    dbHost,
    dbUser,
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'MISSING',
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING',
  };

  // Test 1: REST API path (uses API keys, not DATABASE_URL)
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data, error } = await supabase.from('workspaces').select('id,slug').limit(3);
    if (error) {
      checks.restApi = `error: ${error.message}`;
    } else {
      const TEST_WORKSPACE_ID = '78141a59-d721-4207-a527-e24d4520405c';
      const testRow = data?.find((r: { id: string }) => r.id === TEST_WORKSPACE_ID);
      checks.restApi = 'ok';
      checks.restRowCount = String(data?.length ?? 0);
      checks.restTestWorkspace = testRow
        ? `FOUND (slug: ${(testRow as { slug: string }).slug})`
        : 'NOT FOUND';
      checks.restSlugs = data?.map((r: { slug: string }) => r.slug).join(', ') || '(none)';
    }
  } catch (err) {
    const e = err as Error;
    checks.restApi = `exception: ${e.message}`;
  }

  // Test 2: Direct postgres pooler path (uses DATABASE_URL)
  try {
    const TEST_WORKSPACE_ID = '78141a59-d721-4207-a527-e24d4520405c';
    const rows = await db
      .select({ id: workspaces.id, slug: workspaces.slug })
      .from(workspaces)
      .limit(5);
    const testRow = rows.find(r => r.id === TEST_WORKSPACE_ID);
    checks.db = 'ok';
    checks.rowCount = String(rows.length);
    checks.testWorkspace = testRow
      ? `FOUND (slug: ${testRow.slug})`
      : 'NOT FOUND — wrong database or tables empty';
    checks.allSlugs = rows.map(r => r.slug).join(', ') || '(none)';
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string; routine?: string };
    checks.db = `${e.message}${e.code ? ` [${e.code}]` : ''}`;
    if (e.detail) checks.dbDetail = e.detail;
  }

  const ok = checks.db === 'ok';
  return NextResponse.json(checks, { status: ok ? 200 : 500 });
}
