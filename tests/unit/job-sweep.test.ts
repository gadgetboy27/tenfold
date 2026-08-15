import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The sweeper moves real money, so what's asserted here is mostly what it must
 * NOT do: refund a job that delivered something, refund twice, refund one it
 * lost a race for, or write anything at all on a dry run.
 */

interface Call {
  m: string;
  args: unknown[];
}

/** Minimal chainable PostgREST stand-in — every builder method returns itself,
 *  and awaiting resolves via the test's own dispatcher. */
function makeAdmin(
  resolve: (table: string, calls: Call[]) => unknown,
  record?: (table: string, calls: Call[]) => void,
) {
  return {
    from: (table: string) => {
      const calls: Call[] = [];
      const obj: Record<string, unknown> = {};
      for (const m of [
        "select",
        "in",
        "lt",
        "order",
        "limit",
        "eq",
        "update",
        "not",
        "gte",
      ]) {
        obj[m] = (...args: unknown[]) => {
          calls.push({ m, args });
          return obj;
        };
      }
      obj.then = (
        res: (v: unknown) => unknown,
        rej: (e: unknown) => unknown,
      ) => {
        record?.(table, calls);
        return Promise.resolve(resolve(table, calls)).then(res, rej);
      };
      return obj;
    },
  };
}

const JOB = {
  id: "job-1",
  type: "logo_concepts",
  status: "processing",
  campaign_id: "camp-1",
  workspace_id: "ws-1",
  credits_charged: 30,
  input_params: {},
  // Two hours old — comfortably past any threshold.
  created_at: new Date(Date.now() - 120 * 60_000).toISOString(),
};

const isUpdate = (calls: Call[]) => calls.some((c) => c.m === "update");

async function loadSweeper(opts: {
  assetCount: number;
  updateWins?: boolean;
  refund?: ReturnType<typeof vi.fn>;
  advance?: ReturnType<typeof vi.fn>;
  jobs?: unknown[];
  onWrite?: (table: string, calls: Call[]) => void;
}) {
  const refund = opts.refund ?? vi.fn(async () => ({ success: true }));
  const advance = opts.advance ?? vi.fn(async () => undefined);

  vi.doMock("@/lib/supabase/admin", () => ({
    createSupabaseAdminClient: () =>
      makeAdmin(
        (table, calls) => {
          if (table === "assets") return { count: opts.assetCount };
          if (table === "creative_jobs") {
            if (isUpdate(calls)) {
              return {
                data: opts.updateWins === false ? [] : [{ id: JOB.id }],
              };
            }
            return { data: opts.jobs ?? [JOB], error: null };
          }
          return { data: null, error: null };
        },
        (table, calls) => {
          if (isUpdate(calls)) opts.onWrite?.(table, calls);
        },
      ),
  }));
  vi.doMock("@/lib/credits/refund", () => ({ refundCredits: refund }));
  vi.doMock("@/lib/foreman/advance", () => ({ advanceRunForJob: advance }));

  const mod = await import("@/lib/jobs/sweep");
  return { ...mod, refund, advance };
}

describe("sweepStalledJobs", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("refunds a stalled job that delivered nothing", async () => {
    const { sweepStalledJobs, refund } = await loadSweeper({ assetCount: 0 });
    const result = await sweepStalledJobs();

    expect(result.refunded).toBe(1);
    expect(result.creditsRefunded).toBe(30);
    expect(result.settledPartial).toBe(0);
    expect(refund).toHaveBeenCalledWith("job-1");
  });

  it("does NOT refund a job that delivered some assets", async () => {
    // The webhook's own rule: any asset ≥ 1 completes and charges. The same
    // half-delivered outcome must not cost nothing here and everything there.
    const { sweepStalledJobs, refund } = await loadSweeper({ assetCount: 3 });
    const result = await sweepStalledJobs();

    expect(result.settledPartial).toBe(1);
    expect(result.refunded).toBe(0);
    expect(result.creditsRefunded).toBe(0);
    expect(refund).not.toHaveBeenCalled();
  });

  it("does not refund when a webhook settled the job first", async () => {
    // The UPDATE is guarded on status still being in-flight; zero rows back
    // means a webhook won the race and its outcome is the real one.
    const { sweepStalledJobs, refund } = await loadSweeper({
      assetCount: 0,
      updateWins: false,
    });
    await sweepStalledJobs();
    expect(refund).not.toHaveBeenCalled();
  });

  it("writes nothing and refunds nothing on a dry run", async () => {
    const writes: string[] = [];
    const { sweepStalledJobs, refund } = await loadSweeper({
      assetCount: 0,
      onWrite: (table) => writes.push(table),
    });
    const result = await sweepStalledJobs({ dryRun: true });

    expect(result.refunded).toBe(1); // reported…
    expect(refund).not.toHaveBeenCalled(); // …but not performed
    expect(writes).toEqual([]);
  });

  it("marks a swept job so a late webhook can be ignored", async () => {
    const patches: Record<string, unknown>[] = [];
    const { sweepStalledJobs, SWEPT_MARKER } = await loadSweeper({
      assetCount: 0,
      onWrite: (table, calls) => {
        if (table !== "creative_jobs") return;
        const patch = calls.find((c) => c.m === "update")?.args[0];
        patches.push(patch as Record<string, unknown>);
      },
    });
    await sweepStalledJobs();

    const patch = patches[0] as {
      status: string;
      fal_raw_error: { swept_by: string };
    };
    expect(patch.status).toBe("failed");
    expect(patch.fal_raw_error.swept_by).toBe(SWEPT_MARKER);
  });

  it("tells a foreman run its stage died, so the run doesn't hang too", async () => {
    const { sweepStalledJobs, advance } = await loadSweeper({ assetCount: 0 });
    await sweepStalledJobs();

    expect(advance).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1", status: "failed" }),
    );
  });

  it("keeps going when one job throws", async () => {
    const boom = vi.fn(async () => {
      throw new Error("refund exploded");
    });
    const { sweepStalledJobs } = await loadSweeper({
      assetCount: 0,
      refund: boom,
      jobs: [JOB, { ...JOB, id: "job-2" }],
    });
    const result = await sweepStalledJobs();

    expect(result.examined).toBe(2);
    expect(result.errored).toBe(2);
  });

  it("only considers jobs still in flight", async () => {
    let statusFilter: unknown[] = [];
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () =>
        makeAdmin((table, calls) => {
          if (table === "creative_jobs" && !isUpdate(calls)) {
            const inCall = calls.find((c) => c.m === "in");
            statusFilter = inCall?.args ?? [];
            return { data: [], error: null };
          }
          return { data: [], error: null };
        }),
    }));
    vi.doMock("@/lib/credits/refund", () => ({
      refundCredits: vi.fn(async () => ({ success: true })),
    }));
    const { sweepStalledJobs } = await import("@/lib/jobs/sweep");
    await sweepStalledJobs();

    expect(statusFilter[0]).toBe("status");
    expect(statusFilter[1]).toEqual(["queued", "processing"]);
  });
});
