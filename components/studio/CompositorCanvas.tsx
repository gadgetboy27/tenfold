"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import {
  Scissors,
  Wand2,
  Sun,
  Layers as LayersIcon,
  Grid2x2,
  Waves,
  Sparkle,
  Upload,
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
// The classic Compositor's canvas — real pointer-driven drag/resize/rotate,
// battle-tested — reused here rather than re-implemented against the
// DOM-mock preview this file used before. Aliased: this file's own export is
// also named CompositorCanvas.
import { CompositorCanvas as LayeredCanvas } from "@/components/compositor/CompositorCanvas";
import {
  ASPECT_DESIGN,
  type CompositeHistoryEntry,
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
  textureOverlay: {
    label: "Texture overlay",
    icon: Grid2x2,
    blurb: "Lay a second image over this one at a blend mode + opacity.",
  },
  gradientMerge: {
    label: "Gradient merge",
    icon: Waves,
    blurb: "Fade this image into a second one along a linear gradient.",
  },
  softGlow: {
    label: "Soft glow",
    icon: Sparkle,
    blurb: "A dreamy diffusion bloom — blurred copy composited back on top.",
  },
};

// Mechanical (Sharp) ops run synchronously via /api/compositing/blend — no
// fal queue, no credits, no jobId. Everything else is an async fal job.
const MECHANICAL_OPS = new Set<CompositeOp>([
  "textureOverlay",
  "gradientMerge",
  "softGlow",
]);
// Free-tier ops that still need a second image picked from the gallery.
const NEEDS_SECOND_IMAGE = new Set<CompositeOp>([
  "blend",
  "textureOverlay",
  "gradientMerge",
]);

const RELIGHT_DIRECTIONS = ["None", "Left", "Right", "Top", "Bottom"] as const;
const MECH_MODES = ["overlay", "soft-light", "multiply"] as const;
const MECH_DIRECTIONS = ["horizontal", "vertical"] as const;
// Keep in step with compositeHistoryEntrySchema's .max(5) in layers.ts.
const HISTORY_LIMIT = 5;

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
  initialOp = null,
}: {
  workspaceSlug: string;
  campaignId: string;
  anchorUrl: string;
  classicHref: string;
  /** Preselects an op (e.g. jumping here from the video step's Pro-effects
   *  panel) instead of landing on the bare toolbar. */
  initialOp?: CompositeOp | null;
}) {
  const doc = useCompositorStore((s) => s.doc);
  const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
  const load = useCompositorStore((s) => s.load);
  const addLayer = useCompositorStore((s) => s.addLayer);
  const updateLayer = useCompositorStore((s) => s.updateLayer);
  const reset = useCompositorStore((s) => s.reset);

  const [loading, setLoading] = useState(true);
  const [activeOp, setActiveOp] = useState<CompositeOp | null>(initialOp);
  const [prompt, setPrompt] = useState("");
  const [direction, setDirection] =
    useState<(typeof RELIGHT_DIRECTIONS)[number]>("None");
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [secondImage, setSecondImage] = useState<GalleryImage | null>(null);
  const [pickingSecond, setPickingSecond] = useState(false);
  const [mode, setMode] = useState<(typeof MECH_MODES)[number]>("soft-light");
  const [mechOpacity, setMechOpacity] = useState(1);
  const [mechDirection, setMechDirection] =
    useState<(typeof MECH_DIRECTIONS)[number]>("horizontal");
  const [sigma, setSigma] = useState(12);
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

  // Autosave: LayeredCanvas's drag/resize/rotate writes straight to the store
  // with no explicit save step (unlike submitOp/handleRedo, which persist
  // themselves) — without this, moving a layer and navigating away would
  // silently lose it. Debounced so a drag (many store updates) coalesces
  // into one write once the user pauses. Mirrors the classic Compositor's
  // own autosave effect.
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!doc || !campaignId) return;
    const serialized = JSON.stringify(doc);
    if (serialized === lastSavedRef.current) return;
    const t = setTimeout(() => {
      lastSavedRef.current = serialized;
      void persist(doc);
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, campaignId]);

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

  // Preview the uploaded mask directly on the canvas (white = fill) instead
  // of just naming the file — the only way to check it lines up before
  // spending the op.
  const maskPreviewUrl = useMemo(
    () => (maskFile ? URL.createObjectURL(maskFile) : null),
    [maskFile],
  );
  useEffect(() => {
    return () => {
      if (maskPreviewUrl) URL.revokeObjectURL(maskPreviewUrl);
    };
  }, [maskPreviewUrl]);

  // The mask-upload overlay needs to sit exactly over the rendered image
  // inside LayeredCanvas's <canvas> — which is letterboxed (object-contain)
  // within its flex wrapper, not flush with it. Measure the container and
  // compute the same contain-fit rect the browser applies to the canvas.
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [containRect, setContainRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const aspect = doc?.aspect;
  useEffect(() => {
    const el = previewContainerRef.current;
    if (!el || !aspect) return;
    const { width: dW, height: dH } = ASPECT_DESIGN[aspect];
    const compute = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      if (!cw || !ch) return;
      const scale = Math.min(cw / dW, ch / dH);
      const width = dW * scale;
      const height = dH * scale;
      setContainRect({
        left: (cw - width) / 2,
        top: (ch - height) / 2,
        width,
        height,
      });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const resetForm = () => {
    setActiveOp(null);
    setPrompt("");
    setDirection("None");
    setMaskFile(null);
    setSecondImage(null);
    setPickingSecond(false);
    setMode("soft-light");
    setMechOpacity(1);
    setMechDirection("horizontal");
    setSigma(12);
  };

  const buildParams = async (
    op: CompositeOp,
  ): Promise<Record<string, unknown> | null> => {
    if (op === "cutout") return { imageUrl: sourceImageUrl };
    if (op === "textureOverlay" || op === "gradientMerge") {
      if (!secondImage) {
        toast.error("Pick a second image first");
        return null;
      }
      return op === "textureOverlay"
        ? {
            baseUrl: sourceImageUrl,
            overlayUrl: secondImage.url,
            mode,
            opacity: mechOpacity,
          }
        : {
            baseUrl: sourceImageUrl,
            overlayUrl: secondImage.url,
            direction: mechDirection,
          };
    }
    if (op === "softGlow") {
      return { baseUrl: sourceImageUrl, sigma };
    }
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

  /** Mechanical (Sharp) ops are synchronous — POST returns the stored asset
   *  URL directly, no fal queue, no jobId, no credits. */
  const runMechanical = async (
    op: CompositeOp,
    params: Record<string, unknown>,
  ): Promise<string> => {
    const res = await api("/api/compositing/blend", {
      method: "POST",
      body: JSON.stringify({ campaignId, op, ...params }),
      workspaceSlug,
    });
    const data = (await res.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    if (!res.ok || !data.url) {
      throw new Error(data.error ?? `Couldn't run ${op}`);
    }
    return data.url;
  };

  const submitOp = async () => {
    if (!activeOp || !doc) return;
    const params = await buildParams(activeOp);
    if (!params) return;
    setRunning(activeOp);
    const t = toast.loading(`Running ${OP_META[activeOp].label}…`);
    try {
      const url = MECHANICAL_OPS.has(activeOp)
        ? await runMechanical(activeOp, params)
        : await (async () => {
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
            return pollJob(data.jobId, workspaceSlug);
          })();
      const provenance: CompositeProvenance = {
        op: activeOp,
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
      const url = MECHANICAL_OPS.has(op)
        ? await runMechanical(op, params)
        : await (async () => {
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
            return pollJob(data.jobId, workspaceSlug);
          })();
      // Keep the pre-redo version so it can be reverted to from the panel.
      const prevEntry: CompositeHistoryEntry = {
        src: selectedLayer.src,
        producedBy: selectedLayer.producedBy,
      };
      const history = [prevEntry, ...(selectedLayer.history ?? [])].slice(
        0,
        HISTORY_LIMIT,
      );
      updateLayer(selectedLayer.id, {
        src: url,
        locked: true,
        producedBy: { op, params },
        history,
      });
      await persist(useCompositorStore.getState().doc ?? undefined);
      toast.success(`${OP_META[op].label} updated`, { id: t });
    } catch (err) {
      toast.error((err as Error).message ?? "Redo failed", { id: t });
    } finally {
      setRunning(null);
    }
  };

  const handleRevertHistory = async (entry: CompositeHistoryEntry) => {
    if (!selectedLayer || selectedLayer.kind !== "image") return;
    const currentEntry: CompositeHistoryEntry = {
      src: selectedLayer.src,
      producedBy: selectedLayer.producedBy,
    };
    const rest = (selectedLayer.history ?? []).filter(
      (h) => h.src !== entry.src,
    );
    const history = [currentEntry, ...rest].slice(0, HISTORY_LIMIT);
    updateLayer(selectedLayer.id, {
      src: entry.src,
      producedBy: entry.producedBy,
      history,
    });
    await persist(useCompositorStore.getState().doc ?? undefined);
    toast.success("Reverted to a previous version");
  };

  if (loading || !doc) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={40} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-3">
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

      {/* LEFT: op menu + active op form + layer stack/properties, all in one
          scrolling panel — RIGHT: the big canvas. Same split as the rest of
          Studio's Cockpit (menu left, result right). */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,320px)_1fr]">
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-3">
          {/* Op menu — a vertical list (not a wrapping pill row) since the
              left column has the height to spare. */}
          <nav className="flex flex-col gap-0.5">
            {(
              Object.entries(OP_META) as [
                CompositeOp,
                (typeof OP_META)[CompositeOp],
              ][]
            ).map(([op, meta]) => {
              const Icon = meta.icon;
              const active = activeOp === op;
              return (
                <button
                  key={op}
                  type="button"
                  onClick={() => setActiveOp(op)}
                  disabled={!!running}
                  title={meta.blurb}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors disabled:opacity-40 ${
                    active
                      ? "bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-background hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-90" />
                  <span className="flex-1">{meta.label}</span>
                </button>
              );
            })}
          </nav>

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
                      {d === "None"
                        ? "Auto lighting direction"
                        : `Light from ${d}`}
                    </option>
                  ))}
                </select>
              )}
              {activeOp === "inpaint" && (
                <p className="text-xs text-muted-foreground">
                  {maskFile
                    ? `Mask: ${maskFile.name} — click the canvas to replace it.`
                    : "Click the canvas to upload a mask (white = fill, black = keep)."}
                </p>
              )}
              {activeOp === "textureOverlay" && (
                <>
                  <select
                    value={mode}
                    onChange={(e) =>
                      setMode(e.target.value as (typeof MECH_MODES)[number])
                    }
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  >
                    {MECH_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={mechOpacity}
                      onChange={(e) => setMechOpacity(+e.target.value)}
                      className="flex-1"
                    />
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {Math.round(mechOpacity * 100)}%
                    </span>
                  </div>
                </>
              )}
              {activeOp === "gradientMerge" && (
                <select
                  value={mechDirection}
                  onChange={(e) =>
                    setMechDirection(
                      e.target.value as (typeof MECH_DIRECTIONS)[number],
                    )
                  }
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  {MECH_DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              {activeOp === "softGlow" && (
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={sigma}
                    onChange={(e) => setSigma(+e.target.value)}
                    className="flex-1"
                  />
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {sigma}
                  </span>
                </div>
              )}
              {NEEDS_SECOND_IMAGE.has(activeOp) &&
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
                <div className="grid max-h-40 grid-cols-4 gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
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

          <div className="border-t border-border" />

          {/* Layer stack + properties */}
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
                onRevertHistory={handleRevertHistory}
              />
            </div>
          )}
        </div>

        {/* Preview — the classic Compositor's real canvas: click to select,
            drag to move, edge/corner handles to resize/rotate. Fills the
            available space (canvas intrinsic size + max-w/max-h), no more
            capped-small mock. */}
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-4">
          <div ref={previewContainerRef} className="relative h-full w-full">
            <LayeredCanvas
              playing={false}
              onTick={() => {}}
              onEnded={() => {}}
            />
            {activeOp === "inpaint" && containRect && (
              <div
                className="absolute overflow-hidden rounded-lg"
                style={{
                  left: containRect.left,
                  top: containRect.top,
                  width: containRect.width,
                  height: containRect.height,
                }}
              >
                <input
                  ref={maskInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => setMaskFile(e.target.files?.[0] ?? null)}
                />
                {maskPreviewUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={maskPreviewUrl}
                      alt="Mask preview"
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-70 mix-blend-screen"
                    />
                    <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                      Mask preview — white = fill
                    </span>
                    <button
                      type="button"
                      onClick={() => maskInputRef.current?.click()}
                      className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white hover:bg-black/80"
                    >
                      <Upload className="h-3 w-3" /> Change mask
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => maskInputRef.current?.click()}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-primary/40 bg-background/60 text-center text-sm text-muted-foreground transition-colors hover:border-primary/70 hover:text-foreground"
                  >
                    <Upload className="h-5 w-5" />
                    Click to upload a mask
                    <span className="text-xs text-muted-foreground/80">
                      white = fill, black = keep
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
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
