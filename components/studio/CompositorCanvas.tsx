"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Scissors,
  Wand2,
  Sun,
  Layers as LayersIcon,
  Lock,
  LockOpen,
  Loader2,
  Sparkles,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useCompositorStore, type Layer } from "@/store/useCompositorStore";
import { LayerList } from "@/components/compositor/LayerList";
import { LayerControls } from "@/components/compositor/LayerControls";
import {
  ASPECT_DESIGN,
  resolveCenter,
  type CompositeProvenance,
  type CompositionDoc,
} from "@/lib/composition/layers";
import { Spinner } from "@/components/brand/Spinner";
import { api } from "@/lib/api";

type CompositeOp = CompositeProvenance["op"];

const OP_META: Record<
  CompositeOp,
  { label: string; icon: typeof Scissors; blurb: string }
> = {
  cutout: {
    label: "Cutout",
    icon: Scissors,
    blurb: "Lift the subject out with a clean, soft-edge alpha mask.",
  },
  inpaint: {
    label: "Erase & replace",
    icon: Wand2,
    blurb: "Fill a masked region with something new, blended in.",
  },
  relight: {
    label: "Relight",
    icon: Sun,
    blurb: "Match the lighting to a new scene or direction.",
  },
  blend: {
    label: "Blend",
    icon: LayersIcon,
    blurb: "Merge this image with another — subject + texture/style.",
  },
};

const RELIGHT_DIRECTIONS = ["None", "Left", "Right", "Top", "Bottom"] as const;

interface GalleryImage {
  id: string;
  url: string;
}

async function pollJob(jobId: string, workspaceSlug: string): Promise<string> {
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const jr = await api(`/api/jobs/${jobId}`, { workspaceSlug });
    if (!jr.ok) continue;
    const job = (await jr.json()) as {
      status: string;
      outputUrls?: string[];
    };
    if (job.status === "ready" && job.outputUrls?.[0]) return job.outputUrls[0];
    if (job.status === "failed") throw new Error("That operation failed");
  }
  throw new Error("Timed out waiting for a result");
}

/**
 * Studio-native compositing surface. Each op (cutout/inpaint/relight/blend)
 * becomes a real, auto-locked image LAYER in the SAME layer system the classic
 * Compositor uses (useCompositorStore + LayerList/LayerControls) — reused, not
 * forked, per the "extend existing layers" decision. Depth isn't a placeable
 * layer here (it's plumbing for relight/blur elsewhere), so it has no toolbar
 * entry in this pass.
 */
export function CompositorCanvas({
  workspaceSlug,
  campaignId,
  anchorUrl,
  classicHref,
}: {
  workspaceSlug: string;
  campaignId: string;
  anchorUrl: string;
  classicHref: string;
}) {
  const doc = useCompositorStore((s) => s.doc);
  const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
  const load = useCompositorStore((s) => s.load);
  const addLayer = useCompositorStore((s) => s.addLayer);
  const updateLayer = useCompositorStore((s) => s.updateLayer);
  const reset = useCompositorStore((s) => s.reset);

  const [loading, setLoading] = useState(true);
  const [activeOp, setActiveOp] = useState<CompositeOp | null>(null);
  const [prompt, setPrompt] = useState("");
  const [direction, setDirection] =
    useState<(typeof RELIGHT_DIRECTIONS)[number]>("None");
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [secondImage, setSecondImage] = useState<GalleryImage | null>(null);
  const [pickingSecond, setPickingSecond] = useState(false);
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [running, setRunning] = useState<CompositeOp | "redo" | null>(null);
  const maskInputRef = useRef<HTMLInputElement>(null);

  // Load (or initialise) this campaign's composition doc.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const campRes = await api(`/api/campaigns/${campaignId}`, {
          workspaceSlug,
        });
        const camp = campRes.ok
          ? ((await campRes.json()) as { latestCompositionId?: string | null })
          : null;
        if (camp?.latestCompositionId) {
          const compRes = await api(
            `/api/compositions/${camp.latestCompositionId}`,
            { workspaceSlug },
          );
          if (compRes.ok) {
            const row = (await compRes.json()) as {
              id: string;
              aspect: "9:16" | "1:1" | "16:9";
              background: CompositionDoc["background"];
              layers: Layer[];
              overrides?: CompositionDoc["overrides"];
            };
            if (active) {
              load({
                id: row.id,
                aspect: row.aspect,
                background: row.background,
                layers: row.layers,
                overrides: row.overrides,
              });
            }
            return;
          }
        }
        if (active) {
          load({
            id: uuidv4(),
            aspect: "1:1",
            background: { kind: "image", src: anchorUrl },
            layers: [],
          });
        }
      } catch {
        if (active) toast.error("Couldn't load the compositing canvas");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, workspaceSlug]);

  const persist = async (nextDoc?: CompositionDoc) => {
    const current = nextDoc ?? useCompositorStore.getState().doc;
    if (!current) return;
    await api("/api/compositions/save", {
      method: "POST",
      body: JSON.stringify({ doc: current, campaignId }),
      workspaceSlug,
    }).catch(() => {});
  };

  const selectedLayer = doc?.layers.find((l) => l.id === selectedLayerId);
  // The source for a new op: the selected image layer, else the background.
  const sourceImageUrl =
    selectedLayer?.kind === "image"
      ? selectedLayer.src
      : (doc?.background.src ?? anchorUrl);

  useEffect(() => {
    if (!pickingSecond || gallery.length > 0) return;
    api("/api/gallery", { workspaceSlug })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { assets?: GalleryImage[] } | null) =>
        setGallery(d?.assets ?? []),
      )
      .catch(() => {});
  }, [pickingSecond, gallery.length, workspaceSlug]);

  const resetForm = () => {
    setActiveOp(null);
    setPrompt("");
    setDirection("None");
    setMaskFile(null);
    setSecondImage(null);
    setPickingSecond(false);
  };

  const buildParams = async (
    op: CompositeOp,
  ): Promise<Record<string, unknown> | null> => {
    if (op === "cutout") return { imageUrl: sourceImageUrl };
    if (op === "relight") {
      if (!prompt.trim()) {
        toast.error("Describe the lighting you want first");
        return null;
      }
      return {
        imageUrl: sourceImageUrl,
        prompt: prompt.trim(),
        ...(direction !== "None" ? { direction } : {}),
      };
    }
    if (op === "inpaint") {
      if (!prompt.trim()) {
        toast.error("Describe what to fill in first");
        return null;
      }
      if (!maskFile) {
        toast.error("Upload a mask image first (white = fill, black = keep)");
        return null;
      }
      const fd = new FormData();
      fd.append("file", maskFile);
      const up = await api("/api/uploads/image", {
        method: "POST",
        body: fd,
        workspaceSlug,
      });
      const upData = (await up.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!up.ok || !upData.url) {
        toast.error(upData.error ?? "Mask upload failed");
        return null;
      }
      return {
        imageUrl: sourceImageUrl,
        maskUrl: upData.url,
        prompt: prompt.trim(),
      };
    }
    if (op === "blend") {
      if (!prompt.trim()) {
        toast.error("Describe how to merge them first");
        return null;
      }
      if (!secondImage) {
        toast.error("Pick a second image to blend first");
        return null;
      }
      return {
        imageUrls: [sourceImageUrl, secondImage.url],
        prompt: prompt.trim(),
      };
    }
    return null;
  };

  const submitOp = async () => {
    if (!activeOp || !doc) return;
    const params = await buildParams(activeOp);
    if (!params) return;
    setRunning(activeOp);
    const t = toast.loading(`Running ${OP_META[activeOp].label}…`);
    try {
      const res = await api("/api/compositing", {
        method: "POST",
        body: JSON.stringify({ op: activeOp, campaignId, params }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
        upgrade?: boolean;
      };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error ?? `Couldn't start ${activeOp}`);
      }
      const url = await pollJob(data.jobId, workspaceSlug);
      const provenance: CompositeProvenance = {
        op: activeOp,
        jobId: data.jobId,
        params,
      };
      const newLayer: Layer = {
        id: uuidv4(),
        kind: "image",
        src: url,
        pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
        scale: 1,
        rotationDeg: 0,
        opacity: 1,
        blend: "normal",
        appearAt: 0,
        disappearAt: null,
        fadeSec: 0,
        locked: true, // auto-locked once done — protects the finished step
        producedBy: provenance,
      };
      addLayer(newLayer);
      await persist(useCompositorStore.getState().doc ?? undefined);
      toast.success(`${OP_META[activeOp].label} done — added as a new layer`, {
        id: t,
      });
      resetForm();
    } catch (err) {
      toast.error((err as Error).message ?? "That operation failed", { id: t });
    } finally {
      setRunning(null);
    }
  };

  const handleRedo = async (
    op: CompositeOp,
    params: Record<string, unknown>,
  ) => {
    if (!selectedLayer || selectedLayer.kind !== "image") return;
    setRunning("redo");
    const t = toast.loading(`Redoing ${OP_META[op].label}…`);
    try {
      const res = await api("/api/compositing", {
        method: "POST",
        body: JSON.stringify({ op, campaignId, params }),
        workspaceSlug,
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
      };
      if (!res.ok || !data.jobId) {
        throw new Error(data.error ?? `Couldn't redo ${op}`);
      }
      const url = await pollJob(data.jobId, workspaceSlug);
      updateLayer(selectedLayer.id, {
        src: url,
        locked: true,
        producedBy: { op, jobId: data.jobId, params },
      });
      await persist(useCompositorStore.getState().doc ?? undefined);
      toast.success(`${OP_META[op].label} updated`, { id: t });
    } catch (err) {
      toast.error((err as Error).message ?? "Redo failed", { id: t });
    } finally {
      setRunning(null);
    }
  };

  if (loading || !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={40} />
      </div>
    );
  }

  const { width: designW, height: designH } = ASPECT_DESIGN[doc.aspect];
  // Render order: index 0 = back, last = front (matches the store's convention).
  const stack = doc.layers;

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Compositing</h2>
          <p className="text-sm text-muted-foreground">
            Each operation becomes its own layer — lock it in, or unlock to
            change it.
          </p>
        </div>
        <Link
          href={classicHref}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          Full editor (formats, autofix, publish){" "}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Toolbar — add a new compositing op */}
      <div className="flex flex-wrap gap-2">
        {(
          Object.entries(OP_META) as [
            CompositeOp,
            (typeof OP_META)[CompositeOp],
          ][]
        ).map(([op, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              key={op}
              type="button"
              onClick={() => setActiveOp(op)}
              disabled={!!running}
              title={meta.blurb}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                activeOp === op
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {meta.label}
            </button>
          );
        })}
      </div>

      {/* Inline form for the active op */}
      {activeOp && (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs text-muted-foreground">
            Source: {selectedLayer ? "selected layer" : "background image"}
          </p>
          {(activeOp === "inpaint" ||
            activeOp === "relight" ||
            activeOp === "blend") && (
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder={
                activeOp === "inpaint"
                  ? "What should fill the masked region?"
                  : activeOp === "relight"
                    ? "Describe the target lighting…"
                    : "Describe how to merge the two images…"
              }
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
          )}
          {activeOp === "relight" && (
            <select
              value={direction}
              onChange={(e) =>
                setDirection(
                  e.target.value as (typeof RELIGHT_DIRECTIONS)[number],
                )
              }
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {RELIGHT_DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === "None" ? "Auto lighting direction" : `Light from ${d}`}
                </option>
              ))}
            </select>
          )}
          {activeOp === "inpaint" && (
            <div>
              <input
                ref={maskInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => setMaskFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => maskInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40"
              >
                {maskFile
                  ? maskFile.name
                  : "Upload a mask (white = fill, black = keep)"}
              </button>
            </div>
          )}
          {activeOp === "blend" &&
            (secondImage ? (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={secondImage.url}
                  alt="Second image"
                  className="h-10 w-10 rounded-md object-cover"
                />
                <button
                  type="button"
                  onClick={() => setSecondImage(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPickingSecond(true)}
                className="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40"
              >
                Pick second image from your gallery
              </button>
            ))}
          {pickingSecond && (
            <div className="grid max-h-40 grid-cols-6 gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
              {gallery.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setSecondImage(g);
                    setPickingSecond(false);
                  }}
                  className="aspect-square overflow-hidden rounded-md border border-border hover:border-primary/50"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={submitOp}
              disabled={running === activeOp}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              {running === activeOp ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        {/* Preview — stacked, read-only (manipulate via the sliders below) */}
        <div className="flex items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-4">
          <div
            className="relative max-h-full max-w-full overflow-hidden rounded-lg bg-background shadow"
            style={{
              aspectRatio: `${designW} / ${designH}`,
              width: "min(100%, 60vh)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={doc.background.src}
              alt="Background"
              className="absolute inset-0 h-full w-full object-cover"
            />
            {stack.map((layer) => {
              if (layer.kind !== "image") return null;
              const { x, y } = resolveCenter(layer.pos, doc.aspect, 0, 0);
              const leftPct = (x / designW) * 100;
              const topPct = (y / designH) * 100;
              return (
                <div
                  key={layer.id}
                  className="absolute"
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    transform: `translate(-50%, -50%) rotate(${layer.rotationDeg}deg) scale(${layer.scale})`,
                    opacity: layer.opacity,
                    mixBlendMode: layer.blend,
                    width: "40%",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={layer.src}
                    alt=""
                    className="w-full rounded"
                    draggable={false}
                  />
                  {layer.locked && (
                    <span className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white">
                      <Lock className="h-3 w-3" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Layer stack + properties */}
        <div className="flex flex-col gap-3 overflow-y-auto">
          <LayerList />
          {selectedLayer && (
            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {selectedLayer.locked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <LockOpen className="h-3.5 w-3.5" />
                )}
                {selectedLayer.locked ? "Locked" : "Unlocked"} — selected layer
              </div>
              <LayerControls
                layer={selectedLayer}
                onRedo={handleRedo}
                redoing={running === "redo"}
              />
            </div>
          )}
        </div>
      </div>

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <ArrowRight className="h-3 w-3" /> Depth isn&apos;t shown as its own
        layer — it feeds relight and blur effects, not a visible element on its
        own.
      </p>
    </div>
  );
}
