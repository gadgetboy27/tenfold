"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Shirt,
  Upload,
  Loader2,
  Check,
  ExternalLink,
} from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import ProUpsell from "@/components/billing/ProUpsell";
import { UPSELLS } from "@/lib/billing/upsell";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { TRYON_CATEGORIES, type TryonCategory } from "@/lib/fal/tryon";

type Status = "idle" | "submitting" | "pending" | "ready" | "failed";

// Virtual try-on: upload a model photo + a garment, get the model wearing it.
// Single fal image job, polled via the shared /api/jobs status endpoint.
export default function VirtualTryOnPanel() {
  const ent = useEntitlements();
  const { currentCampaignId, workspaceSlug, creditBalance, setCreditBalance } =
    useAppStore();

  // Persisted inputs — survive navigating to Compose and back.
  const tryonDraft = useAppStore((s) => s.tryonDraft);
  const patchTryon = useAppStore((s) => s.patchTryonDraft);
  const { modelUrl, garmentUrl, category } = tryonDraft;
  const setModelUrl = (v: string) => patchTryon({ modelUrl: v });
  const setGarmentUrl = (v: string) => patchTryon({ garmentUrl: v });
  const setCategory = (v: TryonCategory) => patchTryon({ category: v });

  // Transient UI state.
  const [uploading, setUploading] = useState<"model" | "garment" | null>(null);
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
  const cost = CREDIT_COSTS.virtual_tryon;

  async function handleUpload(file: File, which: "model" | "garment") {
    setUploading(which);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api("/api/uploads/image", {
        method: "POST",
        body: fd,
        workspaceSlug,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      if (which === "model") setModelUrl(data.url);
      else setGarmentUrl(data.url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function poll(jobId: string) {
    const INTERVAL = 5000;
    const MAX = 4 * 60 * 1000;
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
        toast.success("Try-on ready");
        return;
      }
      if (job.status === "failed") {
        throw new Error(job.errorMessage ?? "Try-on failed on the server");
      }
    }
    throw new Error("Timed out — please retry");
  }

  async function handleGenerate() {
    if (!modelUrl || !garmentUrl) {
      toast.error("Upload both a model photo and a garment first");
      return;
    }
    setStatus("submitting");
    setError("");
    setResultUrl("");
    setElapsed(0);
    try {
      const res = await api("/api/virtual-tryon", {
        method: "POST",
        body: JSON.stringify({
          campaignId: currentCampaignId,
          modelImageUrl: modelUrl,
          garmentImageUrl: garmentUrl,
          category,
        }),
        workspaceSlug,
      });
      const data = (await res.json()) as {
        jobId?: string;
        creditCost?: number;
        error?: string;
      };
      if (!res.ok || !data.jobId)
        throw new Error(data.error ?? "Generation failed");
      setCreditBalance(creditBalance - (data.creditCost ?? 0));
      setStatus("pending");
      await poll(data.jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      setError(msg);
      setStatus("failed");
      toast.error(msg);
    }
  }

  const uploader = (which: "model" | "garment", url: string, label: string) => (
    <div className="w-28 sm:w-32 space-y-1.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <label className="block cursor-pointer">
        <div
          className={cn(
            "relative aspect-[3/4] rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden",
            url ? "border-primary/40" : "border-border hover:border-primary/50",
          )}
        >
          {url ? (
            <Image
              src={url}
              alt={label}
              fill
              className="object-cover"
              sizes="160px"
            />
          ) : uploading === which ? (
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
              <Upload className="w-4 h-4" />
              Upload
            </span>
          )}
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f, which);
          }}
        />
      </label>
    </div>
  );

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Shirt className="w-4 h-4" />
          </div>
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Virtual Try-On
              <InfoHint text="Upload a photo of a person (model) and a photo of the garment/product. The model is rendered wearing the garment." />
            </h3>
            <p className="text-xs text-muted-foreground">
              Put your product on a model. Upload a person photo and a garment —
              get a realistic on-model shot for apparel &amp; accessories.
            </p>
          </div>
        </div>
        <span className="text-xs font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded shrink-0">
          {cost} cr
        </span>
      </div>

      {!isPro && <ProUpsell {...UPSELLS.virtual_tryon} />}

      <div className="flex flex-wrap items-start gap-3">
        {uploader("model", modelUrl, "Model photo (a person)")}
        {uploader("garment", garmentUrl, "Garment / product")}
        {status === "ready" && resultUrl && (
          <div className="w-28 sm:w-32 space-y-1.5">
            <p className="text-[11px] text-success flex items-center gap-1">
              <Check className="w-3 h-3" /> Result
            </p>
            <div className="relative aspect-[3/4] rounded-lg overflow-hidden border border-primary/40">
              <Image
                src={resultUrl}
                alt="Try-on result"
                fill
                className="object-cover"
                sizes="160px"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wider">
          Garment type
          <InfoHint text="Tells the model what kind of clothing it is. Auto-detect works for most — pick Top/Bottom/Dress if results look off." />
        </span>
        {TRYON_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={cn(
              "px-2.5 py-1 text-xs rounded-full border transition-colors",
              category === c.id
                ? "border-primary/50 text-primary bg-primary/10"
                : "border-border bg-background hover:border-primary/50",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {status === "ready" && resultUrl && (
        <a
          href={resultUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80"
        >
          <ExternalLink className="w-3 h-3" />
          Open result in new tab
        </a>
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
          ? `Generating… ${elapsed}s`
          : status === "submitting"
            ? "Starting…"
            : `Generate try-on · ${cost} cr`}
      </Button>
      {!validCampaign && (
        <p className="text-[11px] text-muted-foreground text-center">
          Save or open a campaign first to generate.
        </p>
      )}
    </div>
  );
}
