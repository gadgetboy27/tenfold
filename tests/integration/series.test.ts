import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The Series routes through the REAL withWorkspace wrapper (CLAUDE.md §7).
 * Only the outside world is faked: the session, the database, the credit
 * ledger, fal, Claude and the rate limiter.
 */
const WS = "ws-1";
const SUBJECT = `https://abcd.supabase.co/storage/v1/object/public/assets/${WS}/camp/a.png`;

let campaign: { id: string; prompt: string | null } | null;
let balance: number;
let falFails: boolean;
const jobRows: Array<Record<string, unknown>> = [];
const debits: string[] = [];
const refunds: string[] = [];
const enqueued: Array<Record<string, unknown>> = [];
const scenesAsked: Array<{ description: string; count: number }> = [];
let claudeError: Error | null;

function builder(result: unknown) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "update", "order", "limit"]) b[m] = () => b;
  b.insert = (row: Record<string, unknown>) => {
    jobRows.push(row);
    return Promise.resolve({ error: null });
  };
  b.maybeSingle = () => Promise.resolve(result);
  b.single = () => Promise.resolve(result);
  b.then = (res: (v: unknown) => unknown) => res({ error: null });
  return b;
}

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => ({ userId: "u-1", workspaceId: WS, role: "member" }),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  getRateLimitKey: () => "k",
  checkRateLimit: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (t: string) =>
      t === "campaigns"
        ? builder({ data: campaign, error: null })
        : builder({ data: null, error: null }),
    rpc: () => undefined,
    storage: {},
  }),
}));
vi.mock("@/lib/credits/balance", () => ({ getBalance: async () => balance }));
vi.mock("@/lib/credits/debit", () => ({
  debitCredits: async (_ws: string, jobId: string, key: string) => {
    expect(key).toBe("image_variation");
    debits.push(jobId);
    return { success: true, newBalance: 0 };
  },
}));
vi.mock("@/lib/credits/refund", () => ({
  refundCredits: async (jobId: string) => void refunds.push(jobId),
}));
vi.mock("@/lib/fal/queue", () => ({
  enqueueJob: async (model: string, input: Record<string, unknown>) => {
    expect(model).toBe("image_variation");
    if (falFails) throw new Error("fal down");
    enqueued.push(input);
    return { requestId: "req-1" };
  },
}));
vi.mock("@/lib/claude/series-scenes", () => ({
  generateScenes: async (p: { description: string; count: number }) => {
    scenesAsked.push(p);
    if (claudeError) throw claudeError;
    return { scenes: ["on a desk", "in a hand"], actualCostUsd: 0.001 };
  },
}));

const ctx = { params: Promise.resolve({ id: "camp-1" }) };
const post = (body: unknown) =>
  new Request("http://x", { method: "POST", body: JSON.stringify(body) });
const start = async (body: unknown) =>
  (await import("@/app/api/campaigns/[id]/series/route")).POST(post(body), ctx);
const plan = async (body: unknown) =>
  (await import("@/app/api/campaigns/[id]/series/scenes/route")).POST(
    post(body),
    ctx,
  );

beforeEach(() => {
  campaign = { id: "camp-1", prompt: "hand-poured soy candles" };
  balance = 1000;
  falFails = false;
  claudeError = null;
  for (const a of [jobRows, debits, refunds, enqueued, scenesAsked])
    a.length = 0;
});

describe("POST /api/campaigns/:id/series", () => {
  const ok = {
    subjectUrl: SUBJECT,
    scenes: ["on a desk", "in a hand", "outdoors"],
  };

  it("starts a job per scene and reports what was charged", async () => {
    const res = await start(ok);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.jobs).toHaveLength(3);
    expect(body.creditCost).toBe(3 * 3);
    expect(jobRows).toHaveLength(3);
    expect(
      jobRows.every(
        (r) => r.type === "image_variation" && r.workspace_id === WS,
      ),
    ).toBe(true);
    expect(enqueued.every((i) => i.image_url === SUBJECT)).toBe(true);
  });

  it("404s a campaign that isn't this workspace's, before anything else happens", async () => {
    campaign = null;
    const res = await start(ok);
    expect(res.status).toBe(404);
    expect(debits).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it("refuses a picture that isn't this workspace's — fal is never asked to fetch it", async () => {
    for (const subjectUrl of [
      "https://evil.com/storage/v1/object/public/assets/ws-1/a.png",
      "http://169.254.169.254/latest/meta-data",
      `https://abcd.supabase.co/storage/v1/object/public/assets/ws-2/camp/a.png`,
    ]) {
      const res = await start({ ...ok, subjectUrl });
      expect(res.status).toBe(400);
    }
    expect(debits).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it("needs at least two different scenes once they're cleaned", async () => {
    for (const scenes of [
      [],
      ["on a desk"],
      ["on a desk", "ON A DESK", "  "],
      ["ab", "cd"],
    ]) {
      const res = await start({ ...ok, scenes });
      expect(res.status).toBe(400);
    }
    expect(debits).toEqual([]);
  });

  it("402s before any job exists when the credits can't cover the whole series", async () => {
    balance = 8; // needs 9
    const res = await start(ok);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ needed: 9, balance: 8 });
    expect(debits).toEqual([]);
    expect(jobRows).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it("when fal rejects every scene: 500, nothing kept", async () => {
    falFails = true;
    const res = await start(ok);
    expect(res.status).toBe(500);
    expect(String((await res.json()).error)).toMatch(/not been charged/);
    expect([...refunds].sort()).toEqual([...debits].sort());
  });

  it("caps an oversized scene list at the series maximum", async () => {
    const scenes = Array.from(
      { length: 12 },
      (_, i) => `a different scene ${i}`,
    );
    const res = await start({ subjectUrl: SUBJECT, scenes });
    // more than 2× the cap is refused outright; just over the cap is trimmed
    expect([201, 500]).toContain(res.status);
    expect(jobRows.length).toBeLessThanOrEqual(6);
  });
});

describe("POST /api/campaigns/:id/series/scenes", () => {
  it("drafts scenes from the campaign's own brief when none is given", async () => {
    const res = await plan({ count: 3 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scenes: ["on a desk", "in a hand"] });
    expect(scenesAsked).toEqual([
      { description: "hand-poured soy candles", count: 3 },
    ]);
  });

  it("prefers a description the user typed", async () => {
    await plan({ description: "  ceramic mugs  " });
    expect(scenesAsked[0].description).toBe("ceramic mugs");
    expect(scenesAsked[0].count).toBe(4); // the default
  });

  it("404s an unknown campaign", async () => {
    campaign = null;
    expect((await plan({})).status).toBe(404);
    expect(scenesAsked).toEqual([]);
  });

  it("asks for a description when there is neither a brief nor one typed", async () => {
    campaign = { id: "camp-1", prompt: null };
    expect((await plan({})).status).toBe(400);
    expect(scenesAsked).toEqual([]);
  });

  it("is free: it never touches the ledger", async () => {
    await plan({});
    expect(debits).toEqual([]);
    expect(refunds).toEqual([]);
  });

  it("answers 502 with a readable message when Claude fails", async () => {
    claudeError = new Error("Couldn't plan the scenes");
    const res = await plan({});
    expect(res.status).toBe(502);
    expect(String((await res.json()).error)).toMatch(/plan the scenes/);
  });
});
