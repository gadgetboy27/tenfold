import { NextResponse } from 'next/server';
import { db } from '@/db';
import { workspaces } from '@/db/schema';
import { sql } from 'drizzle-orm';

export async function GET() {
  const checks: Record<string, string> = {
    db: 'untested',
    DATABASE_URL: process.env.DATABASE_URL ? 'set' : 'MISSING',
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'set' : 'MISSING',
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'set' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING',
  };

  try {
    await db.select({ n: sql<number>`1` }).from(workspaces).limit(1);
    checks.db = 'ok';
  } catch (err) {
    checks.db = err instanceof Error ? err.message : 'unknown error';
  }

  const ok = checks.db === 'ok';
  return NextResponse.json(checks, { status: ok ? 200 : 500 });
}
