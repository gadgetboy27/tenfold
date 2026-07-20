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
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import CreditMeter from "@/components/shared/CreditMeter";
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

export function Studio({ workspaceSlug }: { workspaceSlug: string }) {
  const setWorkspaceSlug = useAppStore((s) => s.setWorkspaceSlug);
  const setCreditBalance = useAppStore((s) => s.setCreditBalance);

  const [section, setSection] = useState<SectionId>("brief");
  const [prompt, setPrompt] = useState("");
  const [variety, setVariety] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState("");
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [assets, setAssets] = useState<Anchor[]>([]);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const pollRef = useRef(false);

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
        body: JSON.stringify({ prompt: prompt.trim(), variety }),
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

  const anchorPicked = !!anchorId;
  const publishReady = anchorPicked; // grows as more of the flow lands

  const tools: {
    id: SectionId;
    label: string;
    icon: typeof PenLine;
    done: boolean;
    href?: string;
  }[] = [
    { id: "brief", label: "Brief", icon: PenLine, done: !!campaignId },
    { id: "images", label: "Images", icon: ImagesIcon, done: anchorPicked },
    {
      id: "video",
      label: "Video",
      icon: Play,
      done: false,
      href: `/${workspaceSlug}`,
    },
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
      {/* ── tool rail ─────────────────────────────────────────── */}
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

      {/* ── main ──────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2 sm:hidden">
            <Logo size={18} withWordmark />
          </div>
          <span className="hidden text-sm font-medium sm:inline">
            {campaignId ? "Your campaign" : "New campaign"}
          </span>
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
            Studio
          </span>
          <div className="ml-auto flex items-center gap-3">
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

        <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
          {section === "brief" && (
            <BriefCanvas
              prompt={prompt}
              setPrompt={setPrompt}
              variety={variety}
              setVariety={setVariety}
              onGenerate={generate}
            />
          )}

          {section === "images" && (
            <ImagesCanvas
              generating={generating}
              stage={stage}
              assets={assets}
              anchorId={anchorId}
              onPick={pickAnchor}
              onRegenerate={() => setSection("brief")}
            />
          )}

          {section !== "brief" && section !== "images" && (
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
