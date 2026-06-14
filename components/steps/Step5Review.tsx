"use client";

import { useState } from "react";
import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";
import {
  ArrowRight,
  Edit2,
  Music2,
  RefreshCw,
  X,
  Share2,
  Globe,
  Film,
  ArrowLeft,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

const PLATFORMS = [
  {
    id: "instagram",
    label: "Instagram",
    aspectClass: "aspect-[4/5]",
    maxCaption: 2200,
    icon: Share2,
  },
  {
    id: "tiktok",
    label: "TikTok",
    aspectClass: "aspect-[9/16]",
    maxCaption: 150,
    icon: Film,
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    aspectClass: "aspect-video",
    maxCaption: 3000,
    icon: Globe,
  },
] as const;

export default function Step5Review() {
  const {
    generatedAssets,
    selectedAnchorId,
    expansions,
    setStep,
    completeStep,
    currentCampaignId,
    workspaceSlug,
    updateExpansion,
    platformCaptions,
    setPlatformCaptions,
  } = useAppStore();

  const [caption, setCaption] = useState(expansions.script?.content ?? "");
  const [isEditingCaption, setIsEditingCaption] = useState(false);
  const [showVariantPicker, setShowVariantPicker] = useState<
    "video" | "music" | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const [adapting, setAdapting] = useState(false);

  const captionFor = (id: string) => platformCaptions[id] ?? caption;

  const handleAdaptCaptions = async () => {
    if (!caption.trim()) {
      toast.error("Write a caption first.");
      return;
    }
    setAdapting(true);
    try {
      const res = await api("/api/publish/adapt-captions", {
        method: "POST",
        body: JSON.stringify({
          caption,
          platforms: PLATFORMS.map((p) => p.id),
        }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        captions?: Record<string, string>;
        error?: string;
      };
      if (!res.ok || !data.captions)
        throw new Error(data.error ?? "Could not adapt captions");
      setPlatformCaptions(data.captions);
      toast.success("Captions tailored to each platform.");
    } catch (err) {
      toast.error((err as Error).message ?? "Could not adapt captions");
    } finally {
      setAdapting(false);
    }
  };

  const anchor = generatedAssets.find((a) => a.id === selectedAnchorId);
  const videoUrl =
    expansions.video?.status === "ready" ? expansions.video.url : null;
  const videoUrls = expansions.video?.urls ?? [];
  const musicUrl =
    expansions.music?.status === "ready" ? expansions.music.url : null;
  const musicUrls = expansions.music?.urls ?? [];

  const handleContinue = async () => {
    setIsSaving(true);
    try {
      if (caption !== expansions.script?.content) {
        updateExpansion("script", { content: caption });
      }

      completeStep(5);
      setStep(6);

      if (currentCampaignId && currentCampaignId !== "__new__") {
        const saved = useAppStore.getState().expansions;
        await api(`/api/campaigns/${currentCampaignId}`, {
          method: "PATCH",
          body: JSON.stringify({ current_step: 6, expansion_data: saved }),
          workspaceSlug,
        });
      }

      toast.success("Ready to publish!");
    } catch (err) {
      toast.error("Failed to save — please try again");
    } finally {
      setIsSaving(false);
    }
  };

  if (!anchor) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No anchor selected — go back to step 2.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-28 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Review & Finalize
          </h1>
          <p className="text-sm text-muted-foreground">
            See how your post looks on different platforms. Fine-tune the
            caption or swap variants before publishing.
          </p>
        </div>

        {/* Platform Previews Grid */}
        <div className="grid grid-cols-3 gap-4">
          {PLATFORMS.map((platform) => (
            <div
              key={platform.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
            >
              {/* Platform Header */}
              <div className="flex items-center gap-2">
                <platform.icon className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  {platform.label}
                </h2>
              </div>

              {/* Media Frame */}
              <div
                className={`${platform.aspectClass} rounded-lg overflow-hidden bg-black/10 border border-border/50 flex items-center justify-center`}
              >
                {videoUrl ? (
                  <video
                    src={videoUrl}
                    muted
                    loop
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Image
                    src={anchor.url}
                    alt="Anchor"
                    fill
                    className="object-cover"
                  />
                )}
              </div>

              {/* Caption Display (per-platform after AI fit) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase font-medium">
                    Caption{platformCaptions[platform.id] ? " · tailored" : ""}
                  </span>
                  <span
                    className={`text-[10px] ${captionFor(platform.id).length > platform.maxCaption ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {captionFor(platform.id).length} / {platform.maxCaption}
                  </span>
                </div>
                <p className="text-xs text-foreground bg-secondary/50 rounded p-2.5 line-clamp-4 leading-relaxed whitespace-pre-wrap">
                  {captionFor(platform.id) || "(no caption)"}
                </p>
                {captionFor(platform.id).length > platform.maxCaption && (
                  <p className="text-[10px] text-destructive font-medium">
                    ⚠️ Caption exceeds platform limit
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Quick-Edit Bar */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              Quick edits
            </h3>
            {isEditingCaption && (
              <button
                type="button"
                onClick={() => setIsEditingCaption(false)}
                className="text-xs text-primary hover:text-primary/80 font-medium"
              >
                Save caption
              </button>
            )}
          </div>

          {isEditingCaption ? (
            <Textarea
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                setPlatformCaptions({});
              }}
              placeholder="Edit your caption..."
              className="min-h-24 text-sm"
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsEditingCaption(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-xs text-foreground font-medium transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5" />
                Edit caption
              </button>

              <button
                type="button"
                onClick={handleAdaptCaptions}
                disabled={adapting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-primary/40 bg-primary/5 hover:bg-primary/10 text-xs text-primary font-medium transition-colors disabled:opacity-60"
              >
                {adapting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Fit to each platform (AI)
              </button>

              {videoUrls.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowVariantPicker("video")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-xs text-foreground font-medium transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Swap video ({videoUrls.length})
                </button>
              )}

              {musicUrls.length > 1 && (
                <button
                  type="button"
                  onClick={() => setShowVariantPicker("music")}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-xs text-foreground font-medium transition-colors"
                >
                  <Music2 className="w-3.5 h-3.5" />
                  Swap music ({musicUrls.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => setStep(4)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Compose
              </button>

              <button
                type="button"
                onClick={() => setStep(3)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Rebuild from Expand
              </button>
            </div>
          )}
        </div>

        {/* Variant Picker Overlay */}
        {showVariantPicker && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-card rounded-xl border border-border p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-foreground">
                  {showVariantPicker === "video"
                    ? "Select a video variant"
                    : "Select a music variant"}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowVariantPicker(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(showVariantPicker === "video" ? videoUrls : musicUrls).map(
                  (url, idx) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => {
                        updateExpansion(showVariantPicker, { url });
                        setShowVariantPicker(null);
                        toast.success(
                          `${showVariantPicker === "video" ? "Video" : "Music"} updated`,
                        );
                      }}
                      className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                        (showVariantPicker === "video"
                          ? videoUrl
                          : musicUrl) === url
                          ? "border-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {showVariantPicker === "video" && (
                        <div className="aspect-[4/5] bg-black flex items-center justify-center">
                          <video
                            src={url}
                            muted
                            loop
                            autoPlay
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      {showVariantPicker === "music" && (
                        <div className="aspect-square bg-secondary flex flex-col items-center justify-center gap-2">
                          <Music2 className="w-8 h-8 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            Track {idx + 1}
                          </span>
                        </div>
                      )}
                      {(showVariantPicker === "video" ? videoUrl : musicUrl) ===
                        url && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">
                            Selected
                          </span>
                        </div>
                      )}
                    </button>
                  ),
                )}
              </div>
            </motion.div>
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 35, delay: 0.2 }}
        className="fixed bottom-0 left-40 right-0 z-30 p-4 pointer-events-none"
      >
        <div className="max-w-6xl mx-auto pointer-events-auto">
          <div className="flex items-center justify-between bg-card/95 backdrop-blur-md border border-border rounded-2xl px-5 py-3 shadow-lg">
            <p className="text-sm text-muted-foreground">
              Fine-tune above, or proceed to publish
            </p>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setStep(4)}
                variant="outline"
                className="gap-2"
                size="sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                onClick={handleContinue}
                disabled={isSaving}
                className="bg-primary hover:bg-primary/90 text-white font-semibold gap-2 shrink-0"
              >
                {isSaving ? "Saving…" : "Continue to Publish"}
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
