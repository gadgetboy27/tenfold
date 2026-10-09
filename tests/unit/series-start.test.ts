import { describe, it, expect } from "vitest";
import { startSeries, type SeriesDeps } from "@/lib/series/start";
import { seriesResponse } from "@/lib/series/respond";
import { SCENE_CREDITS } from "@/lib/series/scenes";

/**
 * CLAUDE.md §7: every credit debit path has a test, insufficient credits are
 * caught BEFORE a job exists, and a failed job refunds. A Series is the first
 * route that does this once per scene, so the thing to prove is that each
 * scene's money follows its own job: a failure refunds exactly that scene.
 */
const SUBJECT =
  "https://abcd.supabase.co/storage/v1/object/public/assets/ws-1/camp/a.png";
const SCENES = ["on a desk", "in a hand", "outdoors", "flat lay"];

interface Rig {
  deps: SeriesDeps;
  calls: string[];
  inserted: Array<Record<string, unknown>>;
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
  debited: string[];
  refunded: string[];
  enqueued: Array<{ input: Record<string, unknown>; url: string }>;
}

function rig(
  opts: {
    balance?: number;
    debitFailsFor?: (n: number) => boolean;
    insertFailsFor?: (n: number) => boolean;
    enqueueFailsFor?: (n: number) => boolean;
  } = {},
): Rig {
  const r: Rig = {
    calls: [],
    inserted: [],
    updates: [],
    debited: [],
    refunded: [],
    enqueued: [],
    deps: undefined as unknown as SeriesDeps,
  };
  let ids = 0;
  const order = new Map<string, number>(); // jobId → scene number, by debit order
  r.deps = {
    workspaceId: "ws-1",
    campaignId: "camp-1",
    appUrl: "https://app.test",
    newId: () => `id-${ids++}`,
    getBalance: async () => opts.balance ?? 1000,
    debit: async (_ws, jobId) => {
      const n = order.size;
      order.set(jobId, n);
      r.calls.push(`debit:${jobId}`);
      if (opts.debitFailsFor?.(n)) return { success: false };
      r.debited.push(jobId);
      return { success: true };
    },
    refund: async (jobId) => void r.refunded.push(jobId),
    enqueue: async (input, url) => {
      const jobId = new URL(url).searchParams.get("j")!;
      r.calls.push(`enqueue:${jobId}`);
      if (opts.enqueueFailsFor?.(order.get(jobId)!))
        throw new Error("fal is down");
      r.enqueued.push({ input, url });
      return { requestId: `req-${jobId}` };
    },
    db: {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          const jobId = row.id as string;
          r.calls.push(`insert:${jobId}`);
          if (opts.insertFailsFor?.(order.get(jobId)!))
            return { error: { message: "db down" } };
          r.inserted.push(row);
          return { error: null };
        },
        update: (patch: Record<string, unknown>) => ({
          eq: async (_c: string, id: string) =>
            void r.updates.push({ id, patch }),
        }),
      }),
    },
  };
  return r;
}

const run = (r: Rig, scenes = SCENES) =>
  startSeries(r.deps, { subjectUrl: SUBJECT, scenes });

describe("a clean run", () => {
  it("makes one image_variation job per scene, charged at the variation price", async () => {
    const r = rig();
    const res = await run(r);
    expect(res.ok).toBe(true);
    expect(r.inserted).toHaveLength(SCENES.length);
    for (const row of r.inserted) {
      expect(row).toMatchObject({
        type: "image_variation",
        status: "queued",
        campaign_id: "camp-1",
        workspace_id: "ws-1",
        credits_charged: SCENE_CREDITS,
      });
    }
    if (res.ok) expect(res.charged).toBe(SCENES.length * SCENE_CREDITS);
    expect(r.refunded).toEqual([]);
  });

  it("records which series and scene each job is, and what it started from", async () => {
    const r = rig();
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    const params = r.inserted.map(
      (x) => x.input_params as Record<string, unknown>,
    );
    expect(new Set(params.map((p) => p.seriesId)).size).toBe(1);
    expect(params.every((p) => p.seriesId === res.seriesId)).toBe(true);
    expect(params.map((p) => p.sceneIndex).sort()).toEqual([0, 1, 2, 3]);
    expect(
      params.every((p) => p.subjectUrl === SUBJECT && p.seriesSize === 4),
    ).toBe(true);
    expect(params.map((p) => p.scene).sort()).toEqual([...SCENES].sort());
  });

  it("sends fal the subject picture and a prompt that keeps it unchanged", async () => {
    const r = rig();
    await run(r);
    expect(r.enqueued).toHaveLength(SCENES.length);
    for (const e of r.enqueued) {
      expect(e.input).toMatchObject({ image_url: SUBJECT, num_images: 1 });
      expect(String(e.input.prompt)).toMatch(/exactly as it is/);
    }
    expect(
      r.enqueued.some((e) => String(e.input.prompt).includes("in a hand")),
    ).toBe(true);
  });

  it("points each webhook at its own job, so the existing handler needs no change", async () => {
    const r = rig();
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    for (const s of res.started) {
      expect(r.enqueued.map((e) => e.url)).toContain(
        `https://app.test/api/webhooks/fal?j=${s.jobId}`,
      );
    }
  });

  it("moves each job to processing with fal's request id", async () => {
    const r = rig();
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    for (const s of res.started) {
      expect(r.updates).toContainEqual({
        id: s.jobId,
        patch: { fal_request_id: `req-${s.jobId}`, status: "processing" },
      });
    }
  });

  it("gives every job its own id", async () => {
    const r = rig();
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    expect(new Set(res.started.map((s) => s.jobId)).size).toBe(SCENES.length);
  });

  it("keeps each scene's index with its own text", async () => {
    const res = await run(rig());
    if (!res.ok) throw new Error("expected ok");
    for (const s of res.started) expect(SCENES[s.sceneIndex]).toBe(s.scene);
  });
});

describe("ordering — nothing reaches fal unless the money and the job are in place", () => {
  it("per scene: debit, then insert the job, then enqueue", async () => {
    const r = rig();
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    for (const s of res.started) {
      const seq = r.calls
        .filter((c) => c.endsWith(s.jobId))
        .map((c) => c.split(":")[0]);
      expect(seq).toEqual(["debit", "insert", "enqueue"]);
    }
  });
});

describe("insufficient credits are caught before any job exists", () => {
  it("one credit short: nothing is debited, inserted or sent", async () => {
    const need = SCENES.length * SCENE_CREDITS;
    const r = rig({ balance: need - 1 });
    const res = await run(r);
    expect(res).toMatchObject({ ok: false, needed: need, balance: need - 1 });
    expect(r.calls).toEqual([]);
    expect(r.inserted).toEqual([]);
    expect(r.enqueued).toEqual([]);
  });

  it("exactly enough is enough", async () => {
    const r = rig({ balance: SCENES.length * SCENE_CREDITS });
    expect((await run(r)).ok).toBe(true);
  });

  it("answers 402 with what is needed and what they have", async () => {
    const r = rig({ balance: 2 });
    const { status, body } = seriesResponse(await run(r));
    expect(status).toBe(402);
    expect(body).toMatchObject({ error: "Insufficient credits", balance: 2 });
    expect(body.needed).toBe(SCENES.length * SCENE_CREDITS);
  });
});

describe("a failure costs only the scene that failed", () => {
  it("the balance moving underneath us fails that scene alone — no job, no send", async () => {
    const r = rig({ debitFailsFor: (n) => n === 1 });
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].reason).toBe("Insufficient credits");
    expect(res.started).toHaveLength(SCENES.length - 1);
    expect(r.inserted).toHaveLength(SCENES.length - 1);
    expect(r.enqueued).toHaveLength(SCENES.length - 1);
    expect(r.refunded).toEqual([]); // it was never charged
    expect(res.charged).toBe((SCENES.length - 1) * SCENE_CREDITS);
  });

  it("a job row that won't insert is refunded and never sent", async () => {
    const r = rig({ insertFailsFor: (n) => n === 2 });
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    expect(res.failed).toHaveLength(1);
    expect(r.refunded).toHaveLength(1);
    const failedJob = r.refunded[0];
    expect(r.enqueued.some((e) => e.url.includes(`j=${failedJob}`))).toBe(
      false,
    );
    expect(res.started.map((s) => s.jobId)).not.toContain(failedJob);
  });

  it("a scene fal rejects is marked failed, refunded, and the rest carry on", async () => {
    const r = rig({ enqueueFailsFor: (n) => n === 3 });
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    expect(res.failed).toHaveLength(1);
    expect(res.started).toHaveLength(SCENES.length - 1);
    const failedJob = r.refunded[0];
    expect(r.updates).toContainEqual({
      id: failedJob,
      patch: { status: "failed", error_message: "fal is down" },
    });
    expect(res.charged).toBe((SCENES.length - 1) * SCENE_CREDITS);
  });

  it("every refund is for a job that was charged, once, and never for one that succeeded", async () => {
    const r = rig({
      insertFailsFor: (n) => n === 0,
      enqueueFailsFor: (n) => n === 2,
    });
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    expect(new Set(r.refunded).size).toBe(r.refunded.length); // no double refund
    for (const id of r.refunded) expect(r.debited).toContain(id);
    for (const s of res.started) expect(r.refunded).not.toContain(s.jobId);
    expect(res.started.length + res.failed.length).toBe(SCENES.length);
  });

  it("if every scene fails nothing is kept, and the answer says so", async () => {
    const r = rig({ enqueueFailsFor: () => true });
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    expect(res.started).toEqual([]);
    expect(res.charged).toBe(0);
    expect(r.refunded.sort()).toEqual([...r.debited].sort());
    const { status, body } = seriesResponse(res);
    expect(status).toBe(500);
    expect(String(body.error)).toMatch(/not been charged/);
  });

  it("failed scenes report which scene and why, so the UI can say", async () => {
    const r = rig({ enqueueFailsFor: (n) => n === 0 });
    const res = await run(r);
    if (!res.ok) throw new Error("expected ok");
    expect(res.failed[0]).toMatchObject({
      scene: expect.any(String),
      reason: expect.stringMatching(/refunded/),
    });
    expect(SCENES).toContain(res.failed[0].scene);
  });
});

describe("seriesResponse", () => {
  it("201 with the jobs, the failures and what was actually charged", async () => {
    const r = rig({ enqueueFailsFor: (n) => n === 0 });
    const { status, body } = seriesResponse(await run(r));
    expect(status).toBe(201);
    expect(body.creditCost).toBe((SCENES.length - 1) * SCENE_CREDITS);
    expect(body.jobs).toHaveLength(SCENES.length - 1);
    expect(body.failed).toHaveLength(1);
  });
});
