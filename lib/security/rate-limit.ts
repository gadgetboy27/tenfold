import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limiting, shared across instances and durable across deploys.
 *
 * The old implementation was an in-memory Map. It had two silent weaknesses: it
 * reset on every deploy, and each Railway instance kept its own counter, so
 * scaling to N instances multiplied the effective limit by N. A limiter that
 * quietly weakens when you deploy or scale is barely a limiter. This backs it
 * with Postgres (already provisioned — no Redis) so there is one counter.
 *
 * This is BURST protection, not the spend bound. The hard bound on fal.ai cost
 * is the credit ledger (atomic, row-locked, proven race-safe) plus the daily
 * generation cap. So when the limiter's own DB call fails, it FAILS OPEN: a
 * transient Postgres blip must not block every generation and take the product
 * down, and the credit system still stops runaway spend.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date | null;
}

/** Identify the caller for an IP-scoped limit (unauth or shared endpoints). */
export function getRateLimitKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Consume one unit against `key`. Prefix the key by concern
 * (`gen:<workspaceId>`, `ip:<addr>`) so unrelated limits never share a bucket.
 */
export async function checkRateLimit(
  key: string,
  max = 60,
  windowMs = 60_000,
): Promise<RateLimitResult> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: Math.ceil(windowMs / 1000),
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as {
      allowed?: boolean;
      remaining?: number;
      reset_at?: string;
    } | null;
    // Deny ONLY on an explicit false. A missing or malformed answer is treated
    // as allowed, same as an outright error — this is burst protection, and a
    // limiter that can't get a clear yes/no must not silently deny all traffic.
    return {
      allowed: row?.allowed !== false,
      remaining: row?.remaining ?? max,
      resetAt: row?.reset_at ? new Date(row.reset_at) : null,
    };
  } catch (err) {
    // Fail OPEN — see the module note. Log it, because a limiter silently
    // failing open forever is its own silent-weakness.
    console.error(
      "[rate-limit] check failed, allowing through:",
      err instanceof Error ? err.message : err,
    );
    return { allowed: true, remaining: max, resetAt: null };
  }
}

/** Convenience: the workspace-scoped key for generation endpoints. */
export function generationLimitKey(workspaceId: string): string {
  return `gen:${workspaceId}`;
}
