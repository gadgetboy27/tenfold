import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The fal webhook and the "stuck job" poller both save a request's assets.
 * The webhook is idempotent via the unique index on
 * `webhook_logs (source, event_id)`; the poller only compared against a
 * SNAPSHOT of already-saved assets read before it started, then spent 10+
 * seconds downloading and re-uploading images. Any webhook that landed inside
 * that window was invisible to it, so it wrote a second copy — 8.5% of image
 * requests in production ended up duplicated.
 *
 * The fix makes both paths compete for that same unique row BEFORE doing any
 * work. These pin the claim's contract.
 */

vi.mock("@/lib/fal/client", () => ({ fal: { queue: {} } }));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const insert = vi.fn();
const eq = vi.fn();
const del = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      // A chain whose .eq() is recorded and which resolves when awaited.
      const chain: Record<string, unknown> = {
        insert: (row: unknown) => insert(table, row),
        delete: () => {
          del(table);
          return chain;
        },
        eq: (col: string, val: unknown) => {
          eq(col, val);
          return chain;
        },
        then: (resolve: (v: unknown) => unknown) => resolve({ error: null }),
      };
      return chain;
    },
  }),
}));

/** The mocked admin client the helpers are handed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = () => createSupabaseAdminClient() as any;

describe("claimFalRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("wins the claim when the row inserts cleanly", async () => {
    insert.mockResolvedValue({ error: null });
    const { claimFalRequest } = await import("@/lib/fal/result-fetcher");

    const won = await claimFalRequest(admin(), "req-1");

    expect(won).toBe(true);
    const [table, row] = insert.mock.calls[0];
    expect(table).toBe("webhook_logs");
    // Must land in the SAME (source, event_id) keyspace the webhook uses, or
    // the two paths aren't mutually exclusive at all.
    expect(row).toMatchObject({ source: "fal", event_id: "req-1" });
    // The marker is what lets a later release target only our own rows.
    expect((row as { payload: { claimed_by: string } }).payload.claimed_by).toBe(
      "result-fetcher",
    );
  });

  it("loses the claim on a unique violation — the webhook already owns it", async () => {
    insert.mockResolvedValue({ error: { code: "23505" } });
    const { claimFalRequest } = await import("@/lib/fal/result-fetcher");

    expect(await claimFalRequest(admin(), "req-2")).toBe(false);
  });

  it("declines rather than risking a double-save on an unexpected error", async () => {
    insert.mockResolvedValue({ error: { code: "08006", message: "conn lost" } });
    const { claimFalRequest } = await import("@/lib/fal/result-fetcher");

    // Not 23505, so ownership is genuinely unknown. Saving twice is the exact
    // failure being fixed, so an unknown error must mean "don't".
    expect(await claimFalRequest(admin(), "req-3")).toBe(false);
  });
});

describe("releaseFalRequest", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes only rows this module claimed, never a real webhook log", async () => {
    const { releaseFalRequest } = await import("@/lib/fal/result-fetcher");

    await releaseFalRequest(admin(), "req-4");

    expect(del).toHaveBeenCalledWith("webhook_logs");
    const filters = Object.fromEntries(eq.mock.calls);
    expect(filters).toMatchObject({
      source: "fal",
      event_id: "req-4",
      // Without this filter a release would delete a genuine delivery's log,
      // destroying the payload kept for debugging.
      "payload->>claimed_by": "result-fetcher",
    });
  });
});
