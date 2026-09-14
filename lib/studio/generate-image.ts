import { api } from "@/lib/api";

/**
 * Start one ad-hoc image and wait for it.
 *
 * The same `POST /api/jobs` (`image_generation`) the rail's Create step uses,
 * followed by the same `GET /api/jobs/:id` poll — which asks fal directly
 * after 20s, so a late webhook can't strand the wait. Resolves to the image
 * URL; throws with a message fit to show the user.
 */
export async function generateSingleImage(opts: {
  workspaceSlug: string;
  campaignId: string;
  prompt: string;
  cost: number;
  /** Called as soon as the job is accepted — credits have left at that point. */
  onAccepted?: () => void;
  /** Poll ticks of 2s. A single image lands in 10–30s; 60 is a wide margin. */
  maxTicks?: number;
}): Promise<string> {
  const res = await api("/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      campaignId: opts.campaignId,
      type: "image_generation",
      params: { prompt: opts.prompt },
    }),
    workspaceSlug: opts.workspaceSlug,
  });
  const data = (await res.json().catch(() => ({}))) as {
    jobId?: string;
    error?: string;
  };
  if (!res.ok || !data.jobId) {
    throw new Error(
      res.status === 402
        ? `Not enough credits — this costs ${opts.cost}.`
        : (data.error ?? "Couldn't start the image"),
    );
  }
  opts.onAccepted?.();

  for (let i = 0; i < (opts.maxTicks ?? 60); i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const jr = await api(`/api/jobs/${data.jobId}`, {
      workspaceSlug: opts.workspaceSlug,
    });
    if (!jr.ok) continue;
    const job = (await jr.json()) as {
      status: string;
      outputUrls?: string[];
      errorMessage?: string | null;
    };
    if (job.status === "ready" && job.outputUrls?.[0]) return job.outputUrls[0];
    if (job.status === "failed") {
      throw new Error(job.errorMessage ?? "Image generation failed");
    }
  }
  throw new Error(
    "Still rendering — it'll appear in your Gallery when it lands.",
  );
}
