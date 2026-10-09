import { describe, it, expect } from "vitest";
import {
  applyJobPoll,
  initialResults,
  isSettled,
  tally,
  type SceneResult,
} from "@/lib/series/progress";

const pending = (i: number): SceneResult => ({
  sceneIndex: i,
  scene: `scene ${i}`,
  jobId: `job-${i}`,
  status: "pending",
});

describe("applyJobPoll", () => {
  it("a finished job with a picture becomes ready with that picture", () => {
    expect(
      applyJobPoll(pending(0), {
        status: "ready",
        outputUrls: ["https://x/a.png"],
      }),
    ).toMatchObject({ status: "ready", url: "https://x/a.png" });
  });

  it("ready but no picture yet stays pending — it is not a result", () => {
    expect(
      applyJobPoll(pending(0), { status: "ready", outputUrls: [] }).status,
    ).toBe("pending");
    expect(applyJobPoll(pending(0), { status: "ready" }).status).toBe(
      "pending",
    );
  });

  it("still working stays pending", () => {
    for (const status of ["queued", "processing", "pending"]) {
      expect(applyJobPoll(pending(0), { status }).status).toBe("pending");
    }
  });

  it("a failed job carries the server's reason, or says it was refunded", () => {
    expect(
      applyJobPoll(pending(0), { status: "failed", errorMessage: "NSFW" }),
    ).toMatchObject({
      status: "failed",
      error: "NSFW",
    });
    expect(
      applyJobPoll(pending(0), { status: "failed", errorMessage: null }).error,
    ).toMatch(/refunded/);
  });

  it("a failed poll (no answer) changes nothing", () => {
    expect(applyJobPoll(pending(0), null)).toEqual(pending(0));
  });

  it("a finished scene never goes back — a late 'processing' can't undo it", () => {
    const done = applyJobPoll(pending(0), {
      status: "ready",
      outputUrls: ["u"],
    });
    expect(applyJobPoll(done, { status: "processing" })).toBe(done);
    const failed = applyJobPoll(pending(0), { status: "failed" });
    expect(applyJobPoll(failed, { status: "ready", outputUrls: ["u"] })).toBe(
      failed,
    );
  });
});

describe("tally / isSettled", () => {
  const rs: SceneResult[] = [
    { ...pending(0), status: "ready", url: "u" },
    { ...pending(1), status: "failed", error: "x" },
    pending(2),
  ];
  it("counts each kind", () => {
    expect(tally(rs)).toEqual({ ready: 1, failed: 1, pending: 1 });
  });
  it("is settled only when nothing is pending", () => {
    expect(isSettled(rs)).toBe(false);
    expect(isSettled(rs.slice(0, 2))).toBe(true);
    expect(isSettled([])).toBe(true);
  });
});

describe("initialResults", () => {
  it("started scenes wait; refused ones show as failed straight away", () => {
    const r = initialResults(
      [
        { jobId: "j0", sceneIndex: 0, scene: "a" },
        { jobId: "j2", sceneIndex: 2, scene: "c" },
      ],
      [{ sceneIndex: 1, scene: "b", reason: "refunded" }],
    );
    expect(r.map((x) => [x.sceneIndex, x.status])).toEqual([
      [0, "pending"],
      [1, "failed"],
      [2, "pending"],
    ]);
    expect(r[1]).toMatchObject({ jobId: null, error: "refunded" });
  });
  it("keeps scenes in the order the user wrote them", () => {
    const r = initialResults(
      [
        { jobId: "j3", sceneIndex: 3, scene: "d" },
        { jobId: "j0", sceneIndex: 0, scene: "a" },
      ],
      [],
    );
    expect(r.map((x) => x.sceneIndex)).toEqual([0, 3]);
  });
});
