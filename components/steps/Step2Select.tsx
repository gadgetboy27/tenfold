"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";
import type { Asset } from "@/store/useAppStore";
import { api } from "@/lib/api";
import ImageCard from "@/components/shared/ImageCard";
import { Button } from "@/components/ui/button";
import UpgradeModal from "@/components/billing/UpgradeModal";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Anchor, Sparkles, Shuffle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { getImageModel } from "@/lib/fal/models";

const VARIATION_COST = 3;
// Default while we load the campaign's model. Premium models (Typeset/Studio)
// cost more, so the real figure comes from the campaign's chosen model below.
const BATCH_COST = 12;

export default function Step2Select() {
  const {
    generatedAssets,
    selectedAnchorId,
    completeStep,
    setStep,
    aspectRatio,
    currentCampaignId,
    workspaceSlug,
    setGeneratedAssets,
    setCreditBalance,
    creditBalance,
  } = useAppStore();

  const [busy, setBusy] = useState<"variation" | "batch" | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [batchCost, setBatchCost] = useState(BATCH_COST);

  useEffect(() => {
    if (generatedAssets.length > 0) completeStep(1);
  }, [generatedAssets, completeStep]);

  // A fresh batch costs the campaign's chosen model's credits — match what the
  // /regenerate route actually charges so the button never under-discloses.
  useEffect(() => {
    if (!currentCampaignId || currentCampaignId === "__new__") return;
    let cancelled = false;
    api(`/api/campaigns/${currentCampaignId}`, { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then((camp: { parameters?: { model?: string } } | null) => {
        if (!cancelled && camp)
          setBatchCost(getImageModel(camp.parameters?.model).creditCost);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentCampaignId, workspaceSlug]);

  const selectedAsset = generatedAssets.find((a) => a.id === selectedAnchorId);

  // Poll the campaign until newly-generated images land, refreshing the grid as
  // they arrive. Returns once at least one new image shows up (or it times out).
  const pollForNewImages = async (baseline: number) => {
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 2500));
      const res = await api(`/api/campaigns/${currentCampaignId}`, {
        workspaceSlug,
      });
      if (!res.ok) continue;
      const camp = (await res.json()) as {
        parameters?: { style?: string };
        assets?: Array<{
          id: string;
          url: string;
          prompt: string;
          type: string;
          created_at: string;
          metadata?: { direction?: string; hd?: boolean };
        }>;
      };
      const imgs = (camp.assets ?? []).filter(
        (a) => a.type === "image" && a.url && !a.metadata?.hd,
      );
      if (imgs.length > baseline) {
        const mapped: Asset[] = imgs.map((a) => ({
          id: a.id,
          url: a.url,
          prompt: a.prompt ?? "",
          aspectRatio,
          style: camp.parameters?.style ?? "Photorealistic",
          createdAt: a.created_at,
          direction: a.metadata?.direction,
        }));
        setGeneratedAssets(mapped);
        return true;
      }
    }
    return false;
  };

  const refreshBalance = () => {
    api("/api/credits/balance", { workspaceSlug })
      .then((r) => r.json())
      .then((d: { balance?: number }) => {
        if (typeof d.balance === "number") setCreditBalance(d.balance);
      })
      .catch(() => {});
  };

  const handleVariation = async () => {
    if (!selectedAsset) {
      toast("Tap an image first — the variation is based on it.", {
        icon: "👆",
      });
      return;
    }
    if (creditBalance < VARIATION_COST) {
      toast.error("Not enough credits for a variation.");
      return;
    }
    setBusy("variation");
    const baseline = generatedAssets.length;
    try {
      const res = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          campaignId: currentCampaignId,
          type: "image_variation",
          params: {
            image_url: selectedAsset.url,
            prompt: `${selectedAsset.prompt} — fresh variation: new composition and angle, same subject, brand and mood`,
          },
        }),
        workspaceSlug,
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Couldn't start the variation");
      }
      refreshBalance();
      toast.success("Generating a variation…");
      const ok = await pollForNewImages(baseline);
      if (!ok) toast("Still rendering — it'll appear shortly.", { icon: "⏳" });
    } catch (err) {
      toast.error((err as Error).message ?? "Variation failed");
    } finally {
      setBusy(null);
    }
  };

  const handleFreshBatch = async () => {
    if (creditBalance < batchCost) {
      toast.error("Not enough credits for a fresh batch.");
      return;
    }
    setBusy("batch");
    const baseline = generatedAssets.length;
    try {
      const res = await api(`/api/campaigns/${currentCampaignId}/regenerate`, {
        method: "POST",
        workspaceSlug,
      });
      if (res.status === 403) {
        setShowUpgrade(true);
        return;
      }
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "Couldn't start a fresh batch");
      }
      refreshBalance();
      toast.success("Generating a fresh batch…");
      const ok = await pollForNewImages(baseline);
      if (!ok)
        toast("Still rendering — they'll appear shortly.", { icon: "⏳" });
    } catch (err) {
      toast.error((err as Error).message ?? "Fresh batch failed");
    } finally {
      setBusy(null);
    }
  };

  // Responsive: never crush below 1–2 columns on phones, scale up with the viewport.
  const gridCols =
    aspectRatio === "16:9"
      ? "grid-cols-1 sm:grid-cols-2"
      : aspectRatio === "4:5" || aspectRatio === "9:16"
        ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
        : "grid-cols-2 sm:grid-cols-3";

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex-1 overflow-y-auto pt-8 pb-32 flex justify-center">
        <div className="w-full max-w-5xl px-4 sm:px-6">
          <div className="mb-5 sm:mb-6">
            <h2 className="font-serif text-xl sm:text-2xl font-bold text-foreground">
              Select your anchor
            </h2>
            <p className="text-muted-foreground text-sm mt-1">
              This image becomes the foundation for your video, music, and
              social posts.
            </p>
          </div>
          <div className={`grid ${gridCols} gap-3 sm:gap-5 lg:gap-6`}>
            {generatedAssets.map((asset, i) => (
              <ImageCard key={asset.id} asset={asset} index={i} />
            ))}
          </div>

          {/* Want more options? Reuse is free; generating new costs credits. */}
          <div className="mt-6 rounded-2xl border border-border bg-card/60 p-4">
            <p className="text-sm text-foreground font-medium mb-0.5">
              Need another option?
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              These are yours — pick any above (free), or browse your{" "}
              <a
                href={`/${workspaceSlug}/gallery`}
                className="text-primary hover:underline"
              >
                Gallery
              </a>
              . Generating new images uses credits:
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleVariation}
                disabled={busy !== null}
                className="gap-2 justify-start"
              >
                {busy === "variation" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 text-primary" />
                )}
                New variation
                <span className="ml-auto text-xs font-mono text-muted-foreground">
                  {VARIATION_COST} cr
                </span>
              </Button>
              <Button
                variant="outline"
                onClick={handleFreshBatch}
                disabled={busy !== null}
                className="gap-2 justify-start"
              >
                {busy === "batch" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shuffle className="w-4 h-4 text-primary" />
                )}
                Fresh batch
                <span className="ml-auto text-xs font-mono text-muted-foreground">
                  {batchCost} cr
                </span>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Variation is based on your selected image (same subject, new
              look). Fresh batch creates a brand-new set.
            </p>
          </div>
        </div>
      </div>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="This model"
        blurb="This campaign uses a Pro model — upgrade to regenerate with it."
      />

      <AnimatePresence>
        {selectedAsset && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="absolute bottom-0 inset-x-0 z-30 p-4"
          >
            <div className="max-w-5xl mx-auto">
              <div className="flex items-center gap-4 bg-card/95 backdrop-blur-md border border-primary/30 rounded-2xl px-5 py-4 shadow-[0_0_40px_rgba(124,92,252,0.2)]">
                <div className="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-primary shrink-0">
                  <Image
                    src={selectedAsset.url}
                    alt="Selected anchor"
                    fill
                    className="object-cover"
                    sizes="56px"
                  />
                  <div className="absolute inset-0 bg-primary/20" />
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono mb-0.5">
                    Anchor selected
                  </p>
                  <p className="text-sm text-foreground font-medium truncate">
                    {selectedAsset.prompt.substring(0, 60)}
                    {selectedAsset.prompt.length > 60 ? "..." : ""}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    completeStep(2);
                    setStep(3);
                    if (currentCampaignId && currentCampaignId !== "__new__") {
                      api(`/api/campaigns/${currentCampaignId}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          current_step: 3,
                          anchor_asset_id: selectedAnchorId,
                        }),
                        workspaceSlug,
                      }).catch(() => {});
                    }
                  }}
                  size="lg"
                  className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 shrink-0 gap-2"
                >
                  <Anchor className="w-4 h-4" />
                  Confirm Anchor
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
