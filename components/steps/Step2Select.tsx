"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";
import ImageCard from "@/components/shared/ImageCard";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Anchor } from "lucide-react";

export default function Step2Select() {
  const {
    generatedAssets,
    selectedAnchorId,
    completeStep,
    setStep,
    aspectRatio,
    currentCampaignId,
    workspaceSlug,
  } = useAppStore();

  useEffect(() => {
    if (generatedAssets.length > 0) completeStep(1);
  }, [generatedAssets, completeStep]);

  const selectedAsset = generatedAssets.find((a) => a.id === selectedAnchorId);

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
        </div>
      </div>

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
