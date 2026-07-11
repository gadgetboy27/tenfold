"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Calendar,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  X,
  ChevronRight,
  Loader2,
  Check,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";

interface SocialProfile {
  id: string;
  platform: string;
  handle: string | null;
  profile_display_name: string | null;
  /** Facebook only: the active Page + all managed Pages for the picker. */
  activePageId?: string | null;
  availablePages?: { id: string; name: string }[];
}

interface PlatformMeta {
  label: string;
  color: string;
  bg: string;
  charLimit: number;
}

const PLATFORM_META: Record<string, PlatformMeta> = {
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    bg: "bg-[#E1306C]/15",
    charLimit: 2200,
  },
  linkedin: {
    label: "LinkedIn",
    color: "#0A66C2",
    bg: "bg-[#0A66C2]/15",
    charLimit: 3000,
  },
  twitter: {
    label: "Twitter / X",
    color: "#ffffff",
    bg: "bg-white/10",
    charLimit: 280,
  },
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    bg: "bg-[#1877F2]/15",
    charLimit: 63206,
  },
  youtube: {
    label: "YouTube",
    color: "#FF0000",
    bg: "bg-[#FF0000]/15",
    charLimit: 5000,
  },
  tiktok: {
    label: "TikTok",
    color: "#69C9D0",
    bg: "bg-[#69C9D0]/15",
    charLimit: 2200,
  },
  pinterest: {
    label: "Pinterest",
    color: "#E60023",
    bg: "bg-[#E60023]/15",
    charLimit: 500,
  },
  gmb: {
    label: "Google Business",
    color: "#4285F4",
    bg: "bg-[#4285F4]/15",
    charLimit: 1500,
  },
  threads: {
    label: "Threads",
    color: "#ffffff",
    bg: "bg-white/10",
    charLimit: 500,
  },
  bluesky: {
    label: "Bluesky",
    color: "#0085FF",
    bg: "bg-[#0085FF]/15",
    charLimit: 300,
  },
  reddit: {
    label: "Reddit",
    color: "#FF4500",
    bg: "bg-[#FF4500]/15",
    charLimit: 40000,
  },
  telegram: {
    label: "Telegram",
    color: "#26A5E4",
    bg: "bg-[#26A5E4]/15",
    charLimit: 4096,
  },
  snapchat: {
    label: "Snapchat",
    color: "#FFFC00",
    bg: "bg-[#FFFC00]/15",
    charLimit: 250,
  },
};

// Every platform we can publish to (the 13 in publishSchema), in display order.
const ALL_PLATFORMS = Object.keys(PLATFORM_META);

interface PostResult {
  platform: string;
  status: string;
  id?: string;
  error?: string;
}

// ── Connected-platform chips: tap to include this asset on that social. ──────
function PlatformChips({
  profiles,
  selected,
  onToggle,
}: {
  profiles: SocialProfile[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  if (profiles.length === 0)
    return (
      <p className="text-[11px] text-muted-foreground">
        No accounts connected yet.
      </p>
    );
  return (
    <div className="flex flex-wrap gap-1.5">
      {profiles.map((pr) => {
        const meta = PLATFORM_META[pr.platform];
        if (!meta) return null;
        const on = selected.includes(pr.platform);
        return (
          <button
            key={pr.platform}
            type="button"
            onClick={() => onToggle(pr.platform)}
            className={`px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
              on
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function Step5Publish() {
  const {
    generatedAssets,
    selectedAnchorId,
    expansions,
    currentCompositionId,
    currentCampaignId,
    workspaceSlug,
    resetCampaign,
    setStep,
    platformCaptions,
    setPlatformCaptions,
  } = useAppStore();

  // A generated video exists for this campaign → offer to publish it (not a still).
  const hasVideo = expansions.video?.status === "ready";

  const [profiles, setProfiles] = useState<SocialProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  // Always show the "connect your socials" screen first (a deliberate step
  // before the publish page); "Continue to publish" dismisses it.
  const [connectGate, setConnectGate] = useState(true);
  // Dual publish: the static image and the video each get their OWN set of
  // socials (same or different). One "Publish" fires both.
  const [imagePlatforms, setImagePlatforms] = useState<string[]>([]);
  const [videoPlatforms, setVideoPlatforms] = useState<string[]>([]);
  const [facebookPageId, setFacebookPageId] = useState<string>("");
  // Union of both — drives the caption char-limit, FB-page selector, and button.
  const selectedPlatforms = useMemo(
    () => Array.from(new Set([...imagePlatforms, ...videoPlatforms])),
    [imagePlatforms, videoPlatforms],
  );
  const toggleImage = (id: string) =>
    setImagePlatforms((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );
  const toggleVideo = (id: string) =>
    setVideoPlatforms((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : [...p, id],
    );
  const [caption, setCaption] = useState(expansions.script?.content ?? "");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [hashtagInput, setHashtagInput] = useState("");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [results, setResults] = useState<PostResult[] | null>(null);
  const [adapting, setAdapting] = useState(false);

  const handleAdaptCaptions = async () => {
    if (!caption.trim()) {
      toast.error("Write a caption first.");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Select at least one platform.");
      return;
    }
    setAdapting(true);
    try {
      const res = await api("/api/publish/adapt-captions", {
        method: "POST",
        body: JSON.stringify({ caption, platforms: selectedPlatforms }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        captions?: Record<string, string>;
        error?: string;
      };
      if (!res.ok || !data.captions)
        throw new Error(data.error ?? "Could not adapt captions");
      setPlatformCaptions({ ...platformCaptions, ...data.captions });
      toast.success("Each platform will post its own tailored caption.");
    } catch (err) {
      toast.error((err as Error).message ?? "Could not adapt captions");
    } finally {
      setAdapting(false);
    }
  };

  const confettiParticles = useMemo(
    () =>
      Array.from({ length: 24 }, () => ({
        // eslint-disable-next-line react-hooks/purity
        x: Math.random() * 100,
        // eslint-disable-next-line react-hooks/purity
        y: Math.random() * 100,
        // eslint-disable-next-line react-hooks/purity
        delay: Math.random() * 0.3,
      })),
    [],
  );

  const anchor = generatedAssets.find((a) => a.id === selectedAnchorId);

  const fetchProfiles = useCallback(async () => {
    setLoadingProfiles(true);
    try {
      const res = await api("/api/social/profiles", { workspaceSlug });
      if (res.ok) {
        const data = (await res.json()) as SocialProfile[];
        setProfiles(data);
        // Default: publish the finished VIDEO everywhere; the static image is
        // opt-in (tick it per platform). If there's no video, default the image.
        const all = data.map((p) => p.platform);
        const videoReady =
          useAppStore.getState().expansions.video?.status === "ready";
        if (videoReady) setVideoPlatforms(all);
        else setImagePlatforms(all);
        // Default the FB Page picker to the workspace's active Page.
        const fb = data.find((p) => p.platform === "facebook");
        if (fb?.activePageId) setFacebookPageId(fb.activePageId);
      }
    } finally {
      setLoadingProfiles(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load of connected profiles
    fetchProfiles();
  }, [fetchProfiles]);

  const addHashtag = (raw: string) => {
    const tag = raw.replace(/^#+/, "").trim().replace(/\s+/g, "_");
    if (!tag || hashtags.includes(tag) || hashtags.length >= 30) return;
    setHashtags((prev) => [...prev, tag]);
    setHashtagInput("");
  };

  const handleHashtagKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addHashtag(hashtagInput);
    }
    if (e.key === "Backspace" && !hashtagInput && hashtags.length > 0)
      setHashtags((prev) => prev.slice(0, -1));
  };

  const handlePublish = async () => {
    if (selectedPlatforms.length === 0) {
      toast.error("Select at least one platform");
      return;
    }
    if (scheduleMode === "later" && !scheduledAt) {
      toast.error("Pick a date and time to schedule");
      return;
    }

    setIsPublishing(true);
    try {
      const scheduledIso =
        scheduleMode === "later"
          ? new Date(scheduledAt).toISOString()
          : undefined;

      // One publish call per asset, each to ITS chosen platforms. The static
      // image and the video can go to the same or different socials.
      const sendTo = async (
        platforms: string[],
        kind: "image" | "video",
      ): Promise<PostResult[]> => {
        if (platforms.length === 0) return [];
        const body: Record<string, unknown> = { platforms, caption, hashtags };
        if (kind === "video") {
          body.preferVideo = true;
          body.campaignId = currentCampaignId;
          if (currentCompositionId) body.compositionId = currentCompositionId;
        } else {
          // Image: post the anchor still (no preferVideo → the route uses it).
          if (selectedAnchorId) body.assetId = selectedAnchorId;
        }
        const tailored = Object.fromEntries(
          platforms
            .filter((p) => platformCaptions[p])
            .map((p) => [p, platformCaptions[p]]),
        );
        if (Object.keys(tailored).length) body.platformCaptions = tailored;
        if (platforms.includes("facebook") && facebookPageId)
          body.facebookPageId = facebookPageId;
        if (scheduledIso) body.scheduledAt = scheduledIso;

        const res = await api("/api/publish", {
          method: "POST",
          body: JSON.stringify(body),
          workspaceSlug,
        });
        const data = (await res.json().catch(() => ({}))) as {
          platformResults?: Record<string, string>;
          errors?: Record<string, string>;
          error?: string;
        };
        if (!res.ok && !data.platformResults) {
          return platforms.map((platform) => ({
            platform,
            status: "error",
            error: data.error ?? `Publish failed (${res.status})`,
          }));
        }
        const tag = kind === "video" ? "🎬" : "📷";
        return [
          ...Object.entries(data.platformResults ?? {}).map(
            ([platform, id]) => ({
              platform: `${tag} ${PLATFORM_META[platform]?.label ?? platform}`,
              status: "success",
              id,
            }),
          ),
          ...Object.entries(data.errors ?? {}).map(([platform, error]) => ({
            platform: `${tag} ${PLATFORM_META[platform]?.label ?? platform}`,
            status: "error",
            error,
          })),
        ];
      };

      const [videoRes, imageRes] = await Promise.all([
        sendTo(videoPlatforms, "video"),
        sendTo(imagePlatforms, "image"),
      ]);
      setResults([...videoRes, ...imageRes]);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "Publish failed");
    } finally {
      setIsPublishing(false);
    }
  };

  // ── Char limit: tightest of selected platforms ───────────────────────────
  const minLimit =
    selectedPlatforms.length > 0
      ? Math.min(
          ...selectedPlatforms.map((p) => PLATFORM_META[p]?.charLimit ?? 2200),
        )
      : 2200;
  const fullText =
    caption +
    (hashtags.length ? "\n\n" + hashtags.map((h) => `#${h}`).join(" ") : "");
  const charCount = fullText.length;
  const overLimit = charCount > minLimit;
  const tightPlatform = selectedPlatforms.find(
    (p) => (PLATFORM_META[p]?.charLimit ?? 9999) === minLimit,
  );

  // ── Results screen ───────────────────────────────────────────────────────
  if (results) {
    const failures = results.filter(
      (r) => r.status !== "success" && r.status !== "sent",
    );
    const allGood = failures.length === 0;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="h-full flex flex-col items-center justify-center relative overflow-hidden px-8"
      >
        {allGood &&
          confettiParticles.map((p, i) => (
            <motion.div
              key={i}
              initial={{ x: "50vw", y: "50vh", scale: 0, opacity: 1 }}
              animate={{
                x: `${p.x}vw`,
                y: `${p.y}vw`,
                scale: [0, 1, 0],
                opacity: [1, 1, 0],
              }}
              transition={{ duration: 1.8, ease: "easeOut", delay: p.delay }}
              className="absolute w-2 h-2 rounded-sm z-0 pointer-events-none"
              style={{
                left: 0,
                top: 0,
                backgroundColor: i % 2 === 0 ? "#7C5CFC" : "#ffffff",
              }}
            />
          ))}

        <div className="relative z-10 text-center max-w-sm w-full">
          <div
            className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${allGood ? "bg-primary/20" : "bg-amber-500/15"}`}
          >
            <Send
              className={`w-9 h-9 translate-x-1 -translate-y-1 ${allGood ? "text-primary" : "text-amber-400"}`}
            />
          </div>
          <h2 className="font-serif text-3xl font-bold text-foreground mb-2">
            {allGood ? "Content published!" : "Partially published"}
          </h2>
          <p className="text-muted-foreground text-sm mb-8">
            {scheduleMode === "later" && scheduledAt
              ? `Scheduled for ${new Date(scheduledAt).toLocaleString()}`
              : `Published at ${new Date().toLocaleTimeString()}`}
          </p>

          <div className="space-y-2 mb-8 text-left">
            {results.map((r) => {
              const meta = PLATFORM_META[r.platform];
              const ok = r.status === "success" || r.status === "sent";
              return (
                <div
                  key={r.platform}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${ok ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"}`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta?.bg ?? "bg-secondary"}`}
                  >
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: meta?.color ?? "currentColor" }}
                    >
                      {(meta?.label ?? r.platform)
                        .replace(/\s.*/, "")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  </div>
                  <span className="flex-1 font-medium text-foreground">
                    {meta?.label ?? r.platform}
                  </span>
                  {ok ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <div className="flex items-center gap-1.5 text-destructive shrink-0">
                      <XCircle className="w-4 h-4" />
                      <span className="text-xs">{r.error ?? "Failed"}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1 border-border"
              onClick={() => setResults(null)}
            >
              Edit & republish
            </Button>
            <Button
              className="flex-1 bg-primary hover:bg-primary/90 text-white"
              onClick={resetCampaign}
            >
              New campaign
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── No asset guard ───────────────────────────────────────────────────────
  if (!currentCompositionId && !selectedAnchorId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-500/15 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No content selected
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Go back and select an image to publish.
        </p>
        <Button onClick={() => setStep(2)} className="gap-2">
          Back to Select <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  // ── Connect-your-socials step — always shown before the publish page ───────
  if (connectGate) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-6 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" /> Connect your social
            accounts
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg">
            Link the platforms you want this project sent to. You only connect
            once — accounts stay linked for every project.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-md mx-auto space-y-2">
            {loadingProfiles ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking your
                accounts…
              </div>
            ) : (
              ALL_PLATFORMS.map((p) => {
                const meta = PLATFORM_META[p];
                const connected = profiles.some((pr) => pr.platform === p);
                const initials = meta.label
                  .replace(/\s.*/, "")
                  .slice(0, 2)
                  .toUpperCase();
                return (
                  <div
                    key={p}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}
                    >
                      <span
                        className="text-[10px] font-bold"
                        style={{ color: meta.color }}
                      >
                        {initials}
                      </span>
                    </div>
                    <p className="flex-1 min-w-0 text-sm font-medium text-foreground">
                      {meta.label}
                    </p>
                    {connected ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-success">
                        <Check className="w-3.5 h-3.5" /> Connected
                      </span>
                    ) : (
                      <Link
                        href={`/${workspaceSlug}/settings/social`}
                        className="text-xs font-medium text-primary hover:underline shrink-0"
                      >
                        Connect
                      </Link>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="p-6 border-t border-border shrink-0 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {profiles.length} connected
          </span>
          <Button
            onClick={() => setConnectGate(false)}
            disabled={profiles.length === 0}
            className="gap-2"
            title={
              profiles.length === 0
                ? "Connect at least one account to publish"
                : "Continue to the publish screen"
            }
          >
            Continue to publish <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  // ── No platforms connected guard (fallback) ────────────────────────────────
  if (!loadingProfiles && profiles.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center">
          <Send className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">
          No social accounts connected
        </h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Connect your accounts in Settings first — your content will be waiting
          here when you get back.
        </p>
        <Link href={`/${workspaceSlug}/settings/social`}>
          <Button className="gap-2 bg-primary hover:bg-primary/90 text-white">
            Connect accounts <ExternalLink className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    );
  }

  // ── Main publish UI ──────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col md:flex-row overflow-hidden">
      {/* Preview panel */}
      <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border shrink-0">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
            Preview
          </p>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto bg-secondary/20">
          <div className="w-full max-w-[300px] bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-3 flex items-center gap-2.5 border-b border-border">
              <div className="w-8 h-8 rounded-full bg-primary/30 flex items-center justify-center text-primary font-bold text-[10px] shrink-0">
                TF
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground leading-none">
                  Your brand
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Just now
                </p>
              </div>
            </div>
            {fullText && (
              <div className="px-3 py-2.5 text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                {fullText.slice(0, 140)}
                {fullText.length > 140 ? "…" : ""}
              </div>
            )}
            {anchor ? (
              <div className="relative w-full aspect-square bg-secondary">
                <Image
                  src={anchor.url}
                  alt="Post media"
                  fill
                  className="object-cover"
                  sizes="100%"
                />
              </div>
            ) : (
              <div className="w-full aspect-square bg-secondary flex items-center justify-center">
                <p className="text-xs text-muted-foreground">No image</p>
              </div>
            )}
            <div className="p-3 flex gap-3 border-t border-border">
              {[56, 44, 72].map((w, i) => (
                <div
                  key={i}
                  className="h-2.5 bg-secondary rounded-full"
                  style={{ width: w }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Controls panel */}
      <div className="w-full md:w-[360px] flex flex-col overflow-hidden border-t md:border-t-0 border-border">
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {/* Dual publish — the static image and the video each to their OWN
              socials, with a thumbnail so it's clear which is which. */}
          <div className="p-4 space-y-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Publish to
            </p>
            {loadingProfiles ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading connected
                accounts…
              </div>
            ) : (
              <>
                {/* Static image (with its caption) */}
                {anchor && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="flex gap-3 p-3">
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-secondary shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={anchor.url}
                          alt="Static image"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          📷 Static image
                        </p>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                          {caption
                            ? `“${caption.slice(0, 70)}${caption.length > 70 ? "…" : ""}”`
                            : "with your caption"}
                        </p>
                      </div>
                    </div>
                    <div className="px-3 pb-3">
                      <p className="text-[10px] text-muted-foreground mb-1.5">
                        Send the image to:
                      </p>
                      <PlatformChips
                        profiles={profiles}
                        selected={imagePlatforms}
                        onToggle={toggleImage}
                      />
                    </div>
                  </div>
                )}
                {/* Video */}
                {hasVideo && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="flex gap-3 p-3">
                      <video
                        src={expansions.video?.url}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-16 h-16 rounded-lg object-cover bg-black shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          🎬 Video
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          your finished film + music
                        </p>
                      </div>
                    </div>
                    <div className="px-3 pb-3">
                      <p className="text-[10px] text-muted-foreground mb-1.5">
                        Send the video to:
                      </p>
                      <PlatformChips
                        profiles={profiles}
                        selected={videoPlatforms}
                        onToggle={toggleVideo}
                      />
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setConnectGate(true)}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-primary transition-colors"
                >
                  <ExternalLink className="w-3 h-3" /> Connect more platforms
                </button>
                {(() => {
                  const fb = profiles.find((p) => p.platform === "facebook");
                  const pages = fb?.availablePages ?? [];
                  if (
                    pages.length <= 1 ||
                    !selectedPlatforms.includes("facebook")
                  )
                    return null;
                  return (
                    <div>
                      <label className="block text-[11px] text-muted-foreground mb-1">
                        Facebook Page — publishing to:
                      </label>
                      <select
                        value={facebookPageId}
                        onChange={(e) => setFacebookPageId(e.target.value)}
                        className="w-full text-sm rounded-lg border border-border bg-background text-foreground px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                      >
                        {pages.map((pg) => (
                          <option key={pg.id} value={pg.id}>
                            {pg.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Caption */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                Caption
              </p>
              <span
                className={`text-[10px] font-mono ${overLimit ? "text-destructive" : "text-muted-foreground"}`}
              >
                {charCount.toLocaleString()} / {minLimit.toLocaleString()}
                {tightPlatform && selectedPlatforms.length > 1 && (
                  <span className="ml-1 opacity-60">
                    ({PLATFORM_META[tightPlatform]?.label})
                  </span>
                )}
              </span>
            </div>
            <textarea
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                setPlatformCaptions({});
              }}
              placeholder="Write your caption…"
              rows={4}
              className={`w-full bg-secondary/30 border rounded-xl px-3.5 py-2.5 text-sm text-foreground placeholder-muted-foreground/50 resize-none outline-none transition-colors ${
                overLimit
                  ? "border-destructive/50 focus:border-destructive"
                  : "border-border focus:border-primary/50"
              }`}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleAdaptCaptions}
                disabled={adapting}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-primary/40 bg-primary/5 hover:bg-primary/10 text-xs text-primary font-medium transition-colors disabled:opacity-60"
              >
                {adapting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Fit to each platform (AI)
              </button>
              {selectedPlatforms.some((p) => platformCaptions[p]) && (
                <span className="text-[10px] text-primary">
                  ✓{" "}
                  {selectedPlatforms.filter((p) => platformCaptions[p]).length}{" "}
                  platform(s) get a tailored caption
                </span>
              )}
            </div>
          </div>

          {/* Hashtags */}
          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-2">
              Hashtags
            </p>
            <div className="min-h-[40px] flex flex-wrap gap-1.5 p-2 bg-secondary/30 border border-border rounded-xl focus-within:border-primary/50 transition-colors">
              {hashtags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 text-xs bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() =>
                      setHashtags((prev) => prev.filter((h) => h !== tag))
                    }
                    className="hover:text-destructive transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                value={hashtagInput}
                onChange={(e) =>
                  setHashtagInput(e.target.value.replace(/[\s,]/g, ""))
                }
                onKeyDown={handleHashtagKey}
                onBlur={() => {
                  if (hashtagInput) addHashtag(hashtagInput);
                }}
                placeholder={hashtags.length === 0 ? "#tag — Enter to add" : ""}
                className="flex-1 min-w-[100px] bg-transparent text-sm text-foreground placeholder-muted-foreground/50 outline-none"
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              {hashtags.length}/30
            </p>
          </div>

          {/* Schedule */}
          <div className="p-4">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
              When to post
            </p>
            <div className="flex gap-2 mb-3">
              {(["now", "later"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScheduleMode(mode)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-medium transition-all ${
                    scheduleMode === mode
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {mode === "now" ? (
                    <>
                      <Send className="w-3.5 h-3.5" /> Post now
                    </>
                  ) : (
                    <>
                      <Calendar className="w-3.5 h-3.5" /> Schedule
                    </>
                  )}
                </button>
              ))}
            </div>
            <AnimatePresence initial={false}>
              {scheduleMode === "later" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    min={
                      // eslint-disable-next-line react-hooks/purity -- min datetime floor; impurity is harmless here
                      new Date(Date.now() + 5 * 60 * 1000)
                        .toISOString()
                        .slice(0, 16)
                    }
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="w-full bg-secondary/30 border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 transition-colors"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Sticky publish button */}
        <div className="p-4 border-t border-border shrink-0">
          {overLimit && tightPlatform && (
            <p className="text-xs text-destructive text-center mb-2">
              Over {minLimit.toLocaleString()}-char limit for{" "}
              {PLATFORM_META[tightPlatform]?.label}. Shorten or deselect it.
            </p>
          )}
          <Button
            onClick={handlePublish}
            disabled={
              isPublishing || selectedPlatforms.length === 0 || overLimit
            }
            className="w-full h-12 bg-gradient-to-r from-primary to-[#9D84FD] text-white font-semibold text-base rounded-xl shadow-lg shadow-primary/20 gap-2 disabled:opacity-40"
          >
            {isPublishing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Publishing…
              </>
            ) : scheduleMode === "later" ? (
              <>
                <Clock className="w-4 h-4" /> Schedule ·{" "}
                {selectedPlatforms.length} platform
                {selectedPlatforms.length !== 1 ? "s" : ""}
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Publish ·{" "}
                {selectedPlatforms.length} platform
                {selectedPlatforms.length !== 1 ? "s" : ""}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
