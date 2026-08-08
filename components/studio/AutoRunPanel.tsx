"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Wand2, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import type { RunStage, StageRecord } from "@/lib/foreman/plan";

/**
 * "Do it for me" — the one-prompt path, alongside the manual one.
 *
 * The two modes are not alternatives to choose between once and live with.
 * The foreman drives the SAME endpoints and writes the SAME rows as the manual
 * flow (`campaigns.anchor_asset_id`, `creative_jobs`, `assets`,
 * `expansion_data`), so a run that stops half-way leaves an ordinary campaign
 * the manual UI can pick up. Reverting to step-by-step isn't a feature — it's
 * what the data model already guarantees. This component's job is to make that
 * handover legible: say what happened, and drop the user at the stage that
 * stopped rather than back at the start.
 *
 * Nothing here is irreversible without consent: the quote is shown and
 * confirmed before a single credit moves.
 */

interface RunState {
  id: string;
  status: string;
  current_stage: RunStage | null;
  stages: StageRecord[];
  credits_estimated: number;
  credits_spent: number;
  error: string | null;
}

interface Quote {
  items: { stage: RunStage; credits: number }[];
  total: number;
}

const STAGE_LABEL: Record<RunStage, string> = {
  images: "Images",
  anchor: "Choosing the best one",
  video: "Video",
  music: "Music",
  caption: "Caption",
};

/** Where the manual flow should resume if a run stops at this stage. */
const STAGE_SECTION: Record<RunStage, string> = {
  images: "images",
  anchor: "images",
  video: "video",
  music: "music",
  caption: "caption",
};

export function AutoRunPanel({
  workspaceSlug,
  campaignId,
  onHandover,
}: {
  workspaceSlug: string;
  campaignId: string | null;
  /** Drop the user into the manual flow at the stage that stopped. */
  onHandover: (section: string) => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [balance, setBalance] = useState(0);
  const [run, setRun] = useState<RunState | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Toast once per stage, not once per poll.
  const announced = useRef<Set<string>>(new Set());

  const stopPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(async () => {
    if (!campaignId) return;
    try {
      const res = await api(`/api/campaigns/run?campaignId=${campaignId}`, {
        workspaceSlug,
      });
      if (!res.ok) return;
      const { run: r } = (await res.json()) as { run: RunState | null };
      if (!r) return;
      setRun(r);

      for (const s of r.stages) {
        const key = `${s.stage}:${s.status}`;
        if (announced.current.has(key)) continue;
        if (s.status === "completed") {
          announced.current.add(key);
          toast.success(`${STAGE_LABEL[s.stage]} done`, { id: key });
        } else if (s.status === "failed") {
          announced.current.add(key);
          // The handover. Say what stopped, and put them where they can finish
          // it themselves — the campaign is real and everything before this
          // stage is already saved.
          toast.error(
            `${STAGE_LABEL[s.stage]} didn't finish — picking up from there so you can carry on manually.`,
            { id: key, duration: 8000 },
          );
          onHandover(STAGE_SECTION[s.stage]);
        }
      }

      if (r.status !== "running" && r.status !== "queued") {
        stopPolling();
        if (r.status === "awaiting_publish") {
          toast.success(
            "All done — review it and hit publish when you're ready.",
          );
          onHandover("publish");
        }
      }
    } catch {
      /* transient — the next tick retries */
    }
  }, [campaignId, workspaceSlug, onHandover, stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const getQuote = async () => {
    if (!campaignId) return;
    setBusy(true);
    try {
      const res = await api("/api/campaigns/run", {
        method: "POST",
        body: JSON.stringify({ campaignId, confirm: false }),
        workspaceSlug,
      });
      const d = (await res.json()) as {
        quote?: Quote;
        balance?: number;
        error?: string;
      };
      if (!res.ok || !d.quote)
        throw new Error(d.error ?? "Couldn't price that");
      setQuote(d.quote);
      setBalance(d.balance ?? 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't price that");
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!campaignId) return;
    setBusy(true);
    try {
      const res = await api("/api/campaigns/run", {
        method: "POST",
        body: JSON.stringify({ campaignId, confirm: true }),
        workspaceSlug,
      });
      const d = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok || !d.runId) throw new Error(d.error ?? "Couldn't start");
      setQuote(null);
      announced.current.clear();
      toast.success("Off it goes — I'll keep you posted at each step.");
      stopPolling();
      timer.current = setInterval(() => void poll(), 4000);
      void poll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start");
    } finally {
      setBusy(false);
    }
  };

  if (!campaignId) return null;

  const active = run?.status === "running" || run?.status === "queued";

  return (
    <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
      {!active && !quote && (
        <>
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Wand2 className="h-3.5 w-3.5 text-primary" /> Do the rest for me
          </p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Picks an image, makes the video, music and caption, then hands it
            back for you to publish. You can still take over at any point.
          </p>
          <button
            type="button"
            onClick={getQuote}
            disabled={busy}
            className="w-full rounded-lg border border-primary/40 px-3 py-1.5 text-xs font-semibold text-primary disabled:opacity-40"
          >
            {busy ? "Working out the cost…" : "See what it costs"}
          </button>
        </>
      )}

      {quote && (
        <div className="space-y-2">
          <p className="text-[13px] font-semibold">Before I start</p>
          <ul className="space-y-0.5">
            {quote.items.map((i) => (
              <li
                key={i.stage}
                className="flex justify-between text-[11px] text-muted-foreground"
              >
                <span>{STAGE_LABEL[i.stage]}</span>
                <span className="tabular-nums">{i.credits} cr</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between border-t border-border pt-1 text-xs font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{quote.total} cr</span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            You have {balance.toLocaleString()} credits.
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={start}
              disabled={busy || balance < quote.total}
              className="flex-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {busy ? "Starting…" : `Go · ${quote.total} cr`}
            </button>
            <button
              type="button"
              onClick={() => setQuote(null)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {run && (
        <div className="space-y-1 border-t border-border pt-2">
          {run.stages
            .filter((s) => s.status !== "skipped")
            .map((s) => (
              <div
                key={s.stage}
                className="flex items-center gap-1.5 text-[11px]"
              >
                {s.status === "completed" ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : s.status === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : s.status === "failed" ? (
                  <X className="h-3 w-3 text-destructive" />
                ) : (
                  <span className="h-3 w-3" />
                )}
                <span
                  className={
                    s.status === "failed"
                      ? "text-destructive"
                      : s.status === "completed"
                        ? "text-muted-foreground"
                        : "text-foreground"
                  }
                >
                  {STAGE_LABEL[s.stage]}
                </span>
              </div>
            ))}
          {run.error && (
            <p className="text-[11px] text-destructive">{run.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
