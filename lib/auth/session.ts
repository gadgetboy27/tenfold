import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { serverPublicEnv } from "@/lib/env/public-server";

export interface Session {
  userId: string;
  workspaceId: string;
  role: string;
  workspaceSlug: string;
}

export async function getSession(req: Request): Promise<Session> {
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  let userId: string;

  if (bearerToken) {
    // Replit (or any external) frontend — verify JWT directly
    const { supabaseUrl, supabaseAnonKey } = serverPublicEnv();
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (error || !data.user) throw new Error("Unauthorized");
    userId = data.user.id;
  } else {
    // Next.js SSR pages — cookie-based session
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw new Error("Unauthorized");
    userId = data.user.id;
  }

  const url = new URL(req.url);
  const workspaceSlug =
    url.searchParams.get("workspace") ??
    req.headers.get("x-workspace-slug") ??
    null;

  // Use admin client (REST API path) to avoid dependency on postgres pooler for auth
  const admin = createSupabaseAdminClient();

  // Look up membership, optionally filtering by slug
  let memberQuery = admin
    .from("workspace_members")
    .select("workspace_id, role, workspaces!inner(id, slug)")
    .eq("user_id", userId)
    .limit(1);

  if (workspaceSlug) {
    memberQuery = memberQuery.eq("workspaces.slug", workspaceSlug);
  }

  const { data: rows, error: memberError } = await memberQuery;

  if (memberError)
    throw new Error(`Session lookup failed: ${memberError.message}`);

  const row = rows?.[0] as unknown as
    | {
        workspace_id: string;
        role: string;
        workspaces: { id: string; slug: string };
      }
    | undefined;

  if (!row) throw new Error("Not a workspace member");

  return {
    userId,
    workspaceId: row.workspace_id,
    role: row.role,
    workspaceSlug: row.workspaces?.slug ?? "",
  };
}
