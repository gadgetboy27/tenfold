"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  PenLine,
  Images as ImagesIcon,
  Play,
  Music,
  MessageSquare,
  Layers,
  Shapes,
  Send,
  Sparkles,
  Check,
  Loader2,
  ArrowRight,
  Share2,
  Crown,
  Scissors,
  Lock,
  LayoutGrid,
  List as ListIcon,
  Music2,
  Download,
  Maximize2,
  Anchor,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Spinner } from "@/components/brand/Spinner";
import CreditMeter from "@/components/shared/CreditMeter";
import UpgradeModal from "@/components/billing/UpgradeModal";
import {
  StudioSelect,
  type StudioOption,
} from "@/components/studio/StudioSelect";
import { LogoStudio } from "@/components/logo/LogoStudio";
import { CompositorCanvas } from "@/components/studio/CompositorCanvas";
import { ReferencePhotoField } from "@/components/studio/ReferencePhotoField";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import { randomCampaignName } from "@/lib/util/campaign-name";
import { MUSIC_GENRES } from "@/lib/fal/prompts";
import { MUSIC_MODELS } from "@/lib/fal/models";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";

/**
 * Studio — the main site (rendered directly at /[workspace]). A single
 * Cockpit layout: left panel for input/navigation, right panel for the
 * persistent result — the frame stays put, only the canvas changes. It drives
 * the SAME endpoints the classic flow used — a new surface over existing
 * functionality, not a new engine. Sections not yet ported (Caption,
 * Compositor, Publish beyond the basics) fall back to a placeholder, with
 * Compositor/Logo offering a deliberate "Open in classic" link.
 */

type SectionId =
  | "projects"
  | "brief"
  | "images"
  | "video"
  | "music"
  | "caption"
  | "compositor"
  | "logo"
  | "publish";

interface ProjectSummary {
  id: string;
  name: string | null;
  status: string;
  thumbnailUrl: string | null;
  created_at: string;
  anchor_asset_id: string | null;
}

/** A past generated image, reusable as the anchor of a brand-new project. */
interface GalleryImage {
  id: string;
  url: string;
  type: string;
  campaign_id: string;
  metadata?: { direction?: string } | null;
  created_at: string;
}

interface Anchor {
  id: string;
  url: string;
  label: string;
}

const STAGE_LABELS = [
  [0, "Submitting your brief…"],
  [3, "Waiting for a GPU…"],
  [7, "Painting your options…"],
  [14, "Adding fine details…"],
  [24, "Almost there…"],
] as const;

// Established in the classic flow: 5s was dropped, so 10 / 15 / 30 (30s is Pro).
const VIDEO_LENGTHS = [10, 15, 30] as const;
const VIDEO_STYLES = ["Cinematic", "Fast-cut", "Dramatic", "Smooth"] as const;

const VIDEO_STAGE_LABELS = [
  [0, "Submitting your shot…"],
  [4, "Waiting for a GPU…"],
  [12, "Animating your scene…"],
  [40, "Rendering the motion…"],
  [80, "Finishing the cut…"],
] as const;

export function Studio({
  workspaceSlug,
  logoEnabled = false,
}: {
  workspaceSlug: string;
  logoEnabled?: boolean;
}) {
  const setWorkspaceSlug = useAppStore((s) => s.setWorkspaceSlug);
  const setCreditBalance = useAppStore((s) => s.setCreditBalance);
  const ent = useEntitlements();

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Tenfold campaign", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
      }
    } catch {
      /* the user dismissed the share sheet — nothing to do */
    }
  };

  const [section, setSectionRaw] = useState<SectionId>("brief");
  // Set by the Pro-effects panel so the Compositor opens with that op
  // preselected. navigateSection clears it the moment navigation heads
  // anywhere else, so a later plain nav click into Compositor doesn't reuse a
  // stale preselection.
  const [compositorInitialOp, setCompositorInitialOp] = useState<
    "inpaint" | "blend" | null
  >(null);
  const setSection = (s: SectionId) => {
    if (s !== "compositor") setCompositorInitialOp(null);
    setSectionRaw(s);
  };
  // Pre-fill a friendly random project name; the user can keep it, clear it, or
  // rename it. Persisted to the campaign once one exists.
  const [campaignName, setCampaignName] = useState(randomCampaignName);
  const [prompt, setPrompt] = useState("");
  const [variety, setVariety] = useState(true);
  // Bring-your-own product photo (image-conditioned generation via Kontext).
  const [referenceUrl, setReferenceUrl] = useState<string | null>(null);
  const [refUploading, setRefUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [assets, setAssets] = useState<Anchor[]>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const pollRef = useRef(false);

  // Video — same lengths + styles as the classic flow (10s / 15s / 30s).
  const [videoDuration, setVideoDuration] = useState<10 | 15 | 30>(10);
  const [videoStyle, setVideoStyle] =
    useState<(typeof VIDEO_STYLES)[number]>("Cinematic");
  const [videoGenerating, setVideoGenerating] = useState(false);
  const [videoStage, setVideoStage] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Music — the track is sized to the chosen video length. Genre + engine reuse
  // the classic flow's curated lists (MUSIC_GENRES / MUSIC_MODELS).
  const [musicGenre, setMusicGenre] = useState<string>(MUSIC_GENRES[0]);
  const [musicModel, setMusicModel] = useState<string>(MUSIC_MODELS[0].id);
  const [musicLyrics, setMusicLyrics] = useState("");
  const [musicGenerating, setMusicGenerating] = useState(false);
  const [musicStage, setMusicStage] = useState("");
  const [musicUrl, setMusicUrl] = useState<string | null>(null);

  // The image being worked on in the enhance/video stage — starts as the anchor,
  // and a Pro effect (e.g. background removal) can replace it with its result.
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [bgBusy, setBgBusy] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const refreshBalance = useCallback(() => {
    api("/api/credits/balance", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { balance?: number } | null) => {
        if (typeof d?.balance === "number") setCreditBalance(d.balance);
      })
      .catch(() => {});
  }, [workspaceSlug, setCreditBalance]);

  useEffect(() => {
    setWorkspaceSlug(workspaceSlug);
    refreshBalance();
  }, [workspaceSlug, setWorkspaceSlug, refreshBalance]);

  // Persist the project name (once a campaign exists); never leave it blank.
  const saveName = () => {
    const name = campaignName.trim() || randomCampaignName();
    if (name !== campaignName) setCampaignName(name);
    if (campaignId) {
      api(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
        workspaceSlug,
      }).catch(() => {});
    }
  };

  const uploadReference = async (file: File) => {
    setRefUploading(true);
    const t = toast.loading("Uploading photo…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api("/api/uploads/image", {
        method: "POST",
        body: fd,
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      setReferenceUrl(data.url);
      toast.success("Photo added — your ads will feature it", { id: t });
    } catch (err) {
      toast.error((err as Error).message ?? "Upload failed", { id: t });
    } finally {
      setRefUploading(false);
    }
  };

  const generate = async () => {
    if (prompt.trim().length < 3 || generating) return;
    setGenerating(true);
    setStage(STAGE_LABELS[0][1]);
    setAssets([]);
    setAnchorId(null);
    setEnhancedUrl(null);
    setVideoUrl(null);
    setSection("images");
    try {
      const res = await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          prompt: prompt.trim(),
          variety,
          name: campaignName.trim() || randomCampaignName(),
          ...(referenceUrl ? { referenceImageUrl: referenceUrl } : {}),
        }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        campaignId?: string;
        error?: string;
        issues?: string[];
      };
      if (!res.ok || !data.campaignId) {
        throw new Error(
          data.issues?.join(" — ") ?? data.error ?? "Couldn't start generation",
        );
      }
      setCampaignId(data.campaignId);
      refreshBalance();
      await poll(data.campaignId);
    } catch (err) {
      setGenerating(false);
      setSection("brief");
      toast.error((err as Error).message ?? "Generation failed");
    }
  };

  const poll = async (id: string) => {
    pollRef.current = true;
    let attempts = 0;
    while (pollRef.current && attempts < 80) {
      attempts++;
      await new Promise((r) => setTimeout(r, 1500));
      const elapsed = attempts * 1.5;
      setStage(
        [...STAGE_LABELS].reverse().find(([t]) => elapsed >= t)?.[1] ??
          STAGE_LABELS[0][1],
      );
      const res = await api(`/api/campaigns/${id}`, { workspaceSlug });
      if (!res.ok) continue;
      const camp = (await res.json()) as {
        status: string;
        assets: {
          id: string;
          url: string;
          metadata?: { direction?: string; model?: string; hd?: boolean };
        }[];
      };
      if (camp.status === "ready") {
        const imgs = camp.assets
          .filter((a) => a.url && !a.metadata?.hd)
          .map((a) => ({
            id: a.id,
            url: a.url,
            label: a.metadata?.model ?? a.metadata?.direction ?? "",
          }));
        setAssets(imgs);
        setGenerating(false);
        refreshBalance();
        toast.success("Options ready — pick the one you like");
        return;
      }
      if (camp.status === "failed") {
        throw new Error("Generation failed — please try again");
      }
    }
  };

  const pickAnchor = async (id: string) => {
    setAnchorId(id);
    setEnhancedUrl(null); // a fresh pick = a fresh working image
    setVideoUrl(null);
    try {
      await api(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        body: JSON.stringify({ anchor_asset_id: id }),
        workspaceSlug,
      });
    } catch {
      /* selection is local-first; the PATCH is best-effort */
    }
  };

  // Open a past project into the canvas — rehydrate its state and land on the
  // right stage. Never leaves the surface. Pass `goto` to jump straight to a
  // specific section (e.g. "publish") instead of the default anchor/images/
  // brief heuristic — used by the Gallery's Publish quick-action.
  const openProject = async (id: string, goto?: SectionId) => {
    try {
      const res = await api(`/api/campaigns/${id}`, { workspaceSlug });
      if (!res.ok) throw new Error("Couldn't open that project");
      const camp = (await res.json()) as {
        name?: string | null;
        anchor_asset_id?: string | null;
        assets?: {
          id: string;
          type: string;
          url: string;
          created_at: string;
          metadata?: { model?: string; direction?: string; hd?: boolean };
        }[];
        expansion_data?: { video?: { url?: string | null } };
      };
      const list = camp.assets ?? [];
      const imgs = list
        .filter((a) => a.type === "image" && !a.metadata?.hd)
        .map((a) => ({
          id: a.id,
          url: a.url,
          label: a.metadata?.model ?? a.metadata?.direction ?? "",
        }));
      const vid =
        list
          .filter((a) => a.type === "video")
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.url ??
        camp.expansion_data?.video?.url ??
        null;
      setCampaignId(id);
      setCampaignName(camp.name?.trim() || randomCampaignName());
      setAssets(imgs);
      setAnchorId(camp.anchor_asset_id ?? null);
      setEnhancedUrl(null);
      setVideoUrl(vid);
      setReferenceUrl(null);
      setGenerating(false);
      setSection(
        goto ??
          (camp.anchor_asset_id ? "video" : imgs.length ? "images" : "brief"),
      );
    } catch (err) {
      toast.error((err as Error).message ?? "Couldn't open that project");
    }
  };

  const newProject = () => {
    setCampaignId(null);
    setCampaignName(randomCampaignName());
    setPrompt("");
    setAssets([]);
    setAnchorId(null);
    setEnhancedUrl(null);
    setVideoUrl(null);
    setReferenceUrl(null);
    setGenerating(false);
    setSection("brief");
  };

  // Start a brand-new project anchored on an already-generated image from the
  // Gallery's Images tab — free, no regeneration. Mirrors openProject's state
  // shape but for a single carried-over asset instead of a full campaign.
  const reuseGalleryImage = async (assetId: string) => {
    try {
      const res = await api("/api/campaigns/from-asset", {
        method: "POST",
        body: JSON.stringify({ assetId }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        campaignId?: string;
        campaignName?: string;
        asset?: { id: string; url: string; direction?: string };
        error?: string;
      };
      if (!res.ok || !data.campaignId || !data.asset) {
        throw new Error(data.error ?? "Couldn't reuse this image");
      }
      setCampaignId(data.campaignId);
      setCampaignName(data.campaignName?.trim() || randomCampaignName());
      setAssets([
        {
          id: data.asset.id,
          url: data.asset.url,
          label: data.asset.direction ?? "",
        },
      ]);
      setAnchorId(data.asset.id);
      setEnhancedUrl(null);
      setVideoUrl(null);
      setReferenceUrl(null);
      setGenerating(false);
      setSection("video");
      toast.success("New project started from this image — no credits used.");
    } catch (err) {
      toast.error((err as Error).message ?? "Couldn't reuse this image");
    }
  };

  const anchor = assets.find((a) => a.id === anchorId) ?? null;

  // Bring the chosen still to life — the classic video pipeline (Kling), driven
  // from Studio. Same endpoint, same lengths/styles, result plays in the canvas.
  const generateVideo = async () => {
    if (!anchor || !campaignId || videoGenerating) return;
    setVideoGenerating(true);
    setVideoUrl(null);
    setVideoStage(VIDEO_STAGE_LABELS[0][1]);
    try {
      const res = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          campaignId,
          type: `video_${videoDuration}s`,
          params: {
            imageUrl: enhancedUrl ?? anchor.url,
            prompt: "",
            videoStyle,
          },
        }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
        upgrade?: boolean;
      };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error ?? "Couldn't start the video");
      }
      refreshBalance();
      for (let i = 0; i < 160; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const elapsed = i * 2;
        setVideoStage(
          [...VIDEO_STAGE_LABELS].reverse().find(([t]) => elapsed >= t)?.[1] ??
            VIDEO_STAGE_LABELS[0][1],
        );
        const jr = await api(`/api/jobs/${data.jobId}`, { workspaceSlug });
        if (!jr.ok) continue;
        const job = (await jr.json()) as {
          status: string;
          outputUrls?: string[];
        };
        if (job.status === "ready" && job.outputUrls?.[0]) {
          setVideoUrl(job.outputUrls[0]);
          refreshBalance();
          toast.success("Your video is ready");
          break;
        }
        if (job.status === "failed") throw new Error("Video generation failed");
      }
    } catch (err) {
      toast.error((err as Error).message ?? "Video generation failed");
    } finally {
      setVideoGenerating(false);
    }
  };

  // Music — sized to the chosen video length (falls back to 30s if no video yet).
  const generateMusic = async () => {
    if (!campaignId || musicGenerating) return;
    const isVocals = MUSIC_MODELS.find((m) => m.id === musicModel)?.vocals;
    setMusicGenerating(true);
    setMusicUrl(null);
    setMusicStage("Composing your track…");
    try {
      const res = await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          campaignId,
          type: "music_generation",
          params: {
            genre: musicGenre,
            musicModel,
            durationSec: videoDuration,
            ...(isVocals && musicLyrics.trim()
              ? { lyrics: musicLyrics.trim() }
              : {}),
          },
        }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error ?? "Couldn't start the music");
      }
      refreshBalance();
      for (let i = 0; i < 80; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const jr = await api(`/api/jobs/${data.jobId}`, { workspaceSlug });
        if (!jr.ok) continue;
        const job = (await jr.json()) as {
          status: string;
          outputUrls?: string[];
        };
        if (job.status === "ready" && job.outputUrls?.[0]) {
          setMusicUrl(job.outputUrls[0]);
          refreshBalance();
          toast.success("Your track is ready");
          break;
        }
        if (job.status === "failed") throw new Error("Music generation failed");
      }
    } catch (err) {
      toast.error((err as Error).message ?? "Music generation failed");
    } finally {
      setMusicGenerating(false);
    }
  };

  // The still on the enhance surface — the anchor, or a Pro-effect result.
  const workingImage = enhancedUrl ?? anchor?.url ?? null;

  // Pro effect — remove the anchor's background; the cutout becomes the working
  // still on the canvas (and the source for the video).
  const removeBg = async () => {
    if (!anchorId || bgBusy) return;
    setBgBusy(true);
    const t = toast.loading("Removing background…");
    try {
      const res = await api(`/api/assets/${anchorId}/bg-remove`, {
        method: "POST",
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error ?? "Couldn't start background removal");
      }
      refreshBalance();
      let url: string | null = null;
      for (let i = 0; i < 40 && !url; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const jr = await api(`/api/jobs/${data.jobId}`, { workspaceSlug });
        if (!jr.ok) continue;
        const job = (await jr.json()) as {
          status: string;
          outputUrls?: string[];
        };
        if (job.status === "ready" && job.outputUrls?.[0])
          url = job.outputUrls[0];
        else if (job.status === "failed")
          throw new Error("Background removal failed");
      }
      if (!url) throw new Error("Background removal timed out");
      setEnhancedUrl(url);
      refreshBalance();
      toast.success("Background removed", { id: t });
    } catch (err) {
      toast.error((err as Error).message ?? "Background removal failed", {
        id: t,
      });
    } finally {
      setBgBusy(false);
    }
  };

  const anchorPicked = !!anchorId;
  const publishReady = anchorPicked || !!videoUrl; // grows as more of the flow lands

  // Every nav item stays IN Studio (setSection) — no item flings you to the
  // classic app on click. classicHref is only for the deliberate "Open in
  // classic" button inside a not-yet-built section's placeholder.
  const tools: {
    id: SectionId;
    label: string;
    icon: typeof PenLine;
    done: boolean;
    classicHref?: string;
  }[] = [
    { id: "brief", label: "Brief", icon: PenLine, done: !!campaignId },
    { id: "images", label: "Images", icon: ImagesIcon, done: anchorPicked },
    { id: "video", label: "Video", icon: Play, done: !!videoUrl },
    { id: "music", label: "Music", icon: Music, done: false },
    { id: "caption", label: "Caption", icon: MessageSquare, done: false },
    {
      id: "compositor",
      label: "Compositor",
      icon: Layers,
      done: false,
      classicHref: campaignId
        ? `/${workspaceSlug}/compositor?campaign=${campaignId}`
        : `/${workspaceSlug}/compositor`,
    },
    {
      id: "logo",
      label: "Logo & brand",
      icon: Shapes,
      done: false,
      // Renders the full Logo & Brand studio inline when enabled; only falls
      // back to the classic page if the builder flag is off.
      ...(logoEnabled ? {} : { classicHref: `/${workspaceSlug}/logo` }),
    },
    { id: "publish", label: "Publish", icon: Send, done: false },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* ── main — Cockpit is the only layout now. Navigation lives inside the
             left input panel (true two-column workspace, no separate sidebar). ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <button
            type="button"
            onClick={() => setSection("projects")}
            title="Gallery — browse past projects and images"
            className="flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-muted"
          >
            <Logo size={18} withWordmark />
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Gallery
            </span>
          </button>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            placeholder="Name your project"
            aria-label="Project name"
            spellCheck={false}
            className="hidden max-w-[220px] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-medium text-foreground outline-none transition-colors hover:border-border focus:border-primary/50 focus:bg-background sm:block"
          />
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
            Studio
          </span>
          {ent && (
            <span
              className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider sm:inline-flex ${
                ent.isPro
                  ? "border border-amber-400/40 bg-gradient-to-r from-amber-400/25 to-amber-500/10 text-amber-400"
                  : "border border-border text-muted-foreground"
              }`}
              title={`${ent.label} plan`}
            >
              {ent.isPro && <Crown className="h-3 w-3" />}
              {ent.label}
            </span>
          )}
          {ent && ent.tier !== "agency" && (
            <button
              type="button"
              onClick={() => setShowUpgrade(true)}
              className="hidden items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-400 transition-colors hover:bg-amber-400/20 sm:inline-flex"
            >
              <Sparkles className="h-3 w-3" /> Upgrade
            </button>
          )}
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={share}
              title="Share this campaign"
              aria-label="Share this campaign"
              className="hidden h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground sm:flex"
            >
              <Share2 className="h-4 w-4" />
            </button>
            <CreditMeter />
            <button
              type="button"
              disabled={!publishReady}
              onClick={() => setSection("publish")}
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all ${
                publishReady
                  ? "animate-pulse bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                  : "cursor-not-allowed border border-border bg-card text-muted-foreground"
              }`}
              title={
                publishReady
                  ? "You've got enough to publish"
                  : "Publish unlocks once your ad takes shape"
              }
            >
              <span
                className={`h-2 w-2 rounded-full ${publishReady ? "bg-emerald-950" : "bg-muted-foreground/50"}`}
              />
              {publishReady ? "Ready — publish" : "Publish when ready"}
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {section === "projects" ? (
            <ProjectsCanvas
              workspaceSlug={workspaceSlug}
              onOpen={openProject}
              onNew={newProject}
              onReuseImage={reuseGalleryImage}
            />
          ) : section === "music" ? (
            <MusicCanvas
              genre={musicGenre}
              setGenre={setMusicGenre}
              model={musicModel}
              setModel={setMusicModel}
              lyrics={musicLyrics}
              setLyrics={setMusicLyrics}
              durationSec={videoDuration}
              hasVideo={!!videoUrl}
              generating={musicGenerating}
              stage={musicStage}
              url={musicUrl}
              onGenerate={generateMusic}
            />
          ) : section === "logo" && logoEnabled ? (
            // The full world-class Logo & Brand studio, delivered into the big
            // canvas — its own multi-phase flow (brief → concepts → refine →
            // vectorize → brand kit), same engine as the classic page.
            <div className="mx-auto h-full max-w-5xl">
              <LogoStudio />
            </div>
          ) : section === "compositor" && campaignId && workingImage ? (
            // Each compositing op (cutout/inpaint/relight/blend) becomes a real,
            // lockable layer in the SAME layer system the classic Compositor
            // uses — reused, not forked.
            <CompositorCanvas
              workspaceSlug={workspaceSlug}
              campaignId={campaignId}
              anchorUrl={workingImage}
              classicHref={`/${workspaceSlug}/compositor?campaign=${campaignId}`}
              initialOp={compositorInitialOp}
            />
          ) : (
            <CockpitCreate
              tools={tools}
              section={section}
              setSection={setSection}
              prompt={prompt}
              setPrompt={setPrompt}
              variety={variety}
              setVariety={setVariety}
              onGenerate={generate}
              onReset={() => {
                setPrompt("");
                setAssets([]);
                setAnchorId(null);
                setVideoUrl(null);
                setReferenceUrl(null);
                setCampaignName(randomCampaignName());
                setSection("brief");
              }}
              referenceUrl={referenceUrl}
              refUploading={refUploading}
              onUploadReference={uploadReference}
              onClearReference={() => setReferenceUrl(null)}
              generating={generating}
              stage={stage}
              assets={assets}
              anchorId={anchorId}
              onPick={pickAnchor}
              videoDuration={videoDuration}
              setVideoDuration={setVideoDuration}
              videoStyle={videoStyle}
              setVideoStyle={setVideoStyle}
              videoGenerating={videoGenerating}
              videoStage={videoStage}
              videoUrl={videoUrl}
              onGenerateVideo={generateVideo}
              workingImage={workingImage}
              allowedEffects={ent?.proEffects ?? []}
              onUpgrade={() => setShowUpgrade(true)}
              bgBusy={bgBusy}
              onRemoveBg={removeBg}
              onOpenCompositorOp={(op) => {
                setCompositorInitialOp(op);
                setSection("compositor");
              }}
            />
          )}
        </main>
      </div>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Pro effects"
        blurb="Unlock the AI-Photoshop effects — background removal, erase & replace, borders, blends and motion — plus 30s video and HD exports."
      />
    </div>
  );
}

/* ── Cockpit: a TRUE two-column workspace — no sidebar. Navigation lives at the
      top of the left input panel; the result sits persistently on the right. ── */
function CockpitCreate({
  tools,
  section,
  setSection,
  prompt,
  setPrompt,
  variety,
  setVariety,
  onGenerate,
  onReset,
  referenceUrl,
  refUploading,
  onUploadReference,
  onClearReference,
  generating,
  stage,
  assets,
  anchorId,
  onPick,
  videoDuration,
  setVideoDuration,
  videoStyle,
  setVideoStyle,
  videoGenerating,
  videoStage,
  videoUrl,
  onGenerateVideo,
  workingImage,
  allowedEffects,
  onUpgrade,
  bgBusy,
  onRemoveBg,
  onOpenCompositorOp,
}: {
  tools: {
    id: SectionId;
    label: string;
    icon: typeof PenLine;
    done: boolean;
    classicHref?: string;
  }[];
  section: SectionId;
  setSection: (s: SectionId) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  variety: boolean;
  setVariety: (v: boolean) => void;
  onGenerate: () => void;
  onReset: () => void;
  referenceUrl: string | null;
  refUploading: boolean;
  onUploadReference: (file: File) => void;
  onClearReference: () => void;
  generating: boolean;
  stage: string;
  assets: Anchor[];
  anchorId: string | null;
  onPick: (id: string) => void;
  videoDuration: 10 | 15 | 30;
  setVideoDuration: (d: 10 | 15 | 30) => void;
  videoStyle: (typeof VIDEO_STYLES)[number];
  setVideoStyle: (s: (typeof VIDEO_STYLES)[number]) => void;
  videoGenerating: boolean;
  videoStage: string;
  videoUrl: string | null;
  onGenerateVideo: () => void;
  workingImage: string | null;
  allowedEffects: string[];
  onUpgrade: () => void;
  bgBusy: boolean;
  onRemoveBg: () => void;
  onOpenCompositorOp: (op: "inpaint" | "blend") => void;
}) {
  const isCreate = section === "brief" || section === "images";
  const isVideo = section === "video";
  const hasResult = generating || assets.length > 0;
  const activeTool = tools.find((t) => t.id === section);
  const next: {
    label: string;
    icon: typeof Play;
    onSelect: () => void;
  }[] = [
    { label: "Make it move", icon: Play, onSelect: () => setSection("video") },
    {
      label: "Write a caption",
      icon: MessageSquare,
      onSelect: () => setSection("caption"),
    },
    {
      label: "Open compositor",
      icon: Layers,
      onSelect: () => setSection("compositor"),
    },
  ];

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,320px)_1fr]">
      {/* ── LEFT: navigation + input, one panel ─────────────── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-3">
        <nav className="flex flex-col gap-0.5">
          {tools.map((t) => {
            const Icon = t.icon;
            const active = section === t.id;
            const cls = `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
              active
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-background hover:text-foreground"
            }`;
            const inner = (
              <>
                <Icon className="h-4 w-4 shrink-0 opacity-90" />
                <span>{t.label}</span>
                <span
                  className={`ml-auto h-1.5 w-1.5 rounded-full ${
                    t.done
                      ? "bg-emerald-500"
                      : active
                        ? "bg-primary"
                        : "bg-border"
                  }`}
                />
              </>
            );
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setSection(t.id)}
                className={cls}
              >
                {inner}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-border" />

        {isCreate ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            {/* Room above the prompt for effects/other controls as they land
                here — the prompt + Generate stay pinned to the bottom. */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setVariety(!variety)}
                disabled={!!referenceUrl}
                title={
                  referenceUrl
                    ? "Variety is off while a reference photo drives generation"
                    : undefined
                }
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors disabled:opacity-40 ${
                  variety && !referenceUrl
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="h-3 w-3" /> Variety pack
              </button>
              <span className="text-[11px] text-muted-foreground/70">
                {referenceUrl
                  ? "12 credits · features your photo"
                  : variety
                    ? "20 credits"
                    : "12 credits"}
              </span>
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  Prompt
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                      onGenerate();
                  }}
                  rows={4}
                  placeholder="A coffee roastery overlooking the bay at golden hour, steam rising off fresh beans…"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary/50"
                />
              </div>

              <button
                type="button"
                onClick={onGenerate}
                disabled={prompt.trim().length < 3 || generating}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate
                    <span className="ml-1 rounded border border-white/25 px-1 text-[10px]">
                      ⌘↵
                    </span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onReset}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Reset
              </button>
            </div>
          </div>
        ) : isVideo ? (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {anchorId && (
              <>
                <EffectsPanel
                  allowedEffects={allowedEffects}
                  onUpgrade={onUpgrade}
                  bgBusy={bgBusy}
                  onRemoveBg={onRemoveBg}
                  onOpenCompositorOp={onOpenCompositorOp}
                />
                <div className="border-t border-border" />
              </>
            )}
            <VideoInputs
              hasAnchor={!!anchorId}
              duration={videoDuration}
              setDuration={setVideoDuration}
              style={videoStyle}
              setStyle={setVideoStyle}
              generating={videoGenerating}
              onGenerate={onGenerateVideo}
            />
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
            <p className="text-sm text-muted-foreground">
              {activeTool?.classicHref
                ? `${activeTool?.label} opens in the classic flow for now — same engine.`
                : anchorId
                  ? `${activeTool?.label} is coming to Studio soon.`
                  : "Generate your images first — this builds on the look you pick."}
            </p>
            {activeTool?.classicHref && (
              <Link
                href={activeTool.classicHref}
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Open {activeTool.label} <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        )}
      </div>

      {/* ── RIGHT: the persistent result ────────────────────── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Result</h2>
          {isCreate && assets.length > 0 && !generating && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
              Completed
            </span>
          )}
          {isCreate && generating && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Running
            </span>
          )}
          {isVideo && videoGenerating && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
              Running
            </span>
          )}
          {isVideo && videoUrl && !videoGenerating && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
              Completed
            </span>
          )}
        </div>

        {isVideo ? (
          <div className="flex flex-1 items-center justify-center">
            <VideoResult
              generating={videoGenerating}
              stage={videoStage}
              url={videoUrl}
              stillUrl={workingImage}
            />
          </div>
        ) : !isCreate ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ImagesIcon className="h-7 w-7 opacity-30" />
            <p className="text-sm">{activeTool?.label} preview appears here.</p>
          </div>
        ) : !hasResult ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            {isCreate && (
              <div className="w-full max-w-xs">
                <ReferencePhotoField
                  url={referenceUrl}
                  uploading={refUploading}
                  onUpload={onUploadReference}
                  onClear={onClearReference}
                />
              </div>
            )}
            {!referenceUrl && (
              <div className="grid h-16 w-16 place-items-center rounded-full bg-primary/10">
                <Sparkles className="h-7 w-7 text-primary/70" />
              </div>
            )}
            <p className="max-w-[16rem] text-sm text-muted-foreground">
              {prompt.trim().length < 3
                ? "Write a brief on the left, then hit Generate."
                : "Ready when you are — hit Generate on the left and your six options land right here."}
            </p>
          </div>
        ) : generating && assets.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Spinner size={52} />
            <p className="text-sm text-muted-foreground">{stage}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {assets.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onPick(a.id)}
                  className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition-all ${
                    anchorId === a.id
                      ? "border-primary shadow-[0_0_0_3px] shadow-primary/25"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={a.label || "Option"}
                    className="h-full w-full object-cover"
                  />
                  {a.label && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                      {a.label}
                    </span>
                  )}
                  {anchorId === a.id && (
                    <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
              ))}
            </div>

            {anchorId && (
              <div className="mt-auto rounded-xl border border-border bg-background p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  What would you like to do next?
                </p>
                <div className="flex flex-wrap gap-2">
                  {next.map((n) => {
                    const Icon = n.icon;
                    const cls =
                      "flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:text-primary";
                    return (
                      <button
                        key={n.label}
                        type="button"
                        onClick={n.onSelect}
                        className={cls}
                      >
                        <Icon className="h-3.5 w-3.5" /> {n.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Video: shared controls + result, used in both Simple and Cockpit ──────── */
function VideoInputs({
  hasAnchor,
  duration,
  setDuration,
  style,
  setStyle,
  generating,
  onGenerate,
}: {
  hasAnchor: boolean;
  duration: 10 | 15 | 30;
  setDuration: (d: 10 | 15 | 30) => void;
  style: (typeof VIDEO_STYLES)[number];
  setStyle: (s: (typeof VIDEO_STYLES)[number]) => void;
  generating: boolean;
  onGenerate: () => void;
}) {
  if (!hasAnchor) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center text-sm text-muted-foreground">
        <Play className="h-6 w-6 opacity-40" />
        <p>Pick an image first — the video builds from the look you choose.</p>
      </div>
    );
  }
  const durationOptions: StudioOption<string>[] = VIDEO_LENGTHS.map((d) => ({
    value: String(d),
    label: `${d} seconds`,
    badge: d === 30 ? "Pro" : undefined,
    blurb:
      d === 10
        ? "Short, punchy social clip"
        : d === 15
          ? "Room for a beat and a payoff"
          : "A longer film — building story arc",
  }));
  const styleOptions: StudioOption<string>[] = VIDEO_STYLES.map((s) => ({
    value: s,
    label: s,
  }));
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Length
        </label>
        <StudioSelect
          value={String(duration)}
          onChange={(v) => setDuration(Number(v) as 10 | 15 | 30)}
          options={durationOptions}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Style
        </label>
        <StudioSelect
          value={style}
          onChange={(v) => setStyle(v as (typeof VIDEO_STYLES)[number])}
          options={styleOptions}
        />
      </div>
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Rendering
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" /> Generate video
          </>
        )}
      </button>
      <p className="text-center text-[11px] text-muted-foreground/70">
        {duration === 30 ? "30s · a longer film · Pro" : `${duration}s clip`}
      </p>
    </div>
  );
}

function VideoResult({
  generating,
  stage,
  url,
  stillUrl,
}: {
  generating: boolean;
  stage: string;
  url: string | null;
  /** The chosen still, shown big until a video is generated — proof it carried. */
  stillUrl?: string | null;
}) {
  if (url) {
    return (
      <video
        src={url}
        controls
        playsInline
        className="max-h-full w-full rounded-xl border border-border bg-black"
      />
    );
  }
  if (generating) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <Spinner size={52} />
        <p className="text-sm text-muted-foreground">{stage}</p>
      </div>
    );
  }
  if (stillUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={stillUrl}
        alt="Your chosen image"
        className="max-h-full max-w-full rounded-xl border border-border object-contain"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#8882 25%,transparent 25%,transparent 75%,#8882 75%),linear-gradient(45deg,#8882 25%,transparent 25%,transparent 75%,#8882 75%)",
          backgroundSize: "18px 18px",
          backgroundPosition: "0 0,9px 9px",
        }}
      />
    );
  }
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <Play className="h-7 w-7 opacity-40" />
      <p className="text-sm">Your video will appear here.</p>
    </div>
  );
}

/** Pro effects — the "AI Photoshop" menu on the enhance surface. Built effects
 *  are live for Pro; the rest tease as "Soon". Non-Pro sees them all locked. */
const EFFECTS = [
  { key: "removebg", label: "Remove background", ready: true },
  { key: "inpaint", label: "Erase & replace", ready: true },
  { key: "blend", label: "Fade / blend", ready: true },
  { key: "borders", label: "Borders & frames", ready: false },
  { key: "motion", label: "Crossfade + Ken Burns", ready: false },
] as const;

// inpaint/blend are built, but as full Compositor ops (mask/prompt/second
// image) — not a single instant action like removebg, so clicking them
// jumps into the Compositor with that op preselected instead of running here.
const COMPOSITOR_EFFECT_KEYS = new Set(["inpaint", "blend"]);

function EffectsPanel({
  allowedEffects,
  bgBusy,
  onRemoveBg,
  onUpgrade,
  onOpenCompositorOp,
}: {
  /** Effect keys the current tier unlocks (from entitlements.proEffects). */
  allowedEffects: string[];
  bgBusy: boolean;
  onRemoveBg: () => void;
  onUpgrade: () => void;
  onOpenCompositorOp: (op: "inpaint" | "blend") => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" /> Pro effects
      </div>
      <div className="flex flex-wrap gap-2">
        {EFFECTS.map((e) => {
          const allowed = allowedEffects.includes(e.key);
          const live = allowed && e.ready; // your tier has it AND it's built
          const busy = bgBusy && e.key === "removebg";
          // Not on your tier → upgrade nudge. On your tier but not built → Soon.
          const onClick = live
            ? e.key === "removebg"
              ? onRemoveBg
              : COMPOSITOR_EFFECT_KEYS.has(e.key)
                ? () => onOpenCompositorOp(e.key as "inpaint" | "blend")
                : undefined
            : !allowed
              ? onUpgrade
              : undefined;
          return (
            <button
              key={e.key}
              type="button"
              disabled={busy || (allowed && !e.ready)}
              onClick={onClick}
              title={
                allowed
                  ? e.ready
                    ? COMPOSITOR_EFFECT_KEYS.has(e.key)
                      ? "Opens in the Compositor"
                      : undefined
                    : "Coming soon to Studio"
                  : "Not on your plan — upgrade to unlock"
              }
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                live
                  ? "border-border text-foreground hover:border-primary/50 hover:text-primary"
                  : !allowed
                    ? "border-amber-400/40 text-muted-foreground hover:border-amber-400/70 hover:text-amber-400"
                    : "cursor-not-allowed border-dashed border-border text-muted-foreground/70"
              }`}
            >
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : live ? (
                <Scissors className="h-3 w-3" />
              ) : (
                <Lock className="h-3 w-3" />
              )}
              {e.label}
              {!allowed ? (
                <span className="text-[9px] font-semibold uppercase text-amber-400">
                  Upgrade
                </span>
              ) : !e.ready ? (
                <span className="text-[9px] font-semibold uppercase text-muted-foreground/60">
                  Soon
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Music: a track sized to the chosen video length ──────────────────────── */
function MusicCanvas({
  genre,
  setGenre,
  model,
  setModel,
  lyrics,
  setLyrics,
  durationSec,
  hasVideo,
  generating,
  stage,
  url,
  onGenerate,
}: {
  genre: string;
  setGenre: (g: string) => void;
  model: string;
  setModel: (m: string) => void;
  lyrics: string;
  setLyrics: (l: string) => void;
  durationSec: 10 | 15 | 30;
  hasVideo: boolean;
  generating: boolean;
  stage: string;
  url: string | null;
  onGenerate: () => void;
}) {
  const genreOptions: StudioOption<string>[] = MUSIC_GENRES.map((g) => ({
    value: g,
    label: g,
  }));
  const modelOptions: StudioOption<string>[] = MUSIC_MODELS.map((m) => ({
    value: m.id,
    label: m.label,
    blurb: m.blurb,
  }));
  const isVocals = MUSIC_MODELS.find((m) => m.id === model)?.vocals;
  const isNatural = model === "lyria2";
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Add a soundtrack</h2>
        <p className="text-sm text-muted-foreground">
          A track composed to match — sized to your{" "}
          {hasVideo ? `${durationSec}s video` : "chosen video length"}.
        </p>
      </div>

      {/* Result / preview */}
      <div className="flex min-h-[30vh] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
        {generating ? (
          <>
            <Spinner size={48} />
            <p className="text-sm text-muted-foreground">
              {stage || "Composing your track…"}
            </p>
          </>
        ) : url ? (
          <div className="flex w-full max-w-md flex-col items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10">
              <Music2 className="h-7 w-7 text-primary" />
            </div>
            <audio controls src={url} className="w-full">
              <track kind="captions" />
            </audio>
            <a
              href={url}
              download
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ArrowRight className="h-3.5 w-3.5" /> Download track
            </a>
          </div>
        ) : (
          <>
            <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10">
              <Music2 className="h-7 w-7 text-primary/70" />
            </div>
            <p className="max-w-xs text-sm text-muted-foreground">
              Pick a style and generate — your track appears here, ready to drop
              onto the video.
            </p>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Style
            </label>
            <StudioSelect
              value={genre}
              onChange={setGenre}
              options={genreOptions}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Engine
            </label>
            <StudioSelect
              value={model}
              onChange={setModel}
              options={modelOptions}
            />
          </div>
        </div>

        {isVocals && (
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Lyrics{" "}
              <span className="text-muted-foreground/60">
                · optional — left blank, we&apos;ll write a jingle
              </span>
            </label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={3}
              placeholder="A short, catchy jingle about your brand…"
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus:border-primary/50"
            />
          </div>
        )}

        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
        >
          {generating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Composing
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" /> Generate music
            </>
          )}
        </button>
        <p className="text-center text-[11px] text-muted-foreground/70">
          {isNatural
            ? "Natural renders a fixed ~30s bed"
            : `Matched to your ${durationSec}s video`}{" "}
          · 8 credits
        </p>
      </div>
    </div>
  );
}

/* ── Projects: the front door — browse past campaigns in the canvas ───────── */
function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const STATUS_TONE: Record<string, string> = {
  ready: "text-emerald-500",
  generating: "text-primary",
  failed: "text-red-400",
};

function ProjectsCanvas({
  workspaceSlug,
  onOpen,
  onNew,
  onReuseImage,
}: {
  workspaceSlug: string;
  onOpen: (id: string, goto?: SectionId) => void;
  onNew: () => void;
  onReuseImage: (assetId: string) => void;
}) {
  const [tab, setTab] = useState<"projects" | "images">("projects");
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "row">("grid");
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [reusing, setReusing] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("tf-studio-projects-view");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount init
    if (saved === "row" || saved === "grid") setView(saved);
  }, []);
  const chooseView = (v: "grid" | "row") => {
    setView(v);
    try {
      localStorage.setItem("tf-studio-projects-view", v);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let active = true;
    api("/api/campaigns", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ProjectSummary[]) => {
        if (active) setList(Array.isArray(d) ? d : []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceSlug]);

  // Every image ever generated, across all past campaigns — reusable as the
  // anchor of a brand-new project, free (no regeneration), like the old site.
  useEffect(() => {
    let active = true;
    api("/api/gallery", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { assets?: GalleryImage[] } | null) => {
        if (active) setImages(d?.assets ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setImagesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceSlug]);

  const handleReuse = async (assetId: string) => {
    setReusing(assetId);
    try {
      await onReuseImage(assetId);
    } finally {
      setReusing(null);
    }
  };

  const download = async (a: GalleryImage) => {
    try {
      const res = await fetch(a.url);
      const href = URL.createObjectURL(await res.blob());
      const el = document.createElement("a");
      el.href = href;
      el.download = `tenfold-${a.id}.jpg`;
      el.click();
      URL.revokeObjectURL(href);
    } catch {
      window.open(a.url, "_blank", "noopener");
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Gallery</h1>
          <p className="text-sm text-muted-foreground">
            Pick up a past project, publish one that&apos;s ready, or start
            something new from an image you already made.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "projects" && (
            <div className="flex items-center rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => chooseView("grid")}
                title="Grid"
                aria-label="Grid view"
                className={`rounded-md p-1.5 ${view === "grid" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => chooseView("row")}
                title="List"
                aria-label="List view"
                className={`rounded-md p-1.5 ${view === "row" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Sparkles className="h-4 w-4" /> New campaign
          </button>
        </div>
      </div>

      {/* Tabs — Projects (resume/publish) vs Images (start new from an old one) */}
      <div className="flex items-center gap-1 border-b border-border">
        {(
          [
            { id: "projects", label: "Projects" },
            { id: "images", label: "Images" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "projects" ? (
        loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size={40} />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <ImagesIcon className="h-8 w-8 opacity-40" />
            <p className="text-sm">
              No projects yet — let’s make your first ad.
            </p>
            <button
              type="button"
              onClick={onNew}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Sparkles className="h-4 w-4" /> New campaign
            </button>
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((p) => (
              <div
                key={p.id}
                className="group relative flex flex-col overflow-hidden rounded-xl border border-border transition-colors hover:border-primary/50"
              >
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="flex aspect-square items-center justify-center bg-background text-left"
                >
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.thumbnailUrl}
                      alt={p.name ?? "Project"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImagesIcon className="h-6 w-6 text-muted-foreground/40" />
                  )}
                </button>
                {p.anchor_asset_id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(p.id, "publish");
                    }}
                    title="Publish this project"
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-primary group-hover:opacity-100"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpen(p.id)}
                  className="border-t border-border px-3 py-2 text-left"
                >
                  <p className="truncate text-sm font-medium">
                    {p.name || "Untitled"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span
                      className={
                        STATUS_TONE[p.status] ?? "text-muted-foreground"
                      }
                    >
                      {p.status}
                    </span>{" "}
                    · {timeAgo(p.created_at)}
                  </p>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {list.map((p) => (
              <div
                key={p.id}
                onClick={() => onOpen(p.id)}
                className="group flex cursor-pointer items-center gap-3 rounded-lg border border-border px-2.5 py-2 transition-colors hover:border-primary/50"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
                  {p.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.thumbnailUrl}
                      alt={p.name ?? "Project"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImagesIcon className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </div>
                <span className="flex-1 truncate text-sm font-medium">
                  {p.name || "Untitled"}
                </span>
                <span
                  className={`text-xs ${STATUS_TONE[p.status] ?? "text-muted-foreground"}`}
                >
                  {p.status}
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                  {timeAgo(p.created_at)}
                </span>
                {p.anchor_asset_id && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(p.id, "publish");
                    }}
                    title="Publish this project"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : imagesLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner size={40} />
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
          <ImagesIcon className="h-8 w-8 opacity-40" />
          <p className="text-sm">
            No images yet — generate a project and they&apos;ll be saved here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((a) => (
            <div
              key={a.id}
              className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-card"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.metadata?.direction ?? "Generated image"}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {a.metadata?.direction && (
                <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm">
                  {a.metadata.direction}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => handleReuse(a.id)}
                  disabled={reusing === a.id}
                  title="Start a new project with this image as the anchor — free"
                  className="flex h-7 items-center gap-1 rounded-full bg-primary px-2 text-[10px] font-semibold text-white disabled:opacity-60"
                >
                  {reusing === a.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Anchor className="h-3 w-3" />
                  )}
                  Use as anchor
                </button>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => window.open(a.url, "_blank", "noopener")}
                    title="View full size"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => download(a)}
                    title="Download"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
