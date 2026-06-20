"use client";

import { useState } from "react";
import {
  Captions,
  Loader2,
  ExternalLink,
  Lock,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { CAPTION_COLORS, type CaptionColor } from "@/lib/fal/captions";

type Status = "idle" | "submitting" | "pending" | "ready" | "failed";
const FONT_SIZES = [
  { label: "S", v: 22 },
  { label: "M", v: 28 },
  { label: "L", v: 36 },
];

// Auto-captions: burn animated subtitles into a video with speech (best on the
// spoken-spokesperson video). Single fal job, polled via /api/jobs.
export default function AutoCaptionPanel() {
  const ent = useEntitlements();
  const {
    currentCampaignId,
    workspaceSlug,
    creditBalance,
    setCreditBalance,
    lastSpokenVideoUrl,
  } = useAppStore();
  const draft = useAppStore((s) => s.autoCaptionDraft);
  const patch = useAppStore((s) => s.patchAutoCaptionDraft);

  const [status, setStatus] = useState<Status>("idle");
  const [resultUrl, setResultUrl] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const isPro = ent?.isPro ?? false;
  const validCampaign =
    !!currentCampaignId &&
    currentCampaignId !== "__new__" &&
    currentCampaignId !== "demo";
  const busy = status === "submitting" || status === "pending";
  const cost = CREDIT_COSTS.auto_caption;
  const sourceUrl =
    draft.source === "spoken" ? lastSpokenVideoUrl : draft.videoUrl.trim();

  async function poll(jobId: string) {
    const INTERVAL = 5000;
    const MAX = 5 * 60 * 1000;
    let waited = 0;
    while (waited < MAX) {
      await new Promise((r) => setTimeout(r, INTERVAL));
      waited += INTERVAL;
      setElapsed(Math.floor(waited / 1000));
      const res = await api(`/api/jobs/${jobId}`, { workspaceSlug });
      if (!res.ok) continue;
      const job = (await res.json()) as {
        status: string;
        outputUrls?: string[];
        errorMessage?: string | null;
      };
      if (job.status === "ready" && job.outputUrls?.[0]) {
        setResultUrl(job.outputUrls[0]);
        setStatus("ready");
        toast.success("Captioned video ready");
        return;
      }
      if (job.status === "failed") {
        throw new Error(job.errorMessage ?? "Captioning failed on the server");
      }
    }
    throw new Error("Timed out — please retry");
  }

  async function handleGenerate() {
    if (!sourceUrl) {
      toast.error("Pick the spoken video or paste a video URL first");
      return;
    }
    setStatus("submitting");
    setError("");
    setResultUrl("");
    setElapsed(0);
    try {
      const res = await api("/api/auto-caption", {
        method: "POST",
        body: JSON.stringify({
          campaignId: currentCampaignId,
          videoUrl: sourceUrl,
          color: draft.color,
          fontSize: draft.fontSize,
          position: draft.position,
          upper: draft.upper,
        }),
        workspaceSlug,
      });
      const data = (await res.json()) as {
        jobId?: string;
        creditCost?: number;
        error?: string;
      };
      if (!res.ok || !data.jobId)
        throw new Error(data.error ?? "Captioning failed");
      setCreditBalance(creditBalance - (data.creditCost ?? 0));
      setStatus("pending");
      await poll(data.jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Captioning failed";
      setError(msg);
      setStatus("failed");
      toast.error(msg);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Captions className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Auto-Captions
            </h3>
            <p className="text-xs text-muted-foreground">
              Burn animated subtitles into a talking video — most people watch
              muted, so captions lift engagement.
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded shrink-0">
          {cost} cr
        </span>
      </div>

      {!isPro && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-secondary/50 border border-border rounded-lg px-3 py-2">
          <Lock className="w-3.5 h-3.5" />
          Auto-captions are a Pro feature — upgrade to use them.
        </div>
      )}

      {/* Source */}
      <section className="space-y-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide">
          Source video
          <InfoHint text="Captions are transcribed from the audio, so use a video with speech — like your spoken-spokesperson video." />
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => patch({ source: "spoken" })}
            disabled={!lastSpokenVideoUrl}
            className={cn(
              "px-3 py-1.5 text-xs rounded-full border transition-colors",
              draft.source === "spoken"
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border bg-background hover:border-primary/50",
              !lastSpokenVideoUrl && "opacity-40 cursor-not-allowed",
            )}
          >
            Your spoken video
          </button>
          <button
            type="button"
            onClick={() => patch({ source: "url" })}
            className={cn(
              "px-3 py-1.5 text-xs rounded-full border transition-colors",
              draft.source === "url"
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border bg-background hover:border-primary/50",
            )}
          >
            Paste a URL
          </button>
        </div>
        {draft.source === "spoken" && !lastSpokenVideoUrl && (
          <p className="text-[11px] text-muted-foreground">
            Generate a spoken video above first, then it appears here.
          </p>
        )}
        {draft.source === "url" && (
          <input
            type="url"
            value={draft.videoUrl}
            onChange={(e) => patch({ videoUrl: e.target.value })}
            placeholder="https://…/video.mp4 (a video with speech)"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        )}
      </section>

      {/* Style */}
      <section className="space-y-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground uppercase tracking-wide">
          Caption style
          <InfoHint text="Color, size and position of the burned-in captions. Bottom placement is safest for social." />
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {CAPTION_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => patch({ color: c.id as CaptionColor })}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors",
                  draft.color === c.id
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/50",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {FONT_SIZES.map((f) => (
              <button
                key={f.v}
                type="button"
                onClick={() => patch({ fontSize: f.v })}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors",
                  draft.fontSize === f.v
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/50",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {(["bottom", "middle"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => patch({ position: p })}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border capitalize transition-colors",
                  draft.position === p
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/50",
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => patch({ upper: !draft.upper })}
            className={cn(
              "px-2.5 py-1 text-xs rounded-full border transition-colors",
              draft.upper
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border bg-background hover:border-primary/50",
            )}
          >
            UPPERCASE
          </button>
        </div>
      </section>

      {status === "ready" && resultUrl && (
        <div className="space-y-2">
          <video
            src={resultUrl}
            controls
            className="w-full rounded-lg aspect-video bg-black"
          />
          <a
            href={resultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
          >
            <ExternalLink className="w-3 h-3" />
            Open captioned video
          </a>
        </div>
      )}
      {status === "failed" && error && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          {error}
        </p>
      )}

      <Button
        onClick={handleGenerate}
        disabled={busy || !isPro || !validCampaign}
        className="w-full gap-2"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === "pending"
          ? `Captioning… ${elapsed}s`
          : status === "submitting"
            ? "Starting…"
            : `Add captions · ${cost} cr`}
      </Button>
      {!validCampaign && (
        <p className="text-[11px] text-muted-foreground text-center">
          Save or open a campaign first to generate.
        </p>
      )}
    </div>
  );
}
