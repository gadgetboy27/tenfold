"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import {
  applyJobPoll,
  initialResults,
  isSettled,
  tally,
  type JobPoll,
  type SceneResult,
} from "@/lib/series/progress";

const POLL_MS = 4000;
const POLL_MAX_MS = 5 * 60 * 1000;

/**
 * Start a Series and follow it to the end: POST the scenes, put each job on
 * screen, poll every pending job until it lands or fails. Stops quietly if the
 * panel is closed mid-run — the images still arrive in the project.
 */
export function useSeriesRun(campaignId: string | null) {
  const { workspaceSlug, creditBalance, setCreditBalance } = useAppStore();
  const [starting, setStarting] = useState(false);
  const [results, setResults] = useState<SceneResult[]>([]);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function pollAll(initial: SceneResult[]) {
    let current = initial;
    for (
      let waited = 0;
      waited < POLL_MAX_MS && !isSettled(current);
      waited += POLL_MS
    ) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      if (!alive.current) return;
      current = await Promise.all(
        current.map(async (r) => {
          if (r.status !== "pending" || !r.jobId) return r;
          const res = await api(`/api/jobs/${r.jobId}`, {
            workspaceSlug,
          }).catch(() => null);
          const job = res?.ok ? ((await res.json()) as JobPoll) : null;
          return applyJobPoll(r, job);
        }),
      );
      setResults(current);
    }
    if (!alive.current) return;
    const t = tally(current);
    if (t.pending > 0)
      toast.error(
        "Some scenes are taking longer than usual — they'll appear in your gallery.",
      );
    else if (t.ready > 0)
      toast.success(
        `${t.ready} scene${t.ready > 1 ? "s" : ""} ready — saved to this project`,
      );
  }

  async function start(
    subjectUrl: string,
    scenes: string[],
    fallbackCost: number,
  ) {
    setStarting(true);
    setResults([]);
    try {
      const res = await api(`/api/campaigns/${campaignId}/series`, {
        method: "POST",
        body: JSON.stringify({ subjectUrl, scenes }),
        workspaceSlug,
      });
      const data = (await res.json()) as {
        jobs?: { jobId: string; sceneIndex: number; scene: string }[];
        failed?: { sceneIndex: number; scene: string; reason: string }[];
        creditCost?: number;
        error?: string;
        needed?: number;
      };
      if (!res.ok || !data.jobs) {
        throw new Error(
          res.status === 402
            ? `Not enough credits — this needs ${data.needed ?? fallbackCost}.`
            : (data.error ?? "Couldn't start the series"),
        );
      }
      setCreditBalance(creditBalance - (data.creditCost ?? 0));
      const initial = initialResults(data.jobs, data.failed ?? []);
      setResults(initial);
      setStarting(false);
      await pollAll(initial);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the series");
    } finally {
      setStarting(false);
    }
  }

  const running = results.length > 0 && !isSettled(results);
  return { results, starting, running, busy: starting || running, start };
}
