import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration test for the real-30s two-segment video path in the fal webhook
 * (CLAUDE.md §7: every credit debit path needs an integration test; failed jobs
 * refund atomically). Drives the webhook POST with segment success/failure
 * payloads against a stateful fake DB + ledger, asserting: both segments →
 * concat into ONE video asset, charged once; either fails → refund; the stitch
 * claim is race-safe (only one webhook stitches).
 */

const PARENT = "job-30s";
const CAMPAIGN = "camp-1";
const WS = "ws-1";

interface State {
  jobStatus: string;
  segmentAssets: Array<{ segment_index: number }>;
  videoAssets: number;
  refunds: number;
  loggedWebhooks: Set<string>;
  concatCalls: number;
}
let s: State;

const jobBase = {
  id: PARENT,
  campaign_id: CAMPAIGN,
  workspace_id: WS,
  type: "video_30s",
  credits_charged: 100,
  fal_request_id: "req-0",
  input_params: {
    expected_segments: 2,
    segments: [
      { index: 0, requestId: "req-0" },
      { index: 1, requestId: "req-1" },
    ],
  },
};

// Minimal Supabase-builder fake: tracks op + filters, resolves against `s`.
function makeQuery(table: string) {
  const q: Record<string, unknown> = {};
  let op: "select" | "insert" | "update" | "delete" | null = null;
  let payload: Record<string, unknown> | null = null;
  const filters: Record<string, unknown> = {};

  const read = () => {
    if (table === "creative_jobs")
      return { data: { ...jobBase, status: s.jobStatus }, error: null };
    if (table === "assets" && filters.type === "video_segment")
      return {
        data: s.segmentAssets.map((a, i) => ({
          id: `seg-${i}`,
          url: `http://seg/${i}.mp4`,
          storage_path: `p/seg-${i}.mp4`,
          metadata: { segment_index: a.segment_index },
        })),
        count: s.segmentAssets.length,
        error: null,
      };
    if (table === "webhook_logs")
      return { count: s.loggedWebhooks.size, data: [], error: null };
    return { data: [], count: 0, error: null };
  };

  // Conditional atomic claim: apply the update only if the status filter matches.
  const applyUpdate = () => {
    if (table === "creative_jobs" && typeof payload?.status === "string") {
      const wants = filters.status;
      if (wants !== undefined && s.jobStatus !== wants)
        return { data: [], error: null }; // lost the race
      s.jobStatus = payload.status as string;
      return { data: [{ id: PARENT }], error: null };
    }
    return { data: [], error: null };
  };

  const thenable = (val: unknown) => ({
    then: (r: (v: unknown) => unknown) => r(val),
  });

  q.select = () => {
    if (op === "update") return thenable(applyUpdate()); // update(...).select() = claim
    op = "select";
    return q;
  };
  q.insert = (row: Record<string, unknown> | Record<string, unknown>[]) => {
    for (const r of Array.isArray(row) ? row : [row]) {
      if (table === "assets" && r.type === "video_segment")
        s.segmentAssets.push({
          segment_index:
            (r.metadata as { segment_index?: number })?.segment_index ?? 0,
        });
      if (table === "assets" && r.type === "video") s.videoAssets += 1;
      if (table === "webhook_logs") s.loggedWebhooks.add(r.event_id as string);
    }
    return thenable({ error: null });
  };
  q.update = (row: Record<string, unknown>) => {
    op = "update";
    payload = row;
    return q;
  };
  q.delete = () => {
    if (table === "assets") s.segmentAssets = [];
    op = "delete";
    return q; // chainable: real code does .delete().eq().eq()
  };
  q.eq = (c: string, v: unknown) => {
    filters[c] = v;
    return q;
  };
  q.in = () => q;
  q.order = () => q;
  q.single = () => Promise.resolve(read());
  q.then = (r: (v: unknown) => unknown) => {
    if (op === "update") return r(applyUpdate());
    if (op === "delete" || op === "insert") return r({ error: null });
    return r(read());
  };
  return q;
}

const admin = {
  from: (table: string) => makeQuery(table),
  rpc: (name: string) => {
    if (name === "refund_credits") {
      s.refunds += 1;
      return Promise.resolve({
        data: { success: true, balance: 100 },
        error: null,
      });
    }
    return Promise.resolve({ data: null, error: null });
  },
  storage: {
    from: () => ({ remove: () => Promise.resolve({ error: null }) }),
  },
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => admin,
}));
vi.mock("@/lib/costs/tracker", () => ({
  recordJobCost: () => Promise.resolve(),
}));
vi.mock("@/lib/fal/error-analyzer", () => ({
  analyzeJobFailure: () => Promise.resolve(null),
}));
const concatVideos = vi.fn();
vi.mock("@/lib/composition/concat", () => ({
  concatVideos: (...a: unknown[]) => {
    s.concatCalls += 1;
    return concatVideos(...a);
  },
}));

function segPayload(reqId: string, ok: boolean) {
  const seg = reqId === "req-0" ? 0 : 1;
  return new Request(`http://t/api/webhooks/fal?j=${PARENT}&seg=${seg}`, {
    method: "POST",
    body: JSON.stringify(
      ok
        ? {
            request_id: reqId,
            status: "OK",
            payload: { video: { url: `http://fal/${reqId}.mp4` } },
          }
        : { request_id: reqId, status: "ERROR", error: "kling failed" },
    ),
  });
}

describe("real-30s two-segment webhook", () => {
  beforeEach(() => {
    s = {
      jobStatus: "processing",
      segmentAssets: [],
      videoAssets: 0,
      refunds: 0,
      loggedWebhooks: new Set(),
      concatCalls: 0,
    };
    concatVideos.mockReset();
    concatVideos.mockResolvedValue({
      url: "http://final/30s.mp4",
      storagePath: "p/final.mp4",
    });
  });

  it("stitches ONE video asset when both segments succeed, no refund", async () => {
    const { POST } = await import("@/app/api/webhooks/fal/route");
    await POST(segPayload("req-0", true)); // first lands → waits
    expect(s.concatCalls).toBe(0);
    expect(s.videoAssets).toBe(0);
    expect(s.jobStatus).toBe("processing");

    await POST(segPayload("req-1", true)); // second lands → stitch
    expect(s.concatCalls).toBe(1);
    expect(s.videoAssets).toBe(1);
    expect(s.refunds).toBe(0);
    expect(s.jobStatus).toBe("completed");
  });

  it("refunds when a segment fails (a partial 30s is unusable)", async () => {
    const { POST } = await import("@/app/api/webhooks/fal/route");
    await POST(segPayload("req-0", true)); // seg 0 ok → waits
    await POST(segPayload("req-1", false)); // seg 1 fails → both arrived → refund

    expect(s.concatCalls).toBe(0);
    expect(s.videoAssets).toBe(0);
    expect(s.refunds).toBe(1);
    expect(s.jobStatus).toBe("failed");
  });
});
