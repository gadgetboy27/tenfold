"use client";

import { useState, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Loader2, Sparkles, Download } from "lucide-react";
import toast from "react-hot-toast";
import {
  LOGO_STYLES,
  LOGO_STYLE_LABELS,
  type LogoStyle,
} from "@/lib/logo/prompts";

/**
 * Logo builder — Phase 1.
 *
 * Only renders once the server page has passed the FEATURE_LOGO_BUILDER gate,
 * so no flag check here. Generation reuses the image pipeline via /api/logo;
 * results are polled until the webhook lands the candidates.
 */
type Img = { id: string; url: string };

export function LogoBuilder() {
  const workspaceSlug = useAppStore((s) => s.workspaceSlug);
  const [brandName, setBrandName] = useState("");
  const [style, setStyle] = useState<LogoStyle>("minimalist");
  const [brief, setBrief] = useState("");
  const [generating, setGenerating] = useState(false);
  const [images, setImages] = useState<Img[]>([]);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll every 2s until the webhook lands the candidates. An interval (not a
  // recursive setTimeout) avoids the memoized-function-referencing-itself trap
  // and clears cleanly. ~90s ceiling (45 ticks).
  const startPolling = (jobId: string) => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    let tries = 0;
    const stop = () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      pollTimer.current = null;
    };
    pollTimer.current = setInterval(async () => {
      if (++tries > 45) {
        stop();
        setGenerating(false);
        toast.error("Logo generation timed out — try again.");
        return;
      }
      try {
        const res = await api(`/api/logo?jobId=${jobId}`, { workspaceSlug });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          images?: Img[];
          error?: string;
        };
        if (data.images && data.images.length > 0) setImages(data.images);
        if (data.status === "completed" && data.images?.length) {
          stop();
          setGenerating(false);
        } else if (data.status === "failed") {
          stop();
          setGenerating(false);
          toast.error(data.error ?? "Logo generation failed.");
        }
      } catch {
        // transient — keep polling until the ceiling
      }
    }, 2000);
  };

  const generate = async () => {
    if (!brandName.trim()) {
      toast.error("Enter a brand name first.");
      return;
    }
    setGenerating(true);
    setImages([]);
    // startPolling clears any prior interval at its start.
    try {
      const res = await api("/api/logo", {
        method: "POST",
        body: JSON.stringify({ brandName, style, brief: brief || undefined }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
      };
      if (res.status === 402) {
        setGenerating(false);
        toast.error("Not enough credits for a logo.");
        return;
      }
      if (!res.ok || !data.jobId) {
        throw new Error(data.error ?? "Could not start logo generation");
      }
      startPolling(data.jobId);
    } catch (err) {
      setGenerating(false);
      toast.error((err as Error).message ?? "Could not generate a logo");
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 text-center">
        <h1 className="font-serif text-3xl font-bold">Logo builder</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Describe your brand and generate logo concepts.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-border bg-card p-6">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Brand name</span>
          <input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="e.g. Northshore Coffee"
            maxLength={60}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div>
          <span className="mb-1.5 block text-sm font-medium">Style</span>
          <div className="flex flex-wrap gap-1.5">
            {LOGO_STYLES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(s)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  style === s
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {LOGO_STYLE_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">
            Direction <span className="text-muted-foreground">(optional)</span>
          </span>
          <input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="industry, colours, vibe…"
            maxLength={300}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </label>

        <Button
          onClick={generate}
          disabled={generating}
          className="w-full gap-2"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate logos · 10 cr
            </>
          )}
        </Button>
      </div>

      {(images.length > 0 || generating) && (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {images.map((img) => (
            <a
              key={img.id}
              href={img.url}
              download
              className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt="Logo concept"
                className="h-full w-full object-contain"
              />
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 py-1 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Download className="h-3 w-3" /> Download
              </span>
            </a>
          ))}
          {generating &&
            Array.from({ length: Math.max(0, 4 - images.length) }).map(
              (_, i) => (
                <div
                  key={`skeleton-${i}`}
                  className="flex aspect-square items-center justify-center rounded-xl border border-border bg-card"
                >
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ),
            )}
        </div>
      )}
    </div>
  );
}
