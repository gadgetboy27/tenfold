import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSession, type Session } from "@/lib/auth/session";
import { getRateLimitKey, checkRateLimit } from "@/lib/security/rate-limit";

/**
 * Tables that carry a `workspace_id` column and MUST be tenant-scoped.
 *
 * The service-role admin client bypasses RLS (see lib/supabase/admin.ts), so
 * workspace isolation has historically depended on every route remembering to
 * write `.eq('workspace_id', …)` by hand — one miss is a cross-tenant leak.
 * The scoped client below applies that filter automatically for these tables.
 *
 * `workspaces` is intentionally excluded: its identity column is `id`, not
 * `workspace_id`. Cross-table or join queries that genuinely need the unscoped
 * client (webhooks, membership lookups) should use `ctx.admin`.
 */
export const WORKSPACE_SCOPED_TABLES = new Set<string>([
  "workspace_members",
  "social_profiles",
  "subscriptions",
  "credit_accounts",
  "credit_transactions",
  "campaigns",
  "creative_jobs",
  "assets",
  "compositions",
  "publish_records",
  "content_submissions",
  "analytics_reports",
  "asset_comments",
]);

type AdminClient = SupabaseClient;
type QueryBuilder = ReturnType<AdminClient["from"]>;

export interface ScopedClient {
  /** Returns a query builder pre-filtered to the active workspace for scoped tables. */
  from: (table: string) => QueryBuilder;
  /** Stored procedures (e.g. debit_credits). Pass `p_workspace_id` explicitly. */
  rpc: AdminClient["rpc"];
  /** Supabase Storage handle (no row scoping applies). */
  storage: AdminClient["storage"];
}

type InsertRow = Record<string, unknown>;

function withWorkspaceId(
  values: InsertRow | InsertRow[],
  workspaceId: string,
): InsertRow | InsertRow[] {
  const inject = (row: InsertRow): InsertRow => ({
    ...row,
    workspace_id: row.workspace_id ?? workspaceId,
  });
  return Array.isArray(values) ? values.map(inject) : inject(values);
}

/**
 * Returns the native Supabase query builder, transparently scoped for tables in
 * {@link WORKSPACE_SCOPED_TABLES}. A Proxy is used so callers keep the full
 * Supabase types (.eq/.single/.order/…) while reads gain a `workspace_id`
 * filter and writes have `workspace_id` injected — at runtime only.
 */
function scopedFrom(
  admin: AdminClient,
  table: string,
  workspaceId: string,
): QueryBuilder {
  const qb = admin.from(table);
  if (!WORKSPACE_SCOPED_TABLES.has(table)) return qb;

  type Fn = (...args: unknown[]) => unknown;
  interface Filterable {
    eq: (column: string, value: string) => unknown;
  }

  return new Proxy(qb, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;

      if (prop === "select" || prop === "update" || prop === "delete") {
        return (...args: unknown[]) =>
          ((value as Fn).apply(target, args) as Filterable).eq(
            "workspace_id",
            workspaceId,
          );
      }
      if (prop === "insert" || prop === "upsert") {
        return (values: InsertRow | InsertRow[], ...rest: unknown[]) =>
          (value as Fn).apply(target, [
            withWorkspaceId(values, workspaceId),
            ...rest,
          ]);
      }
      return (value as Fn).bind(target);
    },
  }) as QueryBuilder;
}

function createScopedClient(
  admin: AdminClient,
  workspaceId: string,
): ScopedClient {
  return {
    from: (table: string) => scopedFrom(admin, table, workspaceId),
    rpc: admin.rpc.bind(admin),
    storage: admin.storage,
  };
}

export interface WorkspaceContext<P> {
  /** Workspace-scoped DB client — reads/writes auto-filtered to the tenant. */
  db: ScopedClient;
  /** Raw service-role client (bypasses scoping) for webhooks / cross-table work. */
  admin: AdminClient;
  session: Session;
  /** Resolved Next.js dynamic route params. */
  params: P;
}

type Handler<P> = (
  req: Request,
  ctx: WorkspaceContext<P>,
) => Promise<Response> | Response;

interface WithWorkspaceOptions {
  /** Requests/min per IP. Defaults to 60. Pass `false` to disable. */
  rateLimit?: number | false;
}

/**
 * Wrap a Next.js App Router handler so it runs authenticated and tenant-scoped.
 *
 * The handler receives a `db` client that cannot read or write another
 * workspace's rows for any table in {@link WORKSPACE_SCOPED_TABLES}, closing the
 * "forgot the .eq('workspace_id')" class of bug at the routing layer.
 *
 *   export const GET = withWorkspace<{ id: string }>(async (req, { db, params }) => {
 *     const { data } = await db.from('campaigns').select('*').eq('id', params.id).single();
 *     return NextResponse.json(data);
 *   });
 */
export function withWorkspace<P = Record<string, never>>(
  handler: Handler<P>,
  options: WithWorkspaceOptions = {},
) {
  return async (
    req: Request,
    routeCtx?: { params?: Promise<P> },
  ): Promise<Response> => {
    try {
      const limit = options.rateLimit;
      if (limit !== false) {
        const max = typeof limit === "number" ? limit : 60;
        const rl = await checkRateLimit(
          `ip:${getRateLimitKey(req)}`,
          max,
          60_000,
        );
        if (!rl.allowed) {
          return NextResponse.json(
            { error: "Too many requests" },
            {
              status: 429,
              headers: rl.resetAt
                ? {
                    "Retry-After": String(
                      Math.max(
                        1,
                        Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000),
                      ),
                    ),
                  }
                : undefined,
            },
          );
        }
      }

      const session = await getSession(req);
      const admin = createSupabaseAdminClient();
      const db = createScopedClient(admin, session.workspaceId);
      const params = (
        routeCtx?.params ? await routeCtx.params : ({} as P)
      ) as P;

      return await handler(req, { db, admin, session, params });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      const status =
        msg === "Unauthorized" || msg === "Not a workspace member" ? 401 : 500;
      return NextResponse.json({ error: msg }, { status });
    }
  };
}

export { createScopedClient };
