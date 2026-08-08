import { describe, it, expect, vi, beforeEach } from "vitest";
import { patchStage } from "@/lib/foreman/execute";
import { buildStages, DEFAULT_RUN_OPTIONS } from "@/lib/foreman/plan";

// The advance path runs INSIDE the fal webhook, which processes every
// generation for every user. Its most important property is not that it
// advances runs correctly — it's that it does nothing at all, cheaply, for
// the traffic that isn't a run.
describe("advanceRunForJob — safety for non-run traffic", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.FEATURE_FOREMAN;
  });

  it("returns without touching the database when the job has no runId", async () => {
    const admin = vi.fn();
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: admin,
    }));
    const { advanceRunForJob } = await import("@/lib/foreman/advance");

    await advanceRunForJob({ id: "job-1", input_params: { style: "x" } });
    await advanceRunForJob({ id: "job-2", input_params: null });
    await advanceRunForJob({ id: "job-3" });

    // No client constructed at all: for existing traffic this is a property
    // read and a return.
    expect(admin).not.toHaveBeenCalled();
  });

  it("does nothing when the flag is off, even for a real run job", async () => {
    const admin = vi.fn();
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: admin,
    }));
    const { advanceRunForJob } = await import("@/lib/foreman/advance");

    await advanceRunForJob({
      id: "job-4",
      input_params: { runId: "run-1", runStage: "images" },
    });
    expect(admin).not.toHaveBeenCalled();
  });

  it("never throws, so a broken run cannot fail the webhook", async () => {
    process.env.FEATURE_FOREMAN = "1";
    vi.doMock("@/lib/supabase/admin", () => ({
      createSupabaseAdminClient: () => {
        throw new Error("database is on fire");
      },
    }));
    const { advanceRunForJob } = await import("@/lib/foreman/advance");

    await expect(
      advanceRunForJob({
        id: "job-5",
        input_params: { runId: "run-1", runStage: "images" },
      }),
    ).resolves.toBeUndefined();
  });
});

describe("patchStage", () => {
  it("changes only the named stage", () => {
    const stages = buildStages(DEFAULT_RUN_OPTIONS);
    const next = patchStage(stages, "video", { status: "completed" });
    expect(next.find((s) => s.stage === "video")?.status).toBe("completed");
    expect(next.find((s) => s.stage === "images")?.status).toBe("pending");
    expect(next).toHaveLength(stages.length);
  });

  it("does not mutate the input", () => {
    const stages = buildStages(DEFAULT_RUN_OPTIONS);
    patchStage(stages, "images", { status: "failed" });
    expect(stages.find((s) => s.stage === "images")?.status).toBe("pending");
  });
});
