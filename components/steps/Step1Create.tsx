"use client";

import { useAppStore } from "@/store/useAppStore";
import { Sparkles } from "lucide-react";
import CosmicBackground from "@/components/shared/CosmicBackground";
import { motion, AnimatePresence } from "framer-motion";
import ImageCard from "@/components/shared/ImageCard";
import CampaignBriefPanel from "@/components/campaign/CampaignBriefPanel";

const GRID_COLS: Record<string, string> = {
  "1:1": "grid-cols-2 sm:grid-cols-3",
  "4:5": "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  "16:9": "grid-cols-1 sm:grid-cols-2",
  "9:16": "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
};

const EXPECTED_SECONDS = 20;

function GeneratingCard({
  aspectRatio,
  stage,
  elapsed,
}: {
  aspectRatio: string;
  stage: string;
  elapsed: number;
}) {
  const progress = Math.min(95, Math.round((elapsed / EXPECTED_SECONDS) * 100));
  const aspectClass: Record<string, string> = {
    "1:1": "aspect-square",
    "4:5": "aspect-[4/5]",
    "16:9": "aspect-video",
    "9:16": "aspect-[9/16]",
  };

  return (
    <div
      className={`relative w-full ${aspectClass[aspectRatio] ?? "aspect-square"} rounded-xl overflow-hidden border border-border bg-card`}
    >
      <motion.div
        className="absolute inset-0"
        animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        style={{
          background:
            "linear-gradient(120deg, #0f0f0f 0%, #1a1040 30%, #2d1b69 50%, #1a1040 70%, #0f0f0f 100%)",
          backgroundSize: "300% 300%",
        }}
      />
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-primary/60"
          initial={{ x: `${15 + i * 14}%`, y: "110%", opacity: 0 }}
          animate={{ y: "-10%", opacity: [0, 1, 0] }}
          transition={{
            duration: 2.5 + i * 0.4,
            repeat: Infinity,
            delay: i * 0.5,
            ease: "easeOut",
          }}
        />
      ))}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
        <motion.div
          animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <Sparkles className="w-8 h-8 text-primary" />
        </motion.div>
        <AnimatePresence mode="wait">
          <motion.p
            key={stage}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="text-xs font-mono text-primary/80 text-center tracking-wide"
          >
            {stage}
          </motion.p>
        </AnimatePresence>
        <div className="w-full max-w-[140px] h-1 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-[#9D84FD] rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
        <span className="text-[10px] font-mono text-white/20">
          {Math.round(elapsed)}s
        </span>
      </div>
    </div>
  );
}

export default function Step1Create() {
  const {
    generatedAssets,
    isGenerating,
    aspectRatio,
    generationStage,
    generationElapsed,
    campaignBrief,
  } = useAppStore();
  const gridCols = GRID_COLS[aspectRatio] ?? "grid-cols-3";

  // Show brief panel when a brief is loaded (and not yet generating)
  if (campaignBrief && !isGenerating && generatedAssets.length === 0) {
    return <CampaignBriefPanel />;
  }

  if (generatedAssets.length === 0 && !isGenerating) {
    return (
      <div className="h-full flex flex-col items-start justify-center relative">
        <CosmicBackground />
        <div
          className="relative text-center max-w-md mx-auto w-full"
          style={{ zIndex: 2, marginTop: "-8vh" }}
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex items-center justify-center mx-auto mb-6"
          >
            <Sparkles className="w-9 h-9 text-[#00D4FF]" />
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-3xl font-bold text-foreground mb-3 font-serif"
          >
            Describe what you want to create
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-base"
            style={{ color: "#9ca3af" }}
          >
            Tenfold will generate 4 images for you to choose from
          </motion.p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center pb-32 pt-8 relative">
      <CosmicBackground />
      <div
        className="relative w-full max-w-5xl mx-auto px-4 sm:px-6"
        style={{ zIndex: 2 }}
      >
        <div className={`grid ${gridCols} gap-3 sm:gap-5`}>
          {isGenerating ? (
            <GeneratingCard
              aspectRatio={aspectRatio}
              stage={generationStage || "Submitting your prompt…"}
              elapsed={generationElapsed}
            />
          ) : (
            generatedAssets.map((asset, i) => (
              <ImageCard key={asset.id} asset={asset} index={i} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
