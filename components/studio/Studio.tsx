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
  Upload,
  Check,
  Loader2,
  ArrowRight,
  Share2,
  Crown,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Spinner } from "@/components/brand/Spinner";
import CreditMeter from "@/components/shared/CreditMeter";
import { useEntitlements } from "@/lib/billing/useEntitlements";
import { randomCampaignName } from "@/lib/util/campaign-name";
import { useAppStore } from "@/store/useAppStore";
import { api } from "@/lib/api";

/**
 * Studio — the progressive-canvas shell (hidden preview at /[workspace]/studio).
 * The frame (tool rail + a lingering Publish button) stays put; only the canvas
 * changes. It drives the SAME endpoints as the classic flow — this is a new
 * surface over existing functionality, not a new engine. First slice wires
 * Brief → Images end to end; the rest link out to the classic pages for now.
 */

type SectionId =
  | "brief"
  | "images"
  | "video"
  | "music"
  | "caption"
  | "compositor"
  | "logo"
  | "publish";

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

export function Studio({ workspaceSlug }: { workspaceSlug: string }) {
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

  const [section, setSection] = useState<SectionId>("brief");
  // Pre-fill a friendly random project name; the user can keep it, clear it, or
  // rename it. Persisted to the campaign once one exists.
  const [campaignName, setCampaignName] = useState(randomCampaignName);
  const [prompt, setPrompt] = useState("");
  const [variety, setVariety] = useState(true);
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

  // Two layouts, same engine: "simple" (the calm centered canvas) and "cockpit"
  // (fal-style input-left / result-right workspace). Simple stays the default so
  // it's never lost; the choice persists so a flick back sticks.
  const [layout, setLayout] = useState<"simple" | "cockpit">("simple");
  useEffect(() => {
    const saved = localStorage.getItem("tf-studio-layout");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time mount init from a persisted preference
    if (saved === "cockpit" || saved === "simple") setLayout(saved);
  }, []);
  const chooseLayout = (l: "simple" | "cockpit") => {
    setLayout(l);
    try {
      localStorage.setItem("tf-studio-layout", l);
    } catch {
      /* private mode — the choice just won't persist */
    }
  };

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

  const generate = async () => {
    if (prompt.trim().length < 3 || generating) return;
    setGenerating(true);
    setStage(STAGE_LABELS[0][1]);
    setAssets([]);
    setAnchorId(null);
    setSection("images");
    try {
      const res = await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({
          prompt: prompt.trim(),
          variety,
          name: campaignName.trim() || randomCampaignName(),
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
            imageUrl: anchor.url,
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

  const anchorPicked = !!anchorId;
  const publishReady = anchorPicked || !!videoUrl; // grows as more of the flow lands

  const tools: {
    id: SectionId;
    label: string;
    icon: typeof PenLine;
    done: boolean;
    href?: string;
  }[] = [
    { id: "brief", label: "Brief", icon: PenLine, done: !!campaignId },
    { id: "images", label: "Images", icon: ImagesIcon, done: anchorPicked },
    { id: "video", label: "Video", icon: Play, done: !!videoUrl },
    {
      id: "music",
      label: "Music",
      icon: Music,
      done: false,
      href: `/${workspaceSlug}`,
    },
    {
      id: "caption",
      label: "Caption",
      icon: MessageSquare,
      done: false,
      href: `/${workspaceSlug}`,
    },
    {
      id: "compositor",
      label: "Compositor",
      icon: Layers,
      done: false,
      href: campaignId
        ? `/${workspaceSlug}/compositor?campaign=${campaignId}`
        : `/${workspaceSlug}/compositor`,
    },
    {
      id: "logo",
      label: "Logo & brand",
      icon: Shapes,
      done: false,
      href: `/${workspaceSlug}/logo`,
    },
    { id: "publish", label: "Publish", icon: Send, done: false },
  ];

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* ── tool rail — Simple layout only. Cockpit puts navigation inside the
             left input panel (true two-column workspace, no separate sidebar). ── */}
      {layout === "simple" && (
        <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-card p-3 sm:flex">
          <Link
            href={`/${workspaceSlug}`}
            className="mb-3 flex items-center px-2"
          >
            <Logo size={20} withWordmark />
          </Link>
          <span className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Build
          </span>
          {tools.slice(0, 5).map((t) => (
            <ToolButton
              key={t.id}
              tool={t}
              active={section === t.id}
              onClick={() => (t.href ? undefined : setSection(t.id))}
            />
          ))}
          <span className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Finish
          </span>
          {tools.slice(5).map((t) => (
            <ToolButton
              key={t.id}
              tool={t}
              active={section === t.id}
              onClick={() => (t.href ? undefined : setSection(t.id))}
            />
          ))}
          <div className="flex-1" />
          <div className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-muted-foreground">
            Studio preview — same engine, new canvas.
          </div>
        </aside>
      )}

      {/* ── main ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <Link
            href={`/${workspaceSlug}`}
            className={`items-center ${layout === "cockpit" ? "flex" : "flex sm:hidden"}`}
          >
            <Logo size={18} withWordmark />
          </Link>
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
            <div className="hidden items-center rounded-full border border-border p-0.5 text-xs font-medium sm:flex">
              {(["simple", "cockpit"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => chooseLayout(l)}
                  className={`rounded-full px-2.5 py-1 capitalize transition-colors ${
                    layout === l
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
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
          {layout === "cockpit" ? (
            <CockpitCreate
              workspaceSlug={workspaceSlug}
              campaignId={campaignId}
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
                setCampaignName(randomCampaignName());
                setSection("brief");
              }}
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
            />
          ) : section === "brief" ? (
            <BriefCanvas
              prompt={prompt}
              setPrompt={setPrompt}
              variety={variety}
              setVariety={setVariety}
              onGenerate={generate}
            />
          ) : section === "images" ? (
            <ImagesCanvas
              generating={generating}
              stage={stage}
              assets={assets}
              anchorId={anchorId}
              onPick={pickAnchor}
              onRegenerate={() => setSection("brief")}
            />
          ) : section === "video" ? (
            <VideoCanvas
              hasAnchor={anchorPicked}
              duration={videoDuration}
              setDuration={setVideoDuration}
              style={videoStyle}
              setStyle={setVideoStyle}
              generating={videoGenerating}
              stage={videoStage}
              url={videoUrl}
              onGenerate={generateVideo}
            />
          ) : (
            <PlaceholderCanvas
              tool={tools.find((t) => t.id === section)!}
              anchorReady={anchorPicked}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function ToolButton({
  tool,
  active,
  onClick,
}: {
  tool: {
    id: string;
    label: string;
    icon: typeof PenLine;
    done: boolean;
    href?: string;
  };
  active: boolean;
  onClick: () => void;
}) {
  const Icon = tool.icon;
  const inner = (
    <>
      <Icon className="h-4 w-4 shrink-0 opacity-90" />
      <span>{tool.label}</span>
      <span
        className={`ml-auto h-1.5 w-1.5 rounded-full ${
          tool.done
            ? "bg-emerald-500"
            : active
              ? "bg-primary shadow-[0_0_0_3px] shadow-primary/25"
              : "bg-border"
        }`}
      />
    </>
  );
  const cls = `flex items-center gap-3 rounded-lg border px-2.5 py-2 text-sm font-medium transition-colors ${
    active
      ? "border-primary/40 bg-primary/15 text-foreground"
      : "border-transparent text-muted-foreground hover:bg-background hover:text-foreground"
  }`;
  return tool.href ? (
    <Link href={tool.href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

function BriefCanvas({
  prompt,
  setPrompt,
  variety,
  setVariety,
  onGenerate,
}: {
  prompt: string;
  setPrompt: (v: string) => void;
  variety: boolean;
  setVariety: (v: boolean) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col items-center justify-center gap-5 text-center">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          What are we advertising?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe it — the studio generates your options, you refine from
          there.
        </p>
      </div>
      <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-xl">
        <textarea
          autoFocus
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onGenerate();
          }}
          rows={3}
          placeholder="A coffee roastery overlooking the bay at golden hour, steam rising off fresh beans…"
          className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setVariety(!variety)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
              variety
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="h-3 w-3" /> Variety pack
          </button>
          <span
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
            title="Bring your own product photo (coming to Studio)"
          >
            <Upload className="h-3 w-3" /> Upload a photo
          </span>
          <button
            type="button"
            onClick={onGenerate}
            disabled={prompt.trim().length < 3}
            className="ml-auto flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
          >
            <Sparkles className="h-4 w-4" /> Generate
          </button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground/70">
        {variety
          ? "6 options across your top 3 models · 20 credits"
          : "6 options · 12 credits"}{" "}
        · ⌘↵ to generate
      </p>
    </div>
  );
}

function ImagesCanvas({
  generating,
  stage,
  assets,
  anchorId,
  onPick,
  onRegenerate,
}: {
  generating: boolean;
  stage: string;
  assets: Anchor[];
  anchorId: string | null;
  onPick: (id: string) => void;
  onRegenerate: () => void;
}) {
  if (generating && assets.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" /> {stage}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Pick your look</h2>
          <p className="text-sm text-muted-foreground">
            Tap the one that feels right — everything builds from it.
          </p>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          New brief
        </button>
      </div>
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
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">Anchor set.</span>
          <span className="flex items-center gap-1 font-medium text-primary">
            Next: bring it to life <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      )}
    </div>
  );
}

function PlaceholderCanvas({
  tool,
  anchorReady,
}: {
  tool: { label: string; href?: string };
  anchorReady: boolean;
}) {
  return (
    <div className="mx-auto flex h-full max-w-md flex-col items-center justify-center gap-3 text-center">
      <h2 className="text-lg font-semibold">{tool.label}</h2>
      <p className="text-sm text-muted-foreground">
        {anchorReady
          ? "This step isn't wired into Studio yet — for now it opens in the classic flow, using the same engine."
          : "Generate your images first — then this step builds on the look you pick."}
      </p>
      {tool.href && (
        <Link
          href={tool.href}
          className="mt-1 flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Open {tool.label} <ArrowRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

/* ── Cockpit: a TRUE two-column workspace — no sidebar. Navigation lives at the
      top of the left input panel; the result sits persistently on the right. ── */
function CockpitCreate({
  workspaceSlug,
  campaignId,
  tools,
  section,
  setSection,
  prompt,
  setPrompt,
  variety,
  setVariety,
  onGenerate,
  onReset,
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
}: {
  workspaceSlug: string;
  campaignId: string | null;
  tools: {
    id: SectionId;
    label: string;
    icon: typeof PenLine;
    done: boolean;
    href?: string;
  }[];
  section: SectionId;
  setSection: (s: SectionId) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  variety: boolean;
  setVariety: (v: boolean) => void;
  onGenerate: () => void;
  onReset: () => void;
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
}) {
  const isCreate = section === "brief" || section === "images";
  const isVideo = section === "video";
  const hasResult = generating || assets.length > 0;
  const activeTool = tools.find((t) => t.id === section);
  const next: {
    label: string;
    icon: typeof Play;
    href?: string;
    onSelect?: () => void;
  }[] = [
    { label: "Make it move", icon: Play, onSelect: () => setSection("video") },
    {
      label: "Write a caption",
      icon: MessageSquare,
      href: `/${workspaceSlug}`,
    },
    {
      label: "Open compositor",
      icon: Layers,
      href: campaignId
        ? `/${workspaceSlug}/compositor?campaign=${campaignId}`
        : `/${workspaceSlug}/compositor`,
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
            return t.href ? (
              <Link key={t.id} href={t.href} className={cls}>
                {inner}
              </Link>
            ) : (
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

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Reference photo{" "}
                <span className="text-muted-foreground/60">· optional</span>
              </label>
              <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-background/50 px-3 py-4 text-center">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Drop a product photo, or paste a URL
                </span>
                <span className="text-[10px] text-muted-foreground/60">
                  Bring-your-own image — coming to Studio
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setVariety(!variety)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  variety
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="h-3 w-3" /> Variety pack
              </button>
              <span className="text-[11px] text-muted-foreground/70">
                {variety ? "20 credits" : "12 credits"}
              </span>
            </div>

            <div className="mt-auto flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onReset}
                className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={onGenerate}
                disabled={prompt.trim().length < 3 || generating}
                className="ml-auto flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
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
            </div>
          </div>
        ) : isVideo ? (
          <VideoInputs
            hasAnchor={!!anchorId}
            duration={videoDuration}
            setDuration={setVideoDuration}
            style={videoStyle}
            setStyle={setVideoStyle}
            generating={videoGenerating}
            onGenerate={onGenerateVideo}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
            <p className="text-sm text-muted-foreground">
              {anchorId
                ? `${activeTool?.label} runs in the classic flow for now — same engine.`
                : "Generate your images first — this builds on the look you pick."}
            </p>
            {activeTool?.href && (
              <Link
                href={activeTool.href}
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
            />
          </div>
        ) : !isCreate ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ImagesIcon className="h-7 w-7 opacity-30" />
            <p className="text-sm">{activeTool?.label} preview appears here.</p>
          </div>
        ) : !hasResult ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <button
              type="button"
              onClick={onGenerate}
              disabled={prompt.trim().length < 3}
              className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              <Sparkles className="h-4 w-4" /> Generate
              <span className="ml-1 rounded border border-white/25 px-1 text-[10px]">
                ⌘↵
              </span>
            </button>
            <p className="text-xs text-muted-foreground/70">
              {prompt.trim().length < 3
                ? "Write a brief on the left to begin."
                : "Your six options will appear right here."}
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
                    return n.onSelect ? (
                      <button
                        key={n.label}
                        type="button"
                        onClick={n.onSelect}
                        className={cls}
                      >
                        <Icon className="h-3.5 w-3.5" /> {n.label}
                      </button>
                    ) : (
                      <Link key={n.label} href={n.href!} className={cls}>
                        <Icon className="h-3.5 w-3.5" /> {n.label}
                      </Link>
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
  const chip = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs transition-colors ${
      active
        ? "border-primary/40 bg-primary/15 text-primary"
        : "border-border text-muted-foreground hover:text-foreground"
    }`;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Length
        </label>
        <div className="flex gap-2">
          {VIDEO_LENGTHS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDuration(d)}
              className={chip(duration === d)}
            >
              {d}s
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Style
        </label>
        <div className="flex flex-wrap gap-2">
          {VIDEO_STYLES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStyle(s)}
              className={chip(style === s)}
            >
              {s}
            </button>
          ))}
        </div>
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
}: {
  generating: boolean;
  stage: string;
  url: string | null;
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
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <Play className="h-7 w-7 opacity-40" />
      <p className="text-sm">Your video will appear here.</p>
    </div>
  );
}

function VideoCanvas(props: {
  hasAnchor: boolean;
  duration: 10 | 15 | 30;
  setDuration: (d: 10 | 15 | 30) => void;
  style: (typeof VIDEO_STYLES)[number];
  setStyle: (s: (typeof VIDEO_STYLES)[number]) => void;
  generating: boolean;
  stage: string;
  url: string | null;
  onGenerate: () => void;
}) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Bring it to life</h2>
        <p className="text-sm text-muted-foreground">
          Same scene, now moving — pick a length and a style.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <VideoInputs
          hasAnchor={props.hasAnchor}
          duration={props.duration}
          setDuration={props.setDuration}
          style={props.style}
          setStyle={props.setStyle}
          generating={props.generating}
          onGenerate={props.onGenerate}
        />
      </div>
      <div className="flex min-h-[40vh] flex-1 items-center justify-center rounded-xl border border-border bg-card p-4">
        <VideoResult
          generating={props.generating}
          stage={props.stage}
          url={props.url}
        />
      </div>
    </div>
  );
}
