import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The money path. This is the only backend that charges per post, so the two
 * failures that matter are charging for a post that never went out, and sending
 * one that was never charged.
 */

const debitCredits = vi.fn();
const refundCredits = vi.fn();
const publishViaBroker = vi.fn();

vi.mock("@/lib/credits/debit", () => ({
  debitCredits: (...a: unknown[]) => debitCredits(...a),
}));
vi.mock("@/lib/credits/refund", () => ({
  refundCredits: (...a: unknown[]) => refundCredits(...a),
}));
vi.mock("@/lib/social/broker/outstand", () => ({
  publishViaBroker: (...a: unknown[]) => publishViaBroker(...a),
}));

const params = {
  workspaceId: "ws-1",
  platform: "x" as const,
  mediaUrl: "https://cdn.example/a.jpg",
  caption: "hello",
};

beforeEach(() => {
  vi.clearAllMocks();
  debitCredits.mockResolvedValue({ success: true, newBalance: 100 });
  publishViaBroker.mockResolvedValue({ id: "post_1" });
  refundCredits.mockResolvedValue({ success: true });
});

describe("publishBrokeredWithCredits", () => {
  it("charges before publishing, and keeps the charge on success", async () => {
    const { publishBrokeredWithCredits } = await import(
      "@/lib/social/broker/charge"
    );
    const out = await publishBrokeredWithCredits(params);

    expect(out).toEqual({ ok: true, postId: "post_1" });
    expect(debitCredits).toHaveBeenCalledWith(
      "ws-1",
      expect.any(String),
      "brokered_publish",
    );
    // Debit must precede the network call: charging after a successful post
    // means a user with no credits still posted.
    expect(debitCredits.mock.invocationCallOrder[0]).toBeLessThan(
      publishViaBroker.mock.invocationCallOrder[0],
    );
    expect(refundCredits).not.toHaveBeenCalled();
  });

  it("does not publish at all when the debit fails", async () => {
    debitCredits.mockResolvedValue({ success: false, newBalance: 0 });
    const { publishBrokeredWithCredits } = await import(
      "@/lib/social/broker/charge"
    );

    const out = await publishBrokeredWithCredits(params);

    expect(out.ok).toBe(false);
    expect(publishViaBroker).not.toHaveBeenCalled();
    // Nothing was charged, so nothing to give back.
    expect(refundCredits).not.toHaveBeenCalled();
    if (!out.ok) expect(out.error).toMatch(/connect it directly/i);
  });

  it("refunds the exact charge when publishing throws", async () => {
    publishViaBroker.mockRejectedValue(new Error("account disconnected"));
    const { publishBrokeredWithCredits } = await import(
      "@/lib/social/broker/charge"
    );

    const out = await publishBrokeredWithCredits(params);

    expect(out.ok).toBe(false);
    expect(refundCredits).toHaveBeenCalledTimes(1);
    // Same job id both ways, or the refund credits nothing and the charge
    // silently stands.
    const debitedJob = debitCredits.mock.calls[0][1];
    const refundedJob = refundCredits.mock.calls[0][0];
    expect(refundedJob).toBe(debitedJob);
  });

  it("surfaces the platform's own reason, not a generic failure", async () => {
    publishViaBroker.mockRejectedValue(new Error("Rate limited"));
    const { publishBrokeredWithCredits } = await import(
      "@/lib/social/broker/charge"
    );

    const out = await publishBrokeredWithCredits(params);
    if (!out.ok) expect(out.error).toMatch(/rate limited/i);
  });

  it("uses a fresh job id per attempt", async () => {
    const { publishBrokeredWithCredits } = await import(
      "@/lib/social/broker/charge"
    );
    await publishBrokeredWithCredits(params);
    await publishBrokeredWithCredits(params);

    // Reusing an id would make the second debit look like a duplicate of the
    // first to anything reading the ledger by job.
    expect(debitCredits.mock.calls[0][1]).not.toBe(
      debitCredits.mock.calls[1][1],
    );
  });
});
