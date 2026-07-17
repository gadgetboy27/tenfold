import { NextResponse } from "next/server";
import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { createClient } from "@supabase/supabase-js";
import { serverPublicEnv } from "@/lib/env/public-server";

/**
 * Public liveness probe. The Dockerfile HEALTHCHECK is the only consumer and it
 * only reads the status code — so the body says the least it can.
 *
 * It used to say a great deal, to anyone who asked: the database host and
 * username, the Supabase project URL, row counts, and every workspace slug —
 * which are real customer names. It was a debugging endpoint (it still hunted
 * for a hardcoded TEST_WORKSPACE_ID) that shipped and was never taken back out.
 *
 * The rule for anything reachable without a session: report whether the service
 * is up, never what is inside it. Reachability is the whole question a health
 * check asks; identity, topology and volume are answers to questions nobody
 * asked.
 *
 * Always 200 while the process can respond. A failing dependency is reported in
 * the body rather than the status, because Docker restarts the container on a
 * failed check and restarting this app cannot fix someone else's database.
 */
export async function GET() {
  const { supabaseUrl, supabaseAnonKey } = serverPublicEnv();

  // Config presence only — never the values, and never which project.
  const configured =
    !!supabaseUrl &&
    !!supabaseAnonKey &&
    !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Can we reach Postgres through the pooler?
  let dbUp = false;
  try {
    await db.select({ id: workspaces.id }).from(workspaces).limit(1);
    dbUp = true;
  } catch {
    dbUp = false;
  }

  // Can we reach it through the REST API (a different network path, so a
  // different failure)? Count only — head:true never returns a row.
  let restUp = false;
  try {
    const supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    );
    const { error } = await supabase
      .from("workspaces")
      .select("id", { count: "exact", head: true });
    restUp = !error;
  } catch {
    restUp = false;
  }

  const ok = configured && dbUp && restUp;
  return NextResponse.json({
    status: ok ? "ok" : "degraded",
    configured,
    db: dbUp,
    restApi: restUp,
  });
}
