"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import type { Asset } from "@/store/useAppStore";
import { useAppStore } from "@/store/useAppStore";
import { Maximize2, Shuffle, ArrowUp, Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { aspectClass } from "@/lib/util/aspect-classes";
import { Button } from "@/components/ui/button";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import UpgradeModal from "@/components/billing/UpgradeModal";
import { api } from "@/lib/api";
import toast from "react-hot-toast";

interface ImageCardProps {
  asset: Asset;
  index: number;
}

const STYLE_FILTERS: Record<string, string> = {
  Photorealistic: "none",
  Illustration: "saturate(1.5) contrast(1.05) hue-rotate(5deg)",
  Cinematic: "saturate(0.6) contrast(1.2) sepia(0.25) brightness(0.88)",
  "3D": "brightness(1.08) contrast(1.22) saturate(1.35)",
};

const STYLE_LABEL_COLORS: Record<string, string> = {
  Photorealistic: "bg-sky-500/80",
  Illustration: "bg-rose-500/80",
  Cinematic: "bg-amber-600/80",
  "3D": "bg-violet-500/80",
};

export default function ImageCard({ asset, index }: ImageCardProps) {
  const { selectedAnchorId, setAnchorId, workspaceSlug } = useAppStore();
  const ent = useEntitlements();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [hdLoading, setHdLoading] = useState(false);
  const isSelected = selectedAnchorId === asset.id;
  const isDimmed = selectedAnchorId !== null && !isSelected;

  // HD / print-ready export — Pro only. Non-Pro users get the upgrade prompt.
  async function handleUpscale() {
    if (!ent?.hdExport) {
      setShowUpgrade(true);
      return;
    }
    if (hdLoading) return;
    setHdLoading(true);
    try {
      const res = await api(`/api/assets/${asset.id}/upscale`, {
        method: "POST",
        workspaceSlug,
      });
      if (res.status === 403) {
        setShowUpgrade(true);
        return;
      }
      if (res.status === 402) {
        toast.error("Not enough credits for an HD export.");
        return;
      }
      if (!res.ok) {
        toast.error("Couldn't start the HD export. Try again.");
        return;
      }
      toast.success(
        "HD export started — your print-ready image is on the way.",
      );
    } catch {
      toast.error("Couldn't start the HD export. Try again.");
    } finally {
      setHdLoading(false);
    }
  }

  async function handleDownload() {
    try {
      const res = await fetch(asset.url);
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `tenfold-${asset.id}.jpg`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      window.open(asset.url, "_blank", "noopener");
    }
  }

  const ratio = asset.aspectRatio ?? "1:1";
  const style = asset.style ?? "Photorealistic";
  const aspectBox = aspectClass(ratio);
  const filter = STYLE_FILTERS[style] ?? "none";
  const labelColor = STYLE_LABEL_COLORS[style] ?? "bg-slate-500/80";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isDimmed ? 0.35 : 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      onClick={() => setAnchorId(asset.id)}
      className={cn(
        `relative ${aspectBox} rounded-xl overflow-hidden cursor-pointer group transition-all duration-200`,
        isSelected
          ? "ring-2 ring-primary shadow-[inset_0_0_20px_rgba(124,92,252,0.3)]"
          : "hover:scale-[1.02] hover:ring-1 ring-border hover:ring-white/20",
      )}
    >
      <Image
        src={asset.url}
        alt={asset.prompt}
        fill
        className="object-cover transition-all duration-300"
        style={{ filter }}
        sizes="(max-width: 640px) 100vw, 50vw"
      />

      {style !== "Photorealistic" && (
        <div
          className={`absolute top-2 left-2 ${labelColor} text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full tracking-wider backdrop-blur-sm`}
        >
          {style.toUpperCase()}
        </div>
      )}

      {/* Creative-direction label — always visible, helps the user choose between distinct angles */}
      {asset.direction && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/55 backdrop-blur-sm text-white text-[9px] font-semibold px-2 py-0.5 rounded-full tracking-wider uppercase">
          {asset.direction}
        </div>
      )}

      {isSelected && (
        <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-1 rounded-full tracking-wider">
          ANCHOR
        </div>
      )}

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-12 flex justify-center gap-2 opacity-0 transition-opacity duration-200",
          isSelected ? "opacity-100" : "group-hover:opacity-100",
        )}
      >
        {[
          {
            icon: Maximize2,
            label: "View full size",
            onClick: () => window.open(asset.url, "_blank", "noopener"),
          },
          {
            icon: Shuffle,
            label: "Use as anchor",
            onClick: () => setAnchorId(asset.id),
          },
          {
            icon: hdLoading ? Loader2 : ArrowUp,
            label: ent?.hdExport ? "HD export" : "HD export (Pro)",
            onClick: handleUpscale,
            spin: hdLoading,
          },
          {
            icon: Download,
            label: "Download",
            onClick: handleDownload,
          },
        ].map(({ icon: Icon, label, onClick, spin }) => (
          <Button
            key={label}
            size="icon"
            variant="secondary"
            className="w-8 h-8 rounded-full bg-black/50 hover:bg-primary hover:text-white border border-white/10"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            title={label}
          >
            <Icon className={cn("w-4 h-4", spin && "animate-spin")} />
          </Button>
        ))}
      </div>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="HD export"
        blurb="Upscale any anchor to a crisp, print-ready 2× resolution — perfect for billboards, packaging, and large-format ads."
      />
    </motion.div>
  );
}
