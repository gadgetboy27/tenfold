import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The route's job is ordering: verify → log → process → mark. These pin the
 * 400 on a bad signature, that nothing is processed before it is logged, and
 * that a replayed event id is acknowledged without being processed twice.
 */

const verify = vi.fn();
const handle = vi.fn();
const insert = vi.fn();
const eqUpdate = vi.fn();
const update = vi.fn(() => ({ eq: eqUpdate }));
const maybeSingle = vi.fn();
const order: string[] = [];

vi.mock("@/lib/stripe/webhooks", () => ({
  verifyStripeWebhook: verify,
  handleStripeEvent: handle,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      insert,
      update,
      select: () => ({ eq: () => ({ maybeSingle }) }),
    }),
  }),
}));

const post = (body = '{"id":"evt_1"}') =>
  new Request("http://x/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig" },
    body,
  });

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  verify.mockReturnValue({ id: "evt_1", type: "x" });
  insert.mockImplementation(async () => (order.push("log"), { error: null }));
  handle.mockImplementation(async () => void order.push("handle"));
  eqUpdate.mockResolvedValue({ error: null });
  maybeSingle.mockResolvedValue({ data: { processed: true, error: null } });
});

describe("POST /api/webhooks/stripe", () => {
  it("answers 400 on a bad signature and does nothing else", async () => {
    verify.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(post());
    expect(res.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
    expect(handle).not.toHaveBeenCalled();
  });

  it("logs the payload before processing it, then marks it processed", async () => {
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(order).toEqual(["log", "handle"]);
    expect(insert).toHaveBeenCalledWith({
      source: "stripe",
      event_id: "evt_1",
      payload: { id: "evt_1" },
    });
    expect(update).toHaveBeenCalledWith({ processed: true, error: null });
    expect(eqUpdate).toHaveBeenCalledWith("event_id", "evt_1");
  });

  const duplicate = () =>
    insert.mockResolvedValue({
      error: { code: "23505", message: "duplicate" },
    });

  it("acknowledges a cleanly processed replay without processing it again", async () => {
    duplicate();
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(handle).not.toHaveBeenCalled();
  });

  it("reprocesses a retry of an event whose earlier run failed", async () => {
    duplicate();
    maybeSingle.mockResolvedValue({
      data: { processed: true, error: "grant_credits failed: db down" },
    });
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ processed: true, error: null });
  });

  it("reprocesses a retry whose earlier run never finished", async () => {
    duplicate();
    maybeSingle.mockResolvedValue({ data: { processed: false, error: null } });
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    await POST(post());
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it("answers 500 when the log insert fails for any other reason, without processing", async () => {
    insert.mockResolvedValue({ error: { code: "08006", message: "conn" } });
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(post());
    expect(res.status).toBe(500);
    expect(handle).not.toHaveBeenCalled();
  });

  it("records the error and answers 500 when processing throws", async () => {
    handle.mockRejectedValue(new Error("grant_credits failed: db down"));
    const { POST } = await import("@/app/api/webhooks/stripe/route");
    const res = await POST(post());
    expect(res.status).toBe(500);
    expect(update).toHaveBeenCalledWith({
      processed: true,
      error: "grant_credits failed: db down",
    });
  });
});
