/**
 * Where each scene of a running Series is, from the job poll. Pure, so the
 * panel stays a thin shell and the rules are testable.
 */
export type SceneStatus = "pending" | "ready" | "failed";

export interface SceneResult {
  sceneIndex: number;
  scene: string;
  jobId: string | null;
  status: SceneStatus;
  url?: string;
  error?: string;
}

/** The slice of GET /api/jobs/:id this needs. */
export interface JobPoll {
  status: string;
  outputUrls?: string[];
  errorMessage?: string | null;
}

/** One poll's answer applied to one scene. A scene never goes back from done. */
export function applyJobPoll(r: SceneResult, job: JobPoll | null): SceneResult {
  if (r.status !== "pending" || !job) return r;
  if (job.status === "ready" && job.outputUrls?.[0]) {
    return { ...r, status: "ready", url: job.outputUrls[0] };
  }
  if (job.status === "failed") {
    return {
      ...r,
      status: "failed",
      error:
        job.errorMessage || "This scene didn't render — you were refunded.",
    };
  }
  return r;
}

export function tally(rs: readonly SceneResult[]) {
  return {
    ready: rs.filter((r) => r.status === "ready").length,
    failed: rs.filter((r) => r.status === "failed").length,
    pending: rs.filter((r) => r.status === "pending").length,
  };
}

export const isSettled = (rs: readonly SceneResult[]) =>
  rs.every((r) => r.status !== "pending");

/** Scenes the server refused up front show as failed straight away. */
export function initialResults(
  started: ReadonlyArray<{ jobId: string; sceneIndex: number; scene: string }>,
  failed: ReadonlyArray<{ sceneIndex: number; scene: string; reason: string }>,
): SceneResult[] {
  return [
    ...started.map((s) => ({
      sceneIndex: s.sceneIndex,
      scene: s.scene,
      jobId: s.jobId,
      status: "pending" as const,
    })),
    ...failed.map((f) => ({
      sceneIndex: f.sceneIndex,
      scene: f.scene,
      jobId: null,
      status: "failed" as const,
      error: f.reason,
    })),
  ].sort((a, b) => a.sceneIndex - b.sceneIndex);
}
