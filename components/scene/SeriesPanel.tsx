"use client";

import { useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAppStore } from "@/store/useAppStore";
import { InfoHint } from "@/components/ui/info-hint";
import { api } from "@/lib/api";
import { useSeriesRun } from "./useSeriesRun";
import {
  SERIES_DEFAULT,
  SERIES_MIN,
  cleanScenes,
  seriesCost,
} from "@/lib/series/scenes";
import { SeriesResults } from "./SeriesResults";
import { SeriesScenes } from "./SeriesScenes";
import { SeriesSubject } from "./SeriesSubject";

/**
 * Series — one subject, several scenes, so a campaign reads as a set. The user
 * picks the photo everything is built around (their own, or one already here),
 * Claude drafts where it appears, and each scene comes back as its own image in
 * this project. Credits only: each scene is an ordinary image variation.
 */
export function SeriesPanel() {
  const { currentCampaignId, workspaceSlug, creditBalance, workingImage } =
    useAppStore();

  const [subject, setSubject] = useState("");
  const [count, setCount] = useState(SERIES_DEFAULT);
  const [scenes, setScenes] = useState<string[]>([]);
  const [planning, setPlanning] = useState(false);
  const validCampaign =
    !!currentCampaignId &&
    currentCampaignId !== "__new__" &&
    currentCampaignId !== "demo";
  const { results, busy, start } = useSeriesRun(
    validCampaign ? currentCampaignId : null,
  );
  const usable = cleanScenes(scenes);
  const cost = seriesCost(usable.length);
  const short = cost > creditBalance;
  const canRun =
    validCampaign &&
    !!subject &&
    usable.length >= SERIES_MIN &&
    !short &&
    !busy;
  const base = `/api/campaigns/${currentCampaignId}/series`;

  async function plan() {
    setPlanning(true);
    try {
      const res = await api(`${base}/scenes`, {
        method: "POST",
        body: JSON.stringify({ count }),
        workspaceSlug,
      });
      const data = (await res.json()) as { scenes?: string[]; error?: string };
      if (!res.ok || !data.scenes)
        throw new Error(data.error ?? "Couldn't plan the scenes");
      setScenes(data.scenes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't plan the scenes");
    } finally {
      setPlanning(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Layers className="h-4 w-4" />
        </div>
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            Series
            <InfoHint text="Build several images around the same subject so your posts look like one campaign. Each scene keeps your subject the same and changes where it is." />
          </h3>
          <p className="text-xs text-muted-foreground">
            One photo, several scenes — a set that belongs together.
          </p>
        </div>
      </div>

      <SeriesSubject
        url={subject}
        workspaceSlug={workspaceSlug}
        campaignId={validCampaign ? currentCampaignId : null}
        workingImage={workingImage}
        disabled={busy}
        onChange={setSubject}
      />
      <SeriesScenes
        scenes={scenes}
        count={count}
        planning={planning}
        disabled={busy || !validCampaign}
        onCount={setCount}
        onChange={setScenes}
        onPlan={plan}
      />

      <button
        type="button"
        onClick={() => void start(subject, usable, cost)}
        disabled={!canRun}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy
          ? "Making your scenes…"
          : usable.length >= SERIES_MIN
            ? `Make ${usable.length} scenes · ${cost} credits`
            : "Add at least 2 scenes"}
      </button>
      {short && usable.length >= SERIES_MIN && (
        <p className="text-center text-xs text-destructive">
          You have {creditBalance} credits — this needs {cost}.
        </p>
      )}
      {!validCampaign && (
        <p className="text-center text-xs text-muted-foreground">
          Open a project first — each scene is saved to it.
        </p>
      )}

      {results.length > 0 && <SeriesResults results={results} />}
    </div>
  );
}
