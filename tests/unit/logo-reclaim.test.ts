import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * lib/logo/reclaim.ts — the logo poll's fallback for a late fal webhook.
 *
 * Six Recraft concepts render in ~12s; their webhooks have arrived 30–60s
 * later and once 75 minutes later. These tests pin the contract that lets the
 * poll deliver instead: ask fal only once the job is old enough, never touch a
 * request the webhook already logged, claim before saving so the two paths
 * can't double-save, and settle a request fal reports as failed without ever
 * treating our own network error as fal's verdict.
 */

const status = vi.fn();
const result = vi.fn();
vi.mock("@/lib/fal/client", () => ({
  fal: { queue: { status, result } },
}));

const handleSuccess = vi.fn();
const handleFailure = vi.fn();
vi.mock("@/lib/fal/handle-result", () => ({ handleSuccess, handleFailure }));

const claimFalRequest = vi.fn();
const releaseFalRequest = vi.fn();
vi.mock("@/lib/fal/result-fetcher", () => ({
  claimFalRequest,
  releaseFalRequest,
}));

// Only webhook_logs is read here; `seen` is what it answers with.
let seen: string[] = [];
const admin = {
  from: () => ({
    select: () => ({
      eq: () => ({
        in: async () => ({ data: seen.map((event_id) => ({ event_id })) }),
      }),
    }),
  }),
} as never;

const NOW = 1_000_000;
const job = (over: Record<string, unknown> = {}) => ({
  id: "job-1",
  campaign_id: "camp-1",
  workspace_id: "ws-1",
  type: "logo_concepts",
  status: "processing",
  credits_charged: 32,
  fal_request_id: "req-0",
  fal_raw_error: null,
  created_at: new Date(NOW - 20_000).toISOString(),
  input_params: {
    expected_images: 2,
    directions: [
      { index: 0, label: "Concept 1", requestId: "req-0", prompt: "p0" },
      { index: 1, label: "Concept 2", requestId: "req-1", prompt: "p1" },
    ],
  },
  ...over,
});

describe("reclaimLogoJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seen = [];
    claimFalRequest.mockResolvedValue(true);
    status.mockResolvedValue({ status: "COMPLETED" });
    result.mockResolvedValue({ data: { images: [{ url: "u" }] } });
  });

  it("does not ask fal about a job younger than the reclaim threshold", async () => {
    const { reclaimLogoJobs } = await import("@/lib/logo/reclaim");
    const changed = await reclaimLogoJobs(
      admin,
      [job({ created_at: new Date(NOW - 3_000).toISOString() })],
      NOW,
    );
    expect(changed).toBe(false);
    expect(status).not.toHaveBeenCalled();
  });

  it("ignores jobs that are not processing logo jobs", async () => {
    const { reclaimLogoJobs } = await import("@/lib/logo/reclaim");
    await reclaimLogoJobs(
      admin,
      [job({ status: "completed" }), job({ type: "image_generation" })],
      NOW,
    );
    expect(status).not.toHaveBeenCalled();
  });

  it("skips requests the webhook (or a prior claim) already logged", async () => {
    seen = ["req-0"];
    const { reclaimLogoJobs } = await import("@/lib/logo/reclaim");
    await reclaimLogoJobs(admin, [job()], NOW);
    expect(status).toHaveBeenCalledTimes(1);
    expect(status.mock.calls[0][1]).toEqual({ requestId: "req-1" });
  });

  it("claims, fetches and hands a COMPLETED request to the webhook's handler with its direction", async () => {
    const { reclaimLogoJobs } = await import("@/lib/logo/reclaim");
    const changed = await reclaimLogoJobs(admin, [job()], NOW);
    expect(changed).toBe(true);
    expect(claimFalRequest).toHaveBeenCalledTimes(2);
    expect(handleSuccess).toHaveBeenCalledTimes(2);
    const [, data, direction] = handleSuccess.mock.calls[1];
    expect(data).toEqual({ images: [{ url: "u" }] });
    expect(direction).toMatchObject({
      index: 1,
      requestId: "req-1",
      prompt: "p1",
    });
  });

  it("leaves an unfinished request alone — no claim, nothing changed", async () => {
    status.mockResolvedValue({ status: "IN_PROGRESS" });
    const { reclaimLogoJobs } = await import("@/lib/logo/reclaim");
    expect(await reclaimLogoJobs(admin, [job()], NOW)).toBe(false);
    expect(claimFalRequest).not.toHaveBeenCalled();
    expect(handleSuccess).not.toHaveBeenCalled();
  });

  it("losing the claim means the webhook owns it — never save a second copy", async () => {
    claimFalRequest.mockResolvedValue(false);
    const { reclaimLogoJobs } = await import("@/lib/logo/reclaim");
    expect(await reclaimLogoJobs(admin, [job()], NOW)).toBe(false);
    expect(result).not.toHaveBeenCalled();
    expect(handleSuccess).not.toHaveBeenCalled();
  });

  it("a result the model failed (HTTP status from fal) settles through the failure path", async () => {
    result.mockRejectedValue(
      Object.assign(new Error("Unexpected status code: 422"), {
        status: 422,
        body: { detail: [{ msg: "prompt rejected" }] },
      }),
    );
    const { reclaimLogoJobs } = await import("@/lib/logo/reclaim");
    await reclaimLogoJobs(
      admin,
      [
        job({
          input_params: {
            directions: [{ index: 0, label: "Concept 1", requestId: "req-0" }],
          },
        }),
      ],
      NOW,
    );
    expect(handleFailure).toHaveBeenCalledTimes(1);
    expect(handleFailure.mock.calls[0][1]).toBe("prompt rejected");
    expect(releaseFalRequest).not.toHaveBeenCalled();
  });

  it("our own network error is not fal's verdict — release the claim, keep waiting", async () => {
    result.mockRejectedValue(new Error("fetch failed"));
    const { reclaimLogoJobs } = await import("@/lib/logo/reclaim");
    const changed = await reclaimLogoJobs(
      admin,
      [
        job({
          input_params: {
            directions: [{ index: 0, label: "Concept 1", requestId: "req-0" }],
          },
        }),
      ],
      NOW,
    );
    expect(changed).toBe(false);
    expect(releaseFalRequest).toHaveBeenCalledWith(admin, "req-0");
    expect(handleFailure).not.toHaveBeenCalled();
  });

  it("falls back to fal_request_id for single-request jobs (finalize, refine)", async () => {
    const { reclaimLogoJobs } = await import("@/lib/logo/reclaim");
    await reclaimLogoJobs(
      admin,
      [
        job({
          type: "logo_finalize",
          fal_request_id: "req-f",
          input_params: {},
        }),
      ],
      NOW,
    );
    expect(status.mock.calls[0][1]).toEqual({ requestId: "req-f" });
    expect(handleSuccess.mock.calls[0][2]).toBeNull();
  });
});
