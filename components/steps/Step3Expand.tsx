"use client";

import { useState } from "react";
import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";
import { Film, Music, FileText, ArrowRight, Lock } from "lucide-react";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import UpgradeModal from "@/components/billing/UpgradeModal";
import FormatCard from "@/components/shared/FormatCard";
import TalkingVideoPanel from "@/components/talking/TalkingVideoPanel";
import VirtualTryOnPanel from "@/components/tryon/VirtualTryOnPanel";
import AutoCaptionPanel from "@/components/captions/AutoCaptionPanel";
import ABVariantsPanel from "@/components/hooks/ABVariantsPanel";
import ProductShotPanel from "@/components/scene/ProductShotPanel";
import { TipsToggle, InfoHint } from "@/components/ui/info-hint";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import type { VideoStyle } from "@/lib/fal/prompts";

type ExpandType = "video" | "music" | "script";

export default function Step3Expand() {
  const ent = useEntitlements();
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  // Inputs live in the store so they survive navigating to Compose and back.
  const expandDrafts = useAppStore((s) => s.expandDrafts);
  const patchExpandDrafts = useAppStore((s) => s.patchExpandDrafts);
  const videoDuration = expandDrafts.videoDuration;
  const videoStyle = expandDrafts.videoStyle as VideoStyle;
  const { musicGenre, musicModel, scriptPlatform, scriptTone, variationDirection } =
    expandDrafts;
  const setVideoDuration = (v: 10 | 30 | 60) =>
    patchExpandDrafts({ videoDuration: v });
  const setVideoStyle = (v: VideoStyle) => patchExpandDrafts({ videoStyle: v });
  const setMusicGenre = (v: string) => patchExpandDrafts({ musicGenre: v });
  const setMusicModel = (v: string) => patchExpandDrafts({ musicModel: v });
  const setScriptPlatform = (v: string) =>
    patchExpandDrafts({ scriptPlatform: v });
  const setScriptTone = (v: string) => patchExpandDrafts({ scriptTone: v });
  const setVariationDirection = (v: Record<string, string>) =>
    patchExpandDrafts({ variationDirection: v });

  const {
    generatedAssets,
    selectedAnchorId,
    updateExpansion,
    setCreditBalance,
    creditBalance,
    currentCampaignId,
    workspaceSlug,
    completeStep,
    setStep,
    expansions,
  } = useAppStore();
  const anchor = generatedAssets.find((a) => a.id === selectedAnchorId);

  const syncBalance = () => {
    api("/api/credits/balance", { workspaceSlug })
      .then((r) => r.json())
      .then((d: { balance?: number }) => {
        if (typeof d.balance === "number") setCreditBalance(d.balance);
      })
      .catch(() => {});
  };

  const handleGenerate = async (type: ExpandType) => {
    if (!anchor) return;
    updateExpansion(type, {
      status: "pending",
      jobId: expansions[type]?.jobId,
    });

    try {
      const campaignId = currentCampaignId ?? "demo";
      const PLATFORM_MAP: Record<string, string> = {
        IG: "instagram",
        LI: "linkedin",
        TikTok: "tiktok",
      };
      const TONE_MAP: Record<string, string> = {
        Pro: "professional",
        Casual: "casual",
        Playful: "playful",
      };

      const jobType =
        type === "video"
          ? (`video_${videoDuration}s` as
              | "video_10s"
              | "video_30s"
              | "video_60s")
          : type === "music"
            ? "music_generation"
            : "script_generation";

      const params: Record<string, unknown> = {
        imageUrl: anchor.url,
        prompt: anchor.prompt,
      };
      if (type === "music") {
        params.genre = musicGenre;
        // Match the music length to the ACTUAL generated video length (the model
        // caps clips at ~5–10s), not the 10/30/60 label, so they line up when composed.
        params.durationSec =
          ({ 10: 5, 30: 10, 60: 10 } as Record<number, number>)[videoDuration] ??
          videoDuration;
        params.musicModel = musicModel;
        if (variationDirection.music) {
          params.variationDirection = variationDirection.music;
        }
      } else if (type === "video") {
        params.videoStyle = videoStyle;
        if (variationDirection.video) {
          params.variationDirection = variationDirection.video;
        }
      } else if (type === "script") {
        params.platform =
          PLATFORM_MAP[scriptPlatform] ?? scriptPlatform.toLowerCase();
        params.tone = TONE_MAP[scriptTone] ?? scriptTone.toLowerCase();
        params.imageDescription = anchor.prompt;
        if (variationDirection.script) {
          params.variationDirection = variationDirection.script;
        }
      }

      const jobRes = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({ type: jobType, campaignId, params }),
        workspaceSlug,
      });

      if (!jobRes.ok) {
        const e = (await jobRes.json().catch(() => ({}))) as {
          error?: string;
          issues?: string[];
        };
        const detail =
          e.issues?.join("; ") ??
          e.error ??
          `Request failed (${jobRes.status})`;
        throw new Error(detail);
      }

      const postData = (await jobRes.json()) as {
        jobId: string;
        creditCost: number;
        status?: string;
        result?: string;
      };
      setCreditBalance(creditBalance - (postData.creditCost ?? 0));

      // Script generation is synchronous — POST returns final result directly
      if (postData.status === "ready" && type === "script") {
        updateExpansion(type, { status: "ready", content: postData.result });
        toast.success("Caption ready");
        syncBalance();
        // Persist immediately — don't wait for "Continue to Compose"
        const saved = useAppStore.getState().expansions;
        if (currentCampaignId && currentCampaignId !== "__new__") {
          api(`/api/campaigns/${currentCampaignId}`, {
            method: "PATCH",
            body: JSON.stringify({ expansion_data: saved }),
            workspaceSlug,
          }).catch(() => {});
        }
        return;
      }

      const INTERVAL = type === "video" ? 6000 : 4000;
      const MAX_MS = type === "video" ? 5 * 60 * 1000 : 3 * 60 * 1000;
      // eslint-disable-next-line react-hooks/purity
      const startedAt = Date.now();

      const poll = async (): Promise<void> => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        if (Date.now() - startedAt > MAX_MS) {
          throw new Error(
            type === "video"
              ? "Video generation timed out after 5 minutes — the generator may be under load. Your credits have not been charged. Please retry."
              : "Music generation timed out after 3 minutes. Please retry.",
          );
        }

        await new Promise((r) => setTimeout(r, INTERVAL));
        updateExpansion(type, { status: "pending", elapsed });

        const res = await api(`/api/jobs/${postData.jobId}`, { workspaceSlug });
        if (!res.ok) throw new Error("Status check failed");

        const job = (await res.json()) as {
          status: string;
          outputUrls?: string[];
          errorMessage?: string | null;
          errorAnalysis?: string | null;
          suggestedPrompt?: string | null;
        };

        if (job.status === "ready") {
          if (type === "video" || type === "music") {
            const currentUrls =
              useAppStore.getState().expansions[type]?.urls ?? [];
            updateExpansion(type, {
              status: "ready",
              url: job.outputUrls?.[0],
              urls: [...currentUrls, job.outputUrls![0]],
              jobId: postData.jobId,
            });
          } else {
            updateExpansion(type, {
              status: "ready",
              url: job.outputUrls?.[0],
              jobId: postData.jobId,
            });
          }
          toast.success(
            `${type === "video" ? "Video" : type === "music" ? "Music" : "Caption"} ready`,
          );
          syncBalance();
          setVariationDirection({ ...variationDirection, [type]: "" });
          const saved = useAppStore.getState().expansions;
          if (currentCampaignId && currentCampaignId !== "__new__") {
            api(`/api/campaigns/${currentCampaignId}`, {
              method: "PATCH",
              body: JSON.stringify({ expansion_data: saved }),
              workspaceSlug,
            }).catch(() => {});
          }
        } else if (job.status === "failed") {
          const msg =
            job.errorAnalysis ??
            job.errorMessage ??
            "Generation failed — please try again";
          const hint = job.suggestedPrompt
            ? ` Try: "${job.suggestedPrompt}"`
            : "";
          throw new Error(msg + hint);
        } else {
          return poll();
        }
      };

      await poll();
    } catch (err: unknown) {
      const message =
        (err as Error).message ?? "Generation failed — please try again";
      updateExpansion(type, { status: "failed", error: message });
      toast.error(message);
    }
  };

  const anyReady =
    expansions.video?.status === "ready" ||
    expansions.music?.status === "ready" ||
    expansions.script?.status === "ready";

  // Music & caption are gated behind the video so their length lines up with the
  // actual clip when composed (the "matched ad" workflow).
  const videoReady = expansions.video?.status === "ready";

  const handleRefresh = async (type: "video" | "music") => {
    const jobId = expansions[type]?.jobId;
    if (!jobId) return;
    try {
      const res = await api(`/api/jobs/${jobId}`, { workspaceSlug });
      if (!res.ok) return;
      const job = (await res.json()) as {
        status: string;
        outputUrls?: string[];
      };
      if (job.status === "ready" && job.outputUrls?.[0]) {
        updateExpansion(type, {
          status: "ready",
          url: job.outputUrls[0],
          jobId,
        });
        const saved = useAppStore.getState().expansions;
        if (currentCampaignId && currentCampaignId !== "__new__") {
          api(`/api/campaigns/${currentCampaignId}`, {
            method: "PATCH",
            body: JSON.stringify({ expansion_data: saved }),
            workspaceSlug,
          }).catch(() => {});
        }
        toast.success(`${type === "video" ? "Video" : "Music"} found`);
      } else {
        toast.error(
          `${type === "video" ? "Video" : "Music"} not ready yet — try again in a moment`,
        );
      }
    } catch {
      toast.error(`Failed to check ${type} status`);
    }
  };

  if (!anchor)
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No anchor selected — go back to step 2.
      </div>
    );

  return (
    <div className="h-full overflow-y-auto pb-32 p-4 sm:p-6 lg:p-8 relative">
      <div className="max-w-5xl mx-auto mb-4 flex justify-end">
        <TipsToggle />
      </div>
      <div className="max-w-5xl mx-auto flex flex-col lg:flex-row gap-5 lg:gap-8">
        {/* Anchor thumbnail — compact horizontal row on mobile, sidebar on desktop */}
        <div className="w-full lg:w-56 shrink-0">
          <h2 className="font-serif text-xl font-bold text-foreground mb-3 lg:mb-4">
            Your anchor
          </h2>
          <div className="flex lg:block items-start gap-4">
            <div className="relative aspect-square w-24 sm:w-32 lg:w-full shrink-0 rounded-xl overflow-hidden border border-border shadow-lg">
              <Image
                src={anchor.url}
                alt="Anchor"
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 224px, 128px"
              />
            </div>
            <p className="flex-1 lg:mt-4 text-sm text-muted-foreground bg-secondary/50 p-3 rounded-lg border border-border/50 italic">
              &ldquo;{anchor.prompt.substring(0, 80)}
              {anchor.prompt.length > 80 ? "…" : ""}&rdquo;
            </p>
          </div>
        </div>

        {/* Format cards — stack on mobile, 2-up on tablet, 3-up on desktop */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
          <FormatCard
            type="video"
            title="Video"
            subtitle="10–60s cinematic clip"
            cost={`${CREDIT_COSTS[`video_${videoDuration}s` as "video_10s" | "video_30s" | "video_60s"]} cr`}
            icon={Film}
            onGenerate={() => handleGenerate("video")}
            onRefresh={() => handleRefresh("video")}
            onRegenerate={() => handleGenerate("video")}
            onSelect={(url) => updateExpansion("video", { url })}
          >
            <div className="space-y-3">
              <div className="flex gap-2">
                {([10, 30, 60] as const).map((t) => {
                  const locked = ent ? !ent.videoDurations.includes(t) : false;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        locked ? setUpgradeOpen(true) : setVideoDuration(t)
                      }
                      className={`relative flex-1 py-1.5 text-xs rounded-full border transition-colors ${
                        videoDuration === t && !locked
                          ? "border-primary/50 text-primary bg-primary/10"
                          : locked
                            ? "border-border bg-background text-muted-foreground/60 hover:border-primary/50"
                            : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      {t}s
                      {locked && (
                        <Lock className="inline-block w-2.5 h-2.5 ml-1 -mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1 flex-wrap">
                {(["Cinematic", "Fast-cut", "Dramatic", "Smooth"] as const).map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setVideoStyle(s)}
                      className={`flex-1 py-1.5 text-xs rounded-full border transition-colors ${
                        videoStyle === s
                          ? "border-primary/50 text-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      {s}
                    </button>
                  ),
                )}
              </div>
              <input
                type="text"
                placeholder="What direction? (e.g., 'more dynamic', 'slower paced')"
                value={variationDirection.video}
                onChange={(e) =>
                  setVariationDirection({
                    ...variationDirection,
                    video: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </FormatCard>

          <FormatCard
            type="music"
            title="Music"
            subtitle="track matches your video length"
            cost="8 cr"
            icon={Music}
            locked={!videoReady}
            lockedHint="Generate your video first — music is sized to its length."
            onGenerate={() => handleGenerate("music")}
            onRefresh={() => handleRefresh("music")}
            onRegenerate={() => handleGenerate("music")}
            onSelect={(url) => updateExpansion("music", { url })}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  "Epic Cinematic",
                  "Lo-fi Chill",
                  "Corporate Jazz",
                  "Electronic",
                  "Acoustic Folk",
                  "Soulful Boom-bap",
                ].map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setMusicGenre(g)}
                    className={`py-1.5 text-xs rounded-full border transition-colors ${
                      musicGenre === g
                        ? "border-primary/50 text-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              {/* Sound engine — Balanced (Stable Audio) vs Natural (Lyria 2) */}
              <div className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase tracking-wider mr-1">
                  Engine
                  <InfoHint text="Balanced = fast & flexible (Stable Audio). Natural = richer, more organic instrumental (Lyria 2)." />
                </span>
                {[
                  { id: "stable-audio", label: "Balanced" },
                  { id: "lyria2", label: "Natural" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMusicModel(m.id)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                      musicModel === m.id
                        ? "border-primary/50 text-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/50"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="What direction? (e.g., 'add more energy', 'faster tempo')"
                value={variationDirection.music}
                onChange={(e) =>
                  setVariationDirection({
                    ...variationDirection,
                    music: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </FormatCard>

          <FormatCard
            type="script"
            title="Caption"
            subtitle="Platform-ready caption"
            cost="1 cr"
            icon={FileText}
            locked={!videoReady}
            lockedHint="Generate your video first — your comment is timed to it."
            onGenerate={() => handleGenerate("script")}
          >
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase w-14">
                  Platform
                  <InfoHint text="Tailors the caption's length, tone and hashtag style to this platform." />
                </span>
                <div className="flex gap-1">
                  {["IG", "LI", "TikTok"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setScriptPlatform(p)}
                      className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                        scriptPlatform === p
                          ? "border-primary/50 text-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <span className="text-[10px] text-muted-foreground uppercase w-12">
                  Tone
                </span>
                <div className="flex gap-1">
                  {["Pro", "Casual", "Playful"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setScriptTone(t)}
                      className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                        scriptTone === t
                          ? "border-primary/50 text-primary bg-primary/10"
                          : "border-border bg-background hover:border-primary/50"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <input
                type="text"
                placeholder="What direction? (e.g., 'shorter', 'add emojis', 'more persuasive')"
                value={variationDirection.script}
                onChange={(e) =>
                  setVariationDirection({
                    ...variationDirection,
                    script: e.target.value,
                  })
                }
                className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </FormatCard>
        </div>
      </div>

      {/* Product / Founder Spoken Video — a separate talking-spokesperson ad flow.
          Choose this when advertising a physical product or featuring a founder. */}
      <div className="max-w-5xl mx-auto mt-6">
        <TalkingVideoPanel />
      </div>

      {/* Virtual Try-On — put a product garment onto a model photo. */}
      <div className="max-w-5xl mx-auto mt-6">
        <VirtualTryOnPanel />
      </div>

      {/* Auto-Captions — burn subtitles into a talking video. */}
      <div className="max-w-5xl mx-auto mt-6">
        <AutoCaptionPanel />
      </div>

      {/* A/B Hooks — distinct hook variants to test. */}
      <div className="max-w-5xl mx-auto mt-6">
        <ABVariantsPanel />
      </div>

      {/* Product in Scene — drop a product into a generated lifestyle background. */}
      <div className="max-w-5xl mx-auto mt-6">
        <ProductShotPanel />
      </div>

      {/* Sticky continue bar — always visible, Expand is optional */}
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 35, delay: 0.2 }}
        className="fixed bottom-0 left-0 right-0 z-30 p-3 sm:p-4 pointer-events-none"
      >
        <div className="max-w-5xl mx-auto pointer-events-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-card/95 backdrop-blur-md border border-border rounded-2xl px-4 sm:px-5 py-3 shadow-lg">
            <p className="text-sm text-muted-foreground text-center sm:text-left">
              {anyReady
                ? `${[expansions.video, expansions.music, expansions.script].filter((e) => e?.status === "ready").length} asset${[expansions.video, expansions.music, expansions.script].filter((e) => e?.status === "ready").length !== 1 ? "s" : ""} ready — compose your post`
                : "Generate assets above, or skip straight to compose"}
            </p>
            <Button
              onClick={() => {
                completeStep(3);
                setStep(4);
                if (currentCampaignId && currentCampaignId !== "__new__") {
                  api(`/api/campaigns/${currentCampaignId}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      current_step: 4,
                      expansion_data: expansions,
                    }),
                    workspaceSlug,
                  }).catch(() => {});
                }
              }}
              className="bg-primary hover:bg-primary/90 text-white font-semibold gap-2 shrink-0 w-full sm:w-auto"
            >
              Continue to Compose
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>

      <UpgradeModal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        feature="Longer video"
        blurb="30-second and 60-second clips are available on Creator and Business plans."
      />
    </div>
  );
}
