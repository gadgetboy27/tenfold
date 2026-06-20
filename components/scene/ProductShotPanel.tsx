"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon, Upload, Loader2, ExternalLink, Lock } from "lucide-react";
import { useAppStore } from "@/store/useAppStore";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import { Button } from "@/components/ui/button";
import { InfoHint } from "@/components/ui/info-hint";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { PLACEMENTS, type Placement } from "@/lib/fal/product-shot";

type Status = "idle" | "submitting" | "pending" | "ready" | "failed";

// Product-in-scene: upload a product photo + describe a scene → product placed
// into that lifestyle background. Single fal image job, polled via /api/jobs.
export default function ProductShotPanel() {
  const ent = useEntitlements();
  const { currentCampaignId, workspaceSlug, creditBalance, setCreditBalance } =
    useAppStore();
  const draft = useAppStore((s) => s.productShotDraft);
  const patch = useAppStore((s) => s.patchProductShotDraft);

  const [uploading, setUploading] = useState(false);
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
  const cost = CREDIT_COSTS.product_shot;

  async function handleUpload(file: File) {
    setUploading(true);
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
      patch({ productImageUrl: data.url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
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
        toast.success("Product scene ready");
        return;
      }
      if (job.status === "failed") {
        throw new Error(job.errorMessage ?? "Generation failed on the server");
      }
    }
    throw new Error("Timed out — please retry");
  }

  async function handleGenerate() {
    if (!draft.productImageUrl) {
      toast.error("Upload a product photo first");
      return;
    }
    if (draft.scene.trim().length < 3) {
      toast.error("Describe the scene first");
      return;
    }
    setStatus("submitting");
    setError("");
    setResultUrl("");
    setElapsed(0);
    try {
      const res = await api("/api/product-shot", {
        method: "POST",
        body: JSON.stringify({
          campaignId: currentCampaignId,
          productImageUrl: draft.productImageUrl,
          scene: draft.scene,
          placement: draft.placement,
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

  return (
    <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              Product in Scene
              <InfoHint text="Upload a product photo (a clean/cut-out shot works best) and describe a setting — the product is placed into that lifestyle scene with matching light." />
            </h3>
            <p className="text-xs text-muted-foreground">
              Drop your product into any lifestyle background — no photoshoot.
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
          Product scenes are a Pro feature — upgrade to use them.
        </div>
      )}

      <div className="flex flex-wrap items-start gap-4">
        {/* Product upload (compact) */}
        <div className="w-28 sm:w-32 space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Product photo</p>
          <label className="block cursor-pointer">
            <div
              className={cn(
                "relative aspect-square rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden",
                draft.productImageUrl
                  ? "border-primary/40"
                  : "border-border hover:border-primary/50",
              )}
            >
              {draft.productImageUrl ? (
                <Image
                  src={draft.productImageUrl}
                  alt="Product"
                  fill
                  className="object-cover"
                  sizes="128px"
                />
              ) : uploading ? (
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
                if (f) handleUpload(f);
              }}
            />
          </label>
        </div>

        {/* Scene + result */}
        <div className="flex-1 min-w-[200px] space-y-2">
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wider">
            Scene
            <InfoHint text="Describe the setting in plain English — surface, lighting, mood. e.g. 'on a marble kitchen counter in soft morning light'." />
          </span>
          <textarea
            value={draft.scene}
            onChange={(e) => patch({ scene: e.target.value })}
            placeholder="on a marble kitchen counter in soft morning light, fresh and premium"
            className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background resize-none h-20 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="flex items-center gap-1.5">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground uppercase tracking-wider">
              Placement
              <InfoHint text="Where the product sits in the scene." />
            </span>
            {PLACEMENTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => patch({ placement: p.id as Placement })}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-full border transition-colors",
                  draft.placement === p.id
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border bg-background hover:border-primary/50",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {status === "ready" && resultUrl && (
          <div className="w-32 sm:w-40 space-y-1.5">
            <p className="text-[11px] text-success">Result</p>
            <div className="relative aspect-square rounded-lg overflow-hidden border border-primary/40">
              <Image
                src={resultUrl}
                alt="Product scene"
                fill
                className="object-cover"
                sizes="160px"
              />
            </div>
          </div>
        )}
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
            : `Place in scene · ${cost} cr`}
      </Button>
      {!validCampaign && (
        <p className="text-[11px] text-muted-foreground text-center">
          Save or open a campaign first to generate.
        </p>
      )}
    </div>
  );
}
