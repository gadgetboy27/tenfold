"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Trash2,
  ChevronRight,
  Download,
  Layers,
  FileText,
  Maximize2,
  X,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useCompositorStore, type Layer } from "@/store/useCompositorStore";
import {
  TRAY_MIME,
  parseTrayItem,
  dropToFraction,
} from "@/lib/composition/tray";
import {
  dropTrayItem,
  addVideoToAd,
  addCaptionToAd,
} from "@/components/studio/adBridge";
import { LayerList } from "@/components/compositor/LayerList";
import { ElementTray } from "@/components/studio/ElementTray";
import { useAdShortcuts } from "@/components/studio/useAdShortcuts";
import { CaptionPresetRow } from "@/components/compositor/CaptionPresetRow";
import { LayerControls } from "@/components/compositor/LayerControls";
// The classic Compositor's canvas — real pointer-driven drag/resize/rotate,
// battle-tested — reused here rather than re-implemented against the
// DOM-mock preview this file used before. Aliased: this file's own export is
// also named CompositorCanvas.
import { CompositorCanvas as LayeredCanvas } from "@/components/compositor/CompositorCanvas";
import {
  ASPECT_DESIGN,
  ASPECTS,
  type CompositeHistoryEntry,
  type CompositeProvenance,
  type CompositionAspect,
  type CompositionDoc,
} from "@/lib/composition/layers";
import { FormatRail } from "@/components/compositor/FormatRail";
import {
  materializeDoc,
  requestExport,
  requestFanOutExport,
  type FanOutOutput,
} from "@/components/compositor/export-client";
import { downloadCampaignPdf } from "@/lib/compositor/campaign-pdf";
import {
  railFormats,
  formatsForPlatforms,
  distinctAspects,
} from "@/lib/composition/formats";
import { readProfilesResponse } from "@/lib/social/profiles-response";
import { Spinner } from "@/components/brand/Spinner";
import { InfoHint } from "@/components/ui/info-hint";
import {
  GalleryPicker,
  GalleryPickButton,
} from "@/components/shared/GalleryPicker";
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
    /**
     * "Erase & replace" read as an undo, which invited the fair question of
     * whether it was redundant now that deleting a layer is one key. It isn't:
     * delete removes something YOU put on the ad; this repaints pixels that
     * were generated INTO the picture. If you didn't put it there, delete
     * can't reach it — a stray sign, a bystander, a wrong-coloured object.
     */
    label: "Pixel fixer",
    icon: Wand2,
    blurb:
      "Repaint part of the picture itself. Use it on things the image model " +
      "put there — a stray sign, an extra hand, an object in the wrong " +
      "colour. Upload a mask (white = repaint, black = keep), describe what " +
      "should be there instead, and it fills the area to match the " +
      "surrounding light and texture. Deleting a layer removes something you " +
      "added; this changes the picture underneath.",
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

/**
 * Ops that return a transformed copy of the WHOLE source frame, as opposed to
 * something meant to sit on top of it.
 *
 * These have to REPLACE what they were applied to. Adding a full-frame result
 * as a new layer leaves the original underneath it — a soft glow on a photo
 * produced two copies of that photo stacked, and the top one arrives locked, so
 * it reads as one immovable image that can't be separated. Only `cutout`
 * genuinely produces a new element to place; `depth` isn't placeable at all.
 */
const FULL_FRAME_OPS = new Set<CompositeOp>([
  "inpaint",
  "relight",
  "blend",
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

/** The second input of a blend/overlay op — from the gallery or a fresh upload. */
interface SecondImage {
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
  caption,
  onUpgrade,
  onPickMusic,
  musicUrl,
  initialOp = null,
  footer = null,
}: {
  workspaceSlug: string;
  campaignId: string;
  anchorUrl: string;
  /** The campaign caption, for the cinema-mix presets. Absent = row hidden. */
  caption?: string | null;
  /** Raises Studio's upgrade modal. Passed in rather than owning a second one:
   *  two modals on one screen can both be open, and only one can be right. */
  onUpgrade?: () => void;
  /** Sets the render soundtrack when a track is dropped on the ad. */
  onPickMusic?: (url: string) => void;
  /**
   * The campaign's music, baked in at render time.
   *
   * NOT optional in spirit: FFmpeg muxes audio when it renders, and publish's
   * late-music remux only fires when the track is NEWER than the export. A cut
   * rendered here is newer than every existing track, so exporting without
   * this posts permanent silence with nothing saying why.
   */
  musicUrl?: string | null;
  /** Rendered at the bottom of the controls column. The done-footer used to
   *  be mounted as a sibling AFTER this component, which sits at h-full — so
   *  it landed a full screen below the fold and you had to scroll a pane that
   *  looked like it didn't scroll to find it. Inside the column it's in the
   *  natural flow of the controls instead. */
  footer?: React.ReactNode;
  /** Preselects an op (e.g. jumping here from the video step's Pro-effects
   *  panel) instead of landing on the bare toolbar. */
  initialOp?: CompositeOp | null;
}) {
  const doc = useCompositorStore((s) => s.doc);
  const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
  const load = useCompositorStore((s) => s.load);
  const addLayer = useCompositorStore((s) => s.addLayer);
  const removeLayer = useCompositorStore((s) => s.removeLayer);
  const [preview, setPreview] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [flaggedFormats, setFlaggedFormats] = useState(0);

  /**
   * The format rail, brought across from the classic Compositor.
   *
   * Compose could not change aspect AT ALL before this — the whole
   * multi-format system (per-aspect overrides, safe-zone warnings, the vision
   * auto-fix) existed and was reachable only from a page nothing links to.
   * An ad that publishes to a feed and a Story is two shapes, and Compose was
   * the one screen that couldn't say so.
   */
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  useEffect(() => {
    if (!workspaceSlug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/social/profiles", { workspaceSlug });
        if (!res.ok) return;
        const { profiles } = readProfilesResponse<{ platform: string }>(
          await res.json(),
        );
        if (!cancelled) setConnectedPlatforms(profiles.map((p) => p.platform));
      } catch {
        // No connections yet, or offline: railFormats falls back to the
        // generic aspect trio, so the rail still works — it just isn't
        // labelled with the platforms it's for.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug]);

  // Stable identity, or FormatRail's redraw effects loop every render.
  const rail = useMemo(
    () => railFormats(connectedPlatforms),
    [connectedPlatforms],
  );
  const [exporting, setExporting] = useState(false);
  const [exportingAll, setExportingAll] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [fanOut, setFanOut] = useState<FanOutOutput[] | null>(null);

  /**
   * Render the finished cut.
   *
   * Compose is where the ad is assembled, and it had no way to turn the doc
   * into a file — the only render lived in Publish's "Final adjustments". So
   * the room you build the ad in couldn't produce it.
   *
   * `materializeDoc` first: the server renderer can only fetch http(s), so a
   * blob: URL from a local upload has to be uploaded before it can be drawn.
   * When anything WAS local the materialised doc is loaded back, or the next
   * render re-uploads the same files.
   */
  const exportMp4 = async () => {
    const current = useCompositorStore.getState().doc;
    if (!current) return;
    setExporting(true);
    try {
      const hadLocal = [
        current.background.src,
        ...current.layers.map((l) => (l.kind === "image" ? l.src : "")),
      ].some((s) => s.startsWith("blob:"));
      const materialized = await materializeDoc(current, workspaceSlug);
      if (hadLocal) load(materialized);
      const { url } = await requestExport(materialized, workspaceSlug, {
        campaignId,
        audioUrl: musicUrl ?? null,
      });
      setExportUrl(url);
      toast.success("Rendered — every layer baked in.");
    } catch (err) {
      toast.error((err as Error).message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  /**
   * Every connected platform at once.
   *
   * The fan-out renders one file per ASPECT — safe zones change the ⚠ overlay,
   * not the pixels — but a person doesn't think in aspects, they think "the
   * TikTok one". So we render by aspect (no wasted work) and LABEL by platform,
   * which is the same file described in the words the user is holding it for.
   *
   * Two platforms sharing a shape share a file, and the label says so rather
   * than implying two renders happened.
   */
  const platformFormats = formatsForPlatforms(connectedPlatforms);
  const fanAspects =
    platformFormats.length > 0
      ? distinctAspects(platformFormats)
      : Array.from(new Set(rail.map((r) => r.aspect)));
  const platformsForAspect = (a: CompositionAspect) =>
    platformFormats.filter((f) => f.aspect === a).map((f) => f.label);
  const exportAllFormats = async () => {
    const current = useCompositorStore.getState().doc;
    if (!current) return;
    setExportingAll(true);
    setFanOut(null);
    try {
      const hadLocal = [
        current.background.src,
        ...current.layers.map((l) => (l.kind === "image" ? l.src : "")),
      ].some((s) => s.startsWith("blob:"));
      const materialized = await materializeDoc(current, workspaceSlug);
      if (hadLocal) load(materialized);
      const outputs = await requestFanOutExport(
        materialized,
        workspaceSlug,
        fanAspects,
        { campaignId, audioUrl: musicUrl ?? null },
      );
      setFanOut(outputs);
      toast.success(
        `Rendered ${outputs.length} format${outputs.length > 1 ? "s" : ""}.`,
      );
    } catch (err) {
      toast.error((err as Error).message ?? "Export failed");
    } finally {
      setExportingAll(false);
    }
  };

  /**
   * The campaign one-pager — the ad, its caption and the brand mark on a page
   * you can send to a client. Free and entirely client-side (pdf-lib), so it
   * costs nothing and works with no render queue.
   */
  const [pdfBusy, setPdfBusy] = useState(false);
  const makePdf = async () => {
    setPdfBusy(true);
    try {
      await downloadCampaignPdf({
        imageUrl: exportUrl ?? anchorUrl,
        caption: caption ?? "",
        logoUrl: null,
        brandName: null,
      });
    } catch {
      toast.error("Couldn't build the PDF — try again.");
    } finally {
      setPdfBusy(false);
    }
  };

  const setAspect = useCompositorStore((s) => s.setAspect);
  const overrideMode = useCompositorStore((s) => s.overrideMode);
  const setOverrideMode = useCompositorStore((s) => s.setOverrideMode);
  const resetOverride = useCompositorStore((s) => s.resetOverride);
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);
  // Same keys as the Ad stage. Compose takes the full width and the stage
  // stands down for it, so a handler living only there covers half the places
  // a user is looking at a canvas.
  useAdShortcuts();
  const updateLayer = useCompositorStore((s) => s.updateLayer);
  const reset = useCompositorStore((s) => s.reset);

  const [loading, setLoading] = useState(true);
  const [activeOp, setActiveOp] = useState<CompositeOp | null>(initialOp);
  const [prompt, setPrompt] = useState("");
  const [direction, setDirection] =
    useState<(typeof RELIGHT_DIRECTIONS)[number]>("None");
  const [maskFile, setMaskFile] = useState<File | null>(null);
  const [secondImage, setSecondImage] = useState<SecondImage | null>(null);
  const [pickingSecond, setPickingSecond] = useState(false);
  const [uploadingSecond, setUploadingSecond] = useState(false);
  const [mode, setMode] = useState<(typeof MECH_MODES)[number]>("soft-light");
  const [mechOpacity, setMechOpacity] = useState(1);
  const [mechDirection, setMechDirection] =
    useState<(typeof MECH_DIRECTIONS)[number]>("horizontal");
  const [sigma, setSigma] = useState(12);
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

  // The second image can also be a brand-new file — an overlay texture or a
  // partner logo won't already be in the gallery. Same generic endpoint every
  // other upload in the app uses.
  const uploadSecondImage = async (file: File) => {
    setUploadingSecond(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api("/api/uploads/image", {
        method: "POST",
        body: fd,
        workspaceSlug,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      setSecondImage({ id: uuidv4(), url: data.url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingSecond(false);
    }
  };

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
      if (FULL_FRAME_OPS.has(activeOp)) {
        // Replace the thing it was applied to. `sourceImageUrl` above resolves
        // to the selected image layer, else the background — so put the result
        // back exactly where the source came from.
        //
        // Trade-off taken knowingly: a background carries no `producedBy`, so
        // replacing it loses the "Redo this op" affordance that a layer would
        // have kept. Two stacked copies of the same photo is the worse outcome,
        // and the op panel is right here to run again.
        if (selectedLayer?.kind === "image") {
          updateLayer(selectedLayer.id, { src: url, producedBy: provenance });
        } else {
          useCompositorStore
            .getState()
            .setBackground({ kind: "image", src: url });
        }
        await persist(useCompositorStore.getState().doc ?? undefined);
        toast.success(`${OP_META[activeOp].label} applied`, { id: t });
      } else {
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
          // NOT auto-locked. Locking made the result click-through on the
          // canvas, so a user who didn't want it couldn't select it to delete
          // it — "protecting the finished step" cost them control of it.
          producedBy: provenance,
        };
        addLayer(newLayer);
        await persist(useCompositorStore.getState().doc ?? undefined);
        toast.success(
          `${OP_META[activeOp].label} done — added as a new layer`,
          {
            id: t,
          },
        );
      }
      resetForm();
    } catch (err) {
      toast.error((err as Error).message ?? "That operation failed", { id: t });
    } finally {
      setRunning(null);
    }
  };

  /**
   * Drop a tray element onto the ad at the point it was released.
   *
   * The fraction is measured against the MEDIA rect, not the container — the
   * canvas is letterboxed, so measuring against the container puts every drop
   * off by the size of the bars. See lib/composition/tray.ts.
   */
  const handleTrayDrop = async (e: React.DragEvent) => {
    const item = parseTrayItem(e.dataTransfer.getData(TRAY_MIME));
    // Not ours — a file, a URL, text from another window. Let the browser do
    // whatever it would normally do rather than inventing a layer.
    if (!item) return;
    e.preventDefault();
    const el = previewContainerRef.current;
    if (!el || !containRect) return;
    const box = el.getBoundingClientRect();
    const { nx, ny } = dropToFraction(e.clientX, e.clientY, box, containRect);

    // Through adBridge, not addLayer directly: it is the one supported way to
    // put something on the ad, and a second path is how two callers end up
    // disagreeing about what a dropped layer looks like.
    const outcome = dropTrayItem(item, { nx, ny });
    if (outcome.placed === "music") {
      onPickMusic?.(outcome.src);
      toast.success("Soundtrack set — it's baked in on the next render");
      return;
    }
    if (outcome.placed === "none") {
      toast.error("Put an image or clip on the ad first.");
      return;
    }
    await persist(useCompositorStore.getState().doc ?? undefined);
    toast.success(
      outcome.placed === "background"
        ? "On the stage — your layers are still on top"
        : item.kind === "mark"
          ? "Mark placed"
          : "Lettering placed",
    );
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
      <GalleryPicker
        open={pickingSecond}
        onClose={() => setPickingSecond(false)}
        onPick={(a) => setSecondImage({ id: a.id, url: a.url })}
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
        title="Pick the second image"
        hint="Blended with, or laid over, the image on the canvas."
      />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Compositing</h2>
          <p className="text-sm text-muted-foreground">
            Each operation becomes its own layer — lock it in, or unlock to
            change it.
          </p>
        </div>
      </div>

      {/* Canvas LEFT, controls RIGHT — matching the three-pane shell, where
          the thing you're making is central and every control lives in the
          right rail. This pane used to be the other way round, following the
          old two-column Cockpit convention it was written against: the result
          was a second tools column on the left, directly beside the nav's tools
          column, which read as two menus competing.

          The order is flipped in CSS rather than by moving the markup, so the
          DOM keeps controls-then-canvas for reading order and nothing in the
          canvas measuring code below has to change. */}
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 gap-4 ${
          // The controls are a fixed-width column, so every pixel past
          // their needs belongs to the canvas. 320px was a third of a
          // 1024px screen and a fifth of a 1600px one — the same column
          // doing the same job while the ad got proportionally smaller.
          preview ? "" : "lg:grid-cols-[1fr_300px]"
        }`}
      >
        <div
          className={`flex min-h-0 flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-card p-3 lg:order-2 ${
            // Hidden, not unmounted: unmounting would throw away every
            // in-progress op form — a half-filled inpaint prompt, an
            // uploaded mask — for the sake of a preview you close again.
            preview ? "hidden" : ""
          }`}
        >
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
              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <InfoHint text={OP_META[activeOp].blurb} />
                <span>{OP_META[activeOp].blurb.split(".")[0]}.</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Changing{" "}
                <span className="font-medium text-foreground">
                  {selectedLayer
                    ? "the selected layer"
                    : "the background image"}
                </span>{" "}
                — click something on the ad to change that.
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
                  <div className="flex flex-wrap items-center gap-2">
                    <GalleryPickButton
                      onClick={() => setPickingSecond(true)}
                      label="Pick from gallery"
                    />
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground">
                      <Upload className="h-3.5 w-3.5" />
                      {uploadingSecond ? "Uploading…" : "Upload a file"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadSecondImage(f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                ))}
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
          {/* Cinema mix presets — fade / lower third / crawl.
              These were wired ONLY into the classic /[workspace]/compositor
              page, so they were stranded there when Studio became the main
              site: the styles existed, worked, and were reachable by nobody
              following the normal flow. Same shape as the four Pro panels and
              the publish UI before them. */}
          {caption && (
            <div className="border-t border-border pt-3">
              <CaptionPresetRow
                caption={caption}
                onUpgrade={() => onUpgrade?.()}
              />
            </div>
          )}

          {/* Placeable elements, above the layer list: the tray is where a
              layer COMES FROM, so it reads top-to-bottom as make-it →
              drop-it → it's in the list. */}
          <div className="border-t border-border pt-3">
            <ElementTray
              workspaceSlug={workspaceSlug}
              campaignId={campaignId}
              onStageVideo={(v) => addVideoToAd(v.url)}
              onPickMusic={(url) => onPickMusic?.(url)}
              onPlaceCaption={() => {
                if (caption) addCaptionToAd(caption);
              }}
              musicUrl={musicUrl}
            />
          </div>

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
                {/* The one-press delete. It was two or three actions before:
                    find the layer's row in the list and hit its bin, or select
                    the text and delete the characters — which leaves an empty
                    text layer behind and doesn't remove anything at all.
                    Undo covers the mistake, which is what makes an unconfirmed
                    destructive button reasonable here; a confirm on every
                    delete is what trains people to stop reading confirms. */}
                <button
                  type="button"
                  onClick={() => removeLayer(selectedLayer.id)}
                  title="Delete this layer (Del)"
                  aria-label="Delete this layer"
                  className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="text-[10px]">Del</span>
                </button>
                <InfoHint text="Locking a layer freezes it so later operations build on top instead of replacing it. Unlock to edit its settings or regenerate it." />
              </div>
              <LayerControls
                layer={selectedLayer}
                onRedo={handleRedo}
                redoing={running === "redo"}
                onRevertHistory={handleRevertHistory}
              />
            </div>
          )}
          {footer}
        </div>

        {/* Preview — the classic Compositor's real canvas: click to select,
            drag to move, edge/corner handles to resize/rotate. Fills the
            available space (canvas intrinsic size + max-w/max-h), no more
            capped-small mock. */}
        <div
          className={
            preview
              ? "fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 sm:p-8"
              : "flex min-h-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-4 lg:order-1"
          }
        >
          {/* Fullscreen preview — the finished look with no editing marks,
              ported from the classic Compositor where it was the only place
              you could see the ad as it will actually publish. Escape closes
              it, because a fullscreen overlay with no keyboard exit is a trap
              on a laptop with no visible chrome. */}
          <button
            type="button"
            onClick={() => setPreview((p) => !p)}
            title={preview ? "Close preview (Esc)" : "Fullscreen preview"}
            aria-label={preview ? "Close preview" : "Fullscreen preview"}
            className={`absolute z-10 flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 py-1.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground ${
              preview ? "right-6 top-6" : "right-6 top-6"
            }`}
          >
            {preview ? (
              <>
                <X className="h-3.5 w-3.5" /> Close
              </>
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          {/* What the active op will actually change.
              Reported as "you click one and nothing seems to change". The op
              form DID say `Source: selected layer / background image`, but as
              a small grey line in the right-hand column — nowhere near where
              the user is looking, and the canvas itself gave no sign at all.
              Clicking a layer to retarget already worked; it was invisible.
              This says it on the canvas, in the op's own words. */}
          {!preview && doc && activeOp && (
            <div className="absolute inset-x-6 top-16 z-10 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-[11px] backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="text-foreground">
                <strong>{OP_META[activeOp].label}</strong> will change{" "}
                {selectedLayer ? (
                  <strong>
                    {selectedLayer.kind === "text"
                      ? `the text “${selectedLayer.text.slice(0, 18)}”`
                      : "the selected layer"}
                  </strong>
                ) : (
                  <strong>the background image</strong>
                )}
              </span>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {selectedLayer
                  ? "click the background to target that instead"
                  : "click a layer to target it instead"}
              </span>
            </div>
          )}

          {!preview && doc && (
            <div className="absolute left-6 top-6 z-10 flex flex-wrap items-center gap-1.5">
              {/* Shape. An ad that goes to a feed and a Story is two shapes,
                  and this was the one screen that couldn't say so — the whole
                  multi-format system existed behind a page nothing links to. */}
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAspect(a)}
                  className={`rounded-md border px-2 py-1 text-[11px] backdrop-blur transition-colors ${
                    doc.aspect === a
                      ? "border-primary/50 bg-primary/15 text-primary"
                      : "border-border bg-card/80 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a}
                </button>
              ))}
              <span className="mx-0.5 h-4 w-px bg-border" />
              {/* Master vs this-format-only. Without it every nudge made to fit
                  a Story silently moved the feed version too, which is the
                  failure the override system was built to prevent. */}
              <button
                type="button"
                onClick={() => setOverrideMode(!overrideMode)}
                title={
                  overrideMode
                    ? `Edits apply to the ${doc.aspect} format only`
                    : "Edits apply to every format (the master design)"
                }
                className={`rounded-md border px-2 py-1 text-[11px] backdrop-blur transition-colors ${
                  overrideMode
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-500"
                    : "border-border bg-card/80 text-muted-foreground hover:text-foreground"
                }`}
              >
                {overrideMode ? `${doc.aspect} only` : "Master"}
              </button>
              {doc.overrides?.[doc.aspect] && (
                <button
                  type="button"
                  onClick={() => resetOverride()}
                  title={`Revert ${doc.aspect} to the master layout`}
                  className="rounded-md border border-border bg-card/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
                >
                  Reset {doc.aspect}
                </button>
              )}
            </div>
          )}
          <div
            ref={previewContainerRef}
            className="relative h-full w-full"
            onDragOver={(e) => {
              // Only claim the drop when it's one of ours; preventDefault is
              // what tells the browser this is a valid target at all.
              if (e.dataTransfer.types.includes(TRAY_MIME)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={handleTrayDrop}
          >
            <LayeredCanvas
              playing={false}
              cleanPreview={preview}
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

      {/* Render. Compose is where the ad is assembled and it had no way to
          turn the doc into a file — the only render lived in Publish's "Final
          adjustments", so the room you build the ad in couldn't produce it. */}
      {!preview && doc && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportMp4}
            disabled={exporting || exportingAll}
            title="Render this cut with every layer and your music baked in"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
          >
            {exporting ? (
              <Spinner size={14} />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting ? "Rendering…" : "Render this cut"}
          </button>

          {/* Only when there's more than one shape to render — a single-format
              "export all" is the same button twice. */}
          {fanAspects.length > 1 && (
            <button
              type="button"
              onClick={exportAllFormats}
              disabled={exporting || exportingAll}
              title={
                platformFormats.length
                  ? `One file per shape, covering ${platformFormats.map((f) => f.label).join(", ")}`
                  : `Render all ${fanAspects.length} formats at once, each with its own overrides`
              }
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              {exportingAll ? (
                <Spinner size={14} />
              ) : (
                <Layers className="h-3.5 w-3.5" />
              )}
              {exportingAll
                ? "Rendering all…"
                : platformFormats.length
                  ? `Render for ${platformFormats.map((f) => f.label).join(", ")}`
                  : `Render all ${fanAspects.length} formats`}
            </button>
          )}

          <button
            type="button"
            onClick={makePdf}
            disabled={pdfBusy}
            title="A one-page PDF of the ad and its caption, to send to a client"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            {pdfBusy ? (
              <Spinner size={14} />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {pdfBusy ? "Building…" : "One-pager PDF"}
          </button>

          {exportUrl && (
            <a
              href={exportUrl}
              target="_blank"
              rel="noopener"
              className="text-xs text-primary hover:underline"
            >
              ↓ Download your MP4
            </a>
          )}
        </div>
      )}

      {fanOut && fanOut.length > 0 && !preview && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="text-muted-foreground">
            {fanOut.length} formats rendered:
          </span>
          {fanOut.map((o) => {
            const names = platformsForAspect(o.aspect);
            return (
              <a
                key={o.aspect}
                href={o.url}
                target="_blank"
                rel="noopener"
                title={
                  names.length
                    ? `${names.join(" + ")} — ${o.aspect}`
                    : `${o.aspect} render`
                }
                className="rounded-full border border-border px-2 py-0.5 text-primary hover:border-primary/50"
              >
                {names.length ? names.join(" + ") : o.aspect} ↓
              </a>
            );
          })}
        </div>
      )}

      {/* Live per-platform previews of the SAME master doc, each reflowed to
          that platform's aspect. The safe-zone guides are the point: a ⚠ lights
          when a layer lands under the platform's own UI chrome, which is the
          one thing you cannot see by looking at a single shape.

          COLLAPSED BY DEFAULT. At full width under the canvas it cost more
          screen than it earned most of the time — you check formats
          occasionally, not continuously. The warning still reaches you
          collapsed, via the count reported up from the rail, so folding it
          away keeps the pixels AND the point. */}
      {!preview && doc && (
        <div className="rounded-xl border border-border">
          <button
            type="button"
            onClick={() => setRailOpen((o) => !o)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${railOpen ? "rotate-90" : ""}`}
            />
            <span>Platform formats</span>
            {flaggedFormats > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                ⚠ {flaggedFormats} need{flaggedFormats === 1 ? "s" : ""} a look
              </span>
            )}
            <span className="ml-auto text-[10px] text-muted-foreground/70">
              {doc.aspect}
            </span>
          </button>
          {/* Always MOUNTED, only visually hidden.
              Unmounting it while collapsed was the obvious saving and it is
              wrong: the safe-zone warning is computed BY this component, so a
              rail that never renders never measures, the badge above never
              lights, and folding it away would keep the code while silently
              dropping the one thing that justifies it. It costs the redraws.
              That is the price of the warning being trustworthy. */}
          <div className={railOpen ? "border-t border-border p-3" : "hidden"}>
            <FormatRail
              doc={doc}
              formats={rail}
              activeAspect={doc.aspect}
              onPick={(a: CompositionAspect) => setAspect(a)}
              campaignId={campaignId}
              workspaceSlug={workspaceSlug}
              onFlaggedCount={setFlaggedFormats}
            />
          </div>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
        <ArrowRight className="h-3 w-3" /> Depth isn&apos;t shown as its own
        layer — it feeds relight and blur effects, not a visible element on its
        own.
      </p>
    </div>
  );
}
