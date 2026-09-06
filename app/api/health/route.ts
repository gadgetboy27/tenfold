import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { createClient } from "@supabase/supabase-js";
import { serverPublicEnv } from "@/lib/env/public-server";

/**
 * GET /api/health — liveness probe (public) + deployment diagnostics (ops-only).
 *
 * This route was written during the "is production pointed at the wrong
 * database?" incident, and it answered that by printing the DB host, the DB
 * user, which secrets were set, and every workspace slug it could read. All of
 * that was served unauthenticated on the public internet — the slugs are real
 * customer names, and `dbUser` is the Supabase project ref.
 *
 * The diagnostics are kept, not deleted: they're the fastest way to answer that
 * question again, and losing them would just mean re-adding a worse version
 * under pressure. They now sit behind `?verbose=1` + the ops secret.
 *
 * The DEFAULT response stays public and unauthenticated on purpose — uptime
 * monitors need an endpoint that answers without a credential — but it says
 * only whether the database answered. Nothing in it identifies the deployment,
 * its infrastructure, or anyone using it.
 */

/**
 * Ops auth for the verbose payload. Mirrors the cron routes' Bearer convention
 * but **fails closed**: an unset CRON_SECRET denies, where the crons fall back
 * to a literal "dev-secret". A fallback constant that lives in the repo is not
 * a secret, and this endpoint is exactly where that stops being theoretical.
 */
function isOpsRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("Authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which is itself a signal —
  // compare lengths first so both paths cost the same.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const verbose = new URL(req.url).searchParams.get("verbose") === "1";

  // ── Public liveness: does the database answer? Nothing else. ──────────────
  let dbOk = false;
  let dbError: string | undefined;
  try {
    await db.select({ id: workspaces.id }).from(workspaces).limit(1);
    dbOk = true;
  } catch (err) {
    const e = err as Error & { code?: string };
    dbError = `${e.message}${e.code ? ` [${e.code}]` : ""}`;
  }

  if (!verbose || !isOpsRequest(req)) {
    // Deliberately identical whether the caller simply didn't ask for verbose
    // or asked and wasn't authorised — a 401 here would confirm to an anonymous
    // caller that a privileged payload exists behind this URL.
    return NextResponse.json(
      { status: dbOk ? "ok" : "error" },
      { status: dbOk ? 200 : 500 },
    );
  }

  // ── Ops diagnostics from here down. ──────────────────────────────────────
  const { supabaseUrl, supabaseAnonKey } = serverPublicEnv();
  let dbHost = "parse-error";
  let dbUser = "parse-error";
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    dbHost = u.hostname + ":" + u.port;
    dbUser = u.username;
  } catch {}

  const checks: Record<string, string> = {
    version: "v4-ops-gated",
    db: dbOk ? "ok" : (dbError ?? "error"),
    restApi: "untested",
    dbHost,
    dbUser,
    SUPABASE_URL: supabaseUrl || "MISSING",
    SUPABASE_ANON_KEY: supabaseAnonKey ? "set" : "MISSING",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? "set"
      : "MISSING",
    SOCIAL_TOKEN_KEY: process.env.SOCIAL_TOKEN_KEY ? "set" : "MISSING",
    CRON_SECRET: "set", // implied — this branch is unreachable without it
    APP_URL: process.env.APP_URL ?? "MISSING",
  };

  // Test 1: REST API path (uses API keys, not DATABASE_URL). The two paths can
  // reach DIFFERENT databases when one env var is stale, which is the whole
  // reason both are checked rather than one.
  try {
    const supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { count, error } = await supabase
      .from("workspaces")
      .select("id", { count: "exact", head: true });
    checks.restApi = error ? `error: ${error.message}` : "ok";
    if (!error) checks.restWorkspaceCount = String(count ?? 0);
  } catch (err) {
    checks.restApi = `exception: ${(err as Error).message}`;
  }

  // Test 2: direct pooler path (uses DATABASE_URL).
  //
  // Counts, not slugs. The original printed every workspace slug so a human
  // could eyeball whether the expected tenant was present; a count answers the
  // "am I on the right database / are the tables empty" question just as well
  // without turning a health check into a customer list.
  try {
    const rows = await db.select({ id: workspaces.id }).from(workspaces);
    checks.workspaceCount = String(rows.length);
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string };
    checks.workspaceCount = `error: ${e.message}${e.code ? ` [${e.code}]` : ""}`;
    if (e.detail) checks.dbDetail = e.detail;
  }

  // Ayrshare config: is the API key set, and how many workspace profiles are
  // linked? Linked profiles = the slots that count toward the Ayrshare plan
  // (Launch: 10, Business: 30 + per-profile), so this is a quick cost gauge.
  checks.AYRSHARE_ENABLED = process.env.AYRSHARE_ENABLED ?? "unset";
  checks.AYRSHARE_API_KEY = process.env.AYRSHARE_API_KEY ? "set" : "MISSING";
  try {
    const supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { count, error } = await supabase
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .not("ayrshare_profile_key", "is", null);
    checks.ayrshareLinkedProfiles = error
      ? `error: ${error.message}`
      : String(count ?? 0);
  } catch (err) {
    checks.ayrshareLinkedProfiles = `exception: ${(err as Error).message}`;
  }

  return NextResponse.json(checks, { status: dbOk ? 200 : 500 });
}
