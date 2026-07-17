import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * The durable rate limiter. The atomic windowing is a Postgres function proven
 * against the live DB (8 concurrent hits at a limit of 5 → exactly 5 allowed,
 * and the counter survives a restart where the in-memory one reset). These
 * cover the TS wrapper: the key namespacing, and the fail-OPEN behaviour that
 * keeps a database blip from taking the whole product down.
 */

let rpcResult: { data: unknown; error: unknown } = {
  data: { allowed: true, remaining: 29, reset_at: new Date().toISOString() },
  error: null,
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => rpcResult,
  }),
}));

const { checkRateLimit, generationLimitKey } =
  await import("@/lib/security/rate-limit");

afterEach(() => {
  rpcResult = {
    data: { allowed: true, remaining: 29, reset_at: new Date().toISOString() },
    error: null,
  };
});

describe("checkRateLimit", () => {
  it("allows when under the limit", async () => {
    const r = await checkRateLimit("gen:ws-1", 30, 60_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(29);
  });

  it("denies when the function says so", async () => {
    rpcResult = {
      data: {
        allowed: false,
        remaining: 0,
        reset_at: new Date().toISOString(),
      },
      error: null,
    };
    expect((await checkRateLimit("gen:ws-1", 30, 60_000)).allowed).toBe(false);
  });

  it("FAILS OPEN when the database errors", async () => {
    // The credit ledger is the hard spend bound; this is burst protection. A
    // limiter that hard-blocks every request on a DB blip is a self-inflicted
    // outage, so a failure must allow through, not deny.
    rpcResult = { data: null, error: { message: "connection reset" } };
    const r = await checkRateLimit("gen:ws-1", 30, 60_000);
    expect(r.allowed).toBe(true);
  });

  it("unwraps a PostgREST array-wrapped result", async () => {
    rpcResult = {
      data: [{ allowed: true, remaining: 5, reset_at: null }],
      error: null,
    };
    expect((await checkRateLimit("k", 10, 1000)).remaining).toBe(5);
  });

  it("namespaces the generation key by workspace", () => {
    // gen: prefix keeps it from colliding with the ip: bucket, so hammering
    // via the API and via a shared IP don't share a counter by accident.
    expect(generationLimitKey("ws-abc")).toBe("gen:ws-abc");
  });
});
