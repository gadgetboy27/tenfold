"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  Play,
  Pause,
  ImagePlus,
  Type,
  Layers,
  Shapes,
  Sparkles,
  Download,
  Maximize2,
  Music,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/brand/Spinner";
import { api } from "@/lib/api";
import {
  effectiveLayer,
  type CompositionAspect,
} from "@/lib/composition/layers";
import { railFormats } from "@/lib/composition/formats";
import {
  MUSIC_LIBRARY,
  hasMusicLibrary,
} from "@/lib/composition/music-library";
import {
  brandKitLayers,
  pickKitLogo,
  type BrandKitInfo,
} from "@/lib/composition/brand-apply";
import { useCompositorStore } from "@/store/useCompositorStore";
import { useAppStore } from "@/store/useAppStore";
import {
  materializeDoc,
  requestExport,
  requestFanOutExport,
  type FanOutOutput,
} from "./export-client";
import {
  CompositorCanvas,
  type CompositorCanvasHandle,
} from "./CompositorCanvas";
import { LayerList } from "./LayerList";
import { LayerControls } from "./LayerControls";
import { AssetsTray } from "./AssetsTray";
import { FormatRail } from "./FormatRail";

const ASPECTS: CompositionAspect[] = ["9:16", "1:1", "16:9"];

function fmt(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
}

export interface CampaignAssetBundle {
  imageUrl: string | null;
  imageAssetId?: string | null; // anchor asset id — used to remix a new campaign
  videoUrl: string | null;
  audioUrl: string | null;
  caption: string;
  /** For the branded PDF one-pager. */
  logoUrl?: string | null;
  brandName?: string | null;
}

export interface CompositorProps {
  /** Campaign context: exports persist as a campaign asset for publishing. */
  campaignId?: string | null;
  /** Campaign music, layered under the exported film. */
  audioUrl?: string | null;
  /** Every asset the campaign generated — surfaced in the assets tray. */
  assets?: CampaignAssetBundle;
  onExported?: (url: string) => void;
}

/**
 * The layered compositor (docs/tenfold-compositor-brief.md §4): canvas preview
 * with drag-to-position, timeline-lite transport, aspect presets, and the
 * layer stack + property controls. Load a doc into useCompositorStore first.
 */
export function Compositor({
  campaignId,
  audioUrl,
  assets,
  onExported,
}: CompositorProps = {}) {
  const doc = useCompositorStore((s) => s.doc);
  const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
  const setAspect = useCompositorStore((s) => s.setAspect);
  const addLayer = useCompositorStore((s) => s.addLayer);
  const replaceLayer = useCompositorStore((s) => s.replaceLayer);
  const load = useCompositorStore((s) => s.load);
  const overrideMode = useCompositorStore((s) => s.overrideMode);
  const setOverrideMode = useCompositorStore((s) => s.setOverrideMode);
  const resetOverride = useCompositorStore((s) => s.resetOverride);

  const params = useParams<{ workspace?: string }>();
  const router = useRouter();
  const canvasRef = useRef<CompositorCanvasHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  // Bring-your-own music: overrides the campaign's audio for the export mix.
  const [audioOverride, setAudioOverride] = useState<string | null>(null);
  const [audioName, setAudioName] = useState<string | null>(null);
  const [audioAck, setAudioAck] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(10);
  const [applyingKit, setApplyingKit] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportingAll, setExportingAll] = useState(false);
  const [fanOut, setFanOut] = useState<FanOutOutput[] | null>(null);
  // Fullscreen finished-look preview (no ghosts, outlines or edit chrome).
  const [isPreview, setIsPreview] = useState(false);
  // Connected social platforms drive the format rail (empty → generic aspects).
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);

  // Autosave: persist the editable doc as it changes so leaving the compositor
  // never loses work — the campaign reloads it on reopen. Debounced, so a drag
  // (many doc updates) coalesces into one write once the user pauses. The first
  // save also persists a freshly-built doc that was never exported.
  const lastSavedRef = useRef<string>("");
  useEffect(() => {
    if (!doc || !campaignId) return;
    const serialized = JSON.stringify(doc);
    if (serialized === lastSavedRef.current) return;
    const t = setTimeout(() => {
      lastSavedRef.current = serialized;
      void api("/api/compositions/save", {
        method: "POST",
        body: JSON.stringify({ doc, campaignId }),
        workspaceSlug: params.workspace,
      }).catch(() => {
        lastSavedRef.current = ""; // let the next change retry
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [doc, campaignId, params.workspace]);

  useEffect(() => {
    const slug = params.workspace;
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api("/api/social/profiles", { workspaceSlug: slug });
        if (!res.ok) return;
        const data = (await res.json()) as { platform: string }[];
        if (!cancelled) setConnectedPlatforms(data.map((p) => p.platform));
      } catch {
        // Lab mode / offline: FormatRail falls back to the generic aspect trio.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.workspace]);

  // Stable identity so FormatRail's effects don't loop on every render.
  const rail = useMemo(
    () => railFormats(connectedPlatforms),
    [connectedPlatforms],
  );

  useEffect(() => {
    if (!isPreview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsPreview(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPreview]);

  const onTick = useCallback((t: number, d: number) => {
    setTime(t);
    if (d > 0 && Number.isFinite(d)) setDuration(d);
  }, []);
  const onEnded = useCallback(() => setPlaying(false), []);

  if (!doc) return null;
  const selected = doc.layers.find((l) => l.id === selectedLayerId) ?? null;
  // In override mode the panel shows/edits the current format's effective layer;
  // otherwise the master. (Structural ops like kind-conversion still use the
  // master `selected`.)
  const panelLayer =
    selected && overrideMode
      ? effectiveLayer(selected, doc.aspect, doc.overrides)
      : selected;

  // One-click brand-aware defaults: logo as an end-frame screen-blend layer
  // + tagline caption, from the saved kit (brief §4). Everything it adds is a
  // normal layer, freely tweakable afterwards.
  const applyBrandKit = async () => {
    setApplyingKit(true);
    try {
      const res = await api("/api/brand-kit", {
        workspaceSlug: params.workspace,
      });
      const kit = (await res.json().catch(() => ({}))) as BrandKitInfo;
      const logoSrc = pickKitLogo(kit);
      if (!logoSrc && !kit.tagline?.trim()) {
        toast.error(
          "No brand kit yet — add a logo or tagline in Settings → Brand.",
        );
        return;
      }
      // Measure the logo so it lands at ~45% of frame width.
      const logoWidth = logoSrc
        ? await new Promise<number | null>((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth || null);
            img.onerror = () => resolve(null);
            img.src = logoSrc;
          })
        : null;
      const layers = brandKitLayers(
        kit,
        doc.aspect,
        duration,
        logoWidth,
        useAppStore.getState().composeCaption || null,
      );
      layers.forEach(addLayer);
      toast.success("Brand kit applied — tweak anything you like.");
    } catch {
      toast.error("Couldn't load your brand kit.");
    } finally {
      setApplyingKit(false);
    }
  };

  // Drop the brand logo in as a plain, centred layer the user positions and
  // sizes freely (unlike applyBrandKit's end-card preset). It's a normal image
  // layer — same move/scale/rotate/blend/lock as any other.
  const addBrandLogoLayer = async () => {
    try {
      const res = await api("/api/brand-kit", {
        workspaceSlug: params.workspace,
      });
      const kit = (await res.json().catch(() => ({}))) as BrandKitInfo;
      const logoSrc = pickKitLogo(kit);
      if (!logoSrc) {
        // No brand logo yet — don't dead-end. Take them into Logo Studio to
        // build one, carrying a return path so finishing brings them back here.
        toast("Let’s create your logo first — I’ll bring you right back.", {
          icon: "🎨",
        });
        const returnTo = window.location.pathname + window.location.search;
        router.push(
          `/${params.workspace}/logo?returnTo=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      addLayer({
        id: crypto.randomUUID(),
        kind: "image",
        src: logoSrc,
        pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
        scale: 0.4,
        rotationDeg: 0,
        opacity: 1,
        blend: "normal",
        appearAt: 0,
        disappearAt: null,
        fadeSec: 0,
      });
      toast.success("Brand logo added — drag to place, corner-drag to size.");
    } catch {
      toast.error("Couldn't load your brand logo.");
    }
  };

  const addImageLayer = (file: File) => {
    addLayer({
      id: crypto.randomUUID(),
      kind: "image",
      src: URL.createObjectURL(file),
      pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
      scale: 0.5,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    });
  };

  const addTextLayer = () => {
    addLayer({
      id: crypto.randomUUID(),
      kind: "text",
      text: "Your caption here",
      font: "Inter",
      sizePx: 72,
      color: "#ffffff",
      pos: { mode: "fraction", nx: 0.5, ny: 0.85 },
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0.5,
    });
  };

  // Drop a campaign asset onto the canvas from the assets tray.
  const addAnchorImageLayer = (src: string) => {
    addLayer({
      id: crypto.randomUUID(),
      kind: "image",
      src,
      pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
      scale: 0.6,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    });
    toast.success("Image added — drag to place, corner-drag to size.");
  };

  const addCaptionLayer = (text: string) => {
    addLayer({
      id: crypto.randomUUID(),
      kind: "text",
      text,
      font: "Inter",
      sizePx: 56,
      color: "#ffffff",
      pos: { mode: "fraction", nx: 0.5, ny: 0.85 },
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0.5,
    });
    toast.success("Caption added as a text layer.");
  };

  // Remix: start a NEW campaign seeded with the anchor image (no credits) and
  // open it at the expand step to generate fresh video/music/caption from it.
  const remixFromImage = async () => {
    if (!assets?.imageAssetId) return;
    try {
      const res = await api("/api/campaigns/from-asset", {
        method: "POST",
        body: JSON.stringify({ assetId: assets.imageAssetId }),
        workspaceSlug: params.workspace,
      });
      const data = (await res.json().catch(() => ({}))) as {
        campaignId?: string;
        campaignName?: string;
        asset?: Parameters<
          ReturnType<typeof useAppStore.getState>["loadCampaign"]
        >[0]["imageAssets"][number];
        error?: string;
      };
      if (!res.ok || !data.campaignId || !data.asset) {
        throw new Error(data.error ?? "Couldn't start a remix");
      }
      useAppStore.getState().loadCampaign({
        id: data.campaignId,
        name: data.campaignName ?? "Remix",
        current_step: 3,
        anchor_asset_id: data.asset.id,
        expansion_data: {},
        imageAssets: [data.asset],
        compositionId: null,
      });
      toast.success("New campaign started from your image — generate away.");
      router.push(`/${params.workspace}`);
    } catch (err) {
      toast.error((err as Error).message ?? "Remix failed");
    }
  };

  // Everything a layer keeps when its kind is switched: position, transform,
  // blend, timing and effects.
  const baseOf = (l: NonNullable<typeof selected>) => ({
    id: l.id,
    pos: l.pos,
    scale: l.scale,
    rotationDeg: l.rotationDeg,
    opacity: l.opacity,
    blend: l.blend,
    appearAt: l.appearAt,
    disappearAt: l.disappearAt,
    fadeSec: l.fadeSec,
    effects: l.effects,
    locked: l.locked,
  });

  const convertToText = () => {
    if (!selected || selected.kind === "text") return;
    replaceLayer(selected.id, {
      ...baseOf(selected),
      kind: "text",
      text: "Your text here",
      font: "Inter",
      sizePx: 72,
      color: "#ffffff",
    });
  };

  const convertToImage = () => {
    if (!selected || selected.kind === "image") return;
    fileRef.current?.click(); // picker completes the conversion
  };

  // Render the composition to MP4 server-side. Local (blob:) sources are
  // uploaded to storage first, and the doc is reloaded with permanent URLs so
  // a second export skips the re-upload.
  const exportMp4 = async () => {
    setExporting(true);
    setExportUrl(null);
    try {
      const hadLocal = [
        doc.background.src,
        ...doc.layers.map((l) => (l.kind === "image" ? l.src : "")),
      ].some((s) => s.startsWith("blob:"));
      const materialized = await materializeDoc(doc, params.workspace);
      if (hadLocal) load(materialized);
      const { url } = await requestExport(materialized, params.workspace, {
        campaignId,
        audioUrl: audioOverride ?? audioUrl,
      });
      setExportUrl(url);
      if (onExported) onExported(url);
      else window.open(url, "_blank");
      toast.success("MP4 exported — all layers baked in.");
    } catch (err) {
      toast.error((err as Error).message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  // Fan-out: render every connected format at once, each with its overrides.
  const fanAspects = Array.from(new Set(rail.map((r) => r.aspect)));
  const exportAllFormats = async () => {
    setExportingAll(true);
    setFanOut(null);
    try {
      const hadLocal = [
        doc.background.src,
        ...doc.layers.map((l) => (l.kind === "image" ? l.src : "")),
      ].some((s) => s.startsWith("blob:"));
      const materialized = await materializeDoc(doc, params.workspace);
      if (hadLocal) load(materialized);
      const outputs = await requestFanOutExport(
        materialized,
        params.workspace,
        fanAspects,
        { campaignId, audioUrl: audioOverride ?? audioUrl },
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

  // Bring-your-own music: upload a track (gated by the rights acknowledgment)
  // and use it as the export mix. The composed MP4 bakes it in, so publish posts
  // it too — no separate wiring needed below.
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingAudio(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("acknowledged", "true");
      if (campaignId) form.append("campaignId", campaignId);
      const res = await api("/api/uploads/audio", {
        method: "POST",
        body: form,
        workspaceSlug: params.workspace,
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed");
      setAudioOverride(data.url);
      setAudioName(file.name.replace(/\.[^.]+$/, "")); // drop the extension
      toast.success("Music added — press play to preview it with the video.");
    } catch (err) {
      toast.error((err as Error).message ?? "Couldn't upload that track.");
    } finally {
      setUploadingAudio(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      {/* ── Canvas + transport (expands to a clean fullscreen preview) ── */}
      <div
        className={
          isPreview
            ? "fixed inset-0 z-50 flex flex-col gap-3 bg-black/95 p-4 sm:p-6"
            : "flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
        }
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          {ASPECTS.map((a) => (
            <button
              key={a}
              onClick={() => setAspect(a)}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                doc.aspect === a
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {a}
            </button>
          ))}

          {!isPreview && (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              <button
                onClick={() => setOverrideMode(!overrideMode)}
                title={
                  overrideMode
                    ? `Edits apply to the ${doc.aspect} format only`
                    : "Edits apply to every format (the master design)"
                }
                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  overrideMode
                    ? "border-amber-500/60 bg-amber-500/10 text-amber-500"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {overrideMode ? `Editing ${doc.aspect} only` : "Editing master"}
              </button>
              {doc.overrides?.[doc.aspect] && (
                <button
                  onClick={() => resetOverride()}
                  title={`Revert ${doc.aspect} to the master layout`}
                  className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  Reset {doc.aspect}
                </button>
              )}
            </>
          )}
          {isPreview ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPreview(false)}
              className="ml-auto h-7 gap-1.5 px-3 text-xs"
            >
              <X className="h-3.5 w-3.5" /> Close preview
            </Button>
          ) : (
            <>
              <label
                className="flex items-center gap-1 text-[11px] text-muted-foreground"
                title="Confirm you own or have licensed this track — social platforms mute copyrighted music."
              >
                <input
                  type="checkbox"
                  checked={audioAck}
                  onChange={(e) => setAudioAck(e.target.checked)}
                  className="h-3 w-3 accent-primary"
                />
                I own the music
              </label>
              <Button
                size="sm"
                variant="outline"
                onClick={() => audioRef.current?.click()}
                disabled={!audioAck || uploadingAudio}
                className="h-7 gap-1.5 px-3 text-xs"
                title="Upload your own cleared music track for the mix"
              >
                {uploadingAudio ? (
                  <Spinner size={14} />
                ) : (
                  <Music className="h-3.5 w-3.5" />
                )}
                Upload my own music
              </Button>
              {audioOverride && (
                <span
                  className="flex max-w-[220px] items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] text-primary"
                  title="Press play to preview this track with the video"
                >
                  <Music className="h-3 w-3 shrink-0" />
                  <span className="truncate">{audioName ?? "Music added"}</span>
                  <span className="shrink-0 text-primary/70">— ▶ preview</span>
                  <button
                    onClick={() => {
                      setAudioOverride(null);
                      setAudioName(null);
                    }}
                    className="shrink-0 text-primary/60 hover:text-primary"
                    title="Remove this track"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <input
                ref={audioRef}
                type="file"
                accept="audio/mpeg,audio/mp3,audio/wav,audio/x-m4a,audio/aac,audio/ogg"
                className="hidden"
                onChange={handleAudioUpload}
              />
              {hasMusicLibrary() && (
                <select
                  onChange={(e) => {
                    const t = MUSIC_LIBRARY.find(
                      (m) => m.id === e.target.value,
                    );
                    if (t) {
                      setAudioOverride(t.url); // library tracks are pre-cleared
                      setAudioName(t.title);
                    }
                  }}
                  defaultValue=""
                  className="h-7 rounded-md border border-border bg-background px-2 text-xs"
                  title="Pick a royalty-free track from the library"
                >
                  <option value="" disabled>
                    Library music…
                  </option>
                  {MUSIC_LIBRARY.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.mood} · {t.title}
                    </option>
                  ))}
                </select>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyBrandKit}
                  disabled={applyingKit}
                  className="h-7 gap-1.5 px-3 text-xs"
                >
                  {applyingKit ? (
                    <Spinner size={14} />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  Apply brand kit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addBrandLogoLayer}
                  title="Drop your brand logo in as a movable, sizable layer"
                  className="h-7 gap-1.5 px-3 text-xs"
                >
                  <Shapes className="h-3.5 w-3.5" />
                  Add logo
                </Button>
                <Button
                  size="sm"
                  onClick={exportMp4}
                  disabled={exporting}
                  className="h-7 gap-1.5 px-3 text-xs"
                  title="Render the finished video (with your music) to an MP4"
                >
                  {exporting ? (
                    <Spinner size={14} />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {exporting ? "Rendering…" : "Export MP4"}
                </Button>
                {fanAspects.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportAllFormats}
                    disabled={exportingAll}
                    className="h-7 gap-1.5 px-3 text-xs"
                    title={`Render all ${fanAspects.length} connected formats at once`}
                  >
                    {exportingAll ? (
                      <Spinner size={14} />
                    ) : (
                      <Layers className="h-3.5 w-3.5" />
                    )}
                    {exportingAll
                      ? "Rendering all…"
                      : `Export all ${fanAspects.length} formats`}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
        {exportUrl && (
          <a
            href={exportUrl}
            target="_blank"
            rel="noopener"
            className="text-xs text-primary hover:underline"
          >
            ↓ Download your MP4 (also opened in a new tab)
          </a>
        )}
        {fanOut && fanOut.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {fanOut.length} formats rendered:
            </span>
            {fanOut.map((o) => (
              <a
                key={o.aspect}
                href={o.url}
                target="_blank"
                rel="noopener"
                className="rounded-full border border-border px-2 py-0.5 text-primary hover:border-primary/50"
              >
                {o.aspect} ↓
              </a>
            ))}
          </div>
        )}

        {!isPreview && (
          <FormatRail
            doc={doc}
            formats={rail}
            activeAspect={doc.aspect}
            onPick={setAspect}
            campaignId={campaignId}
            workspaceSlug={params.workspace}
          />
        )}

        {/* Guarantee a large canvas — at least ~58% of the viewport — so the
            video is a comfortable size to layer on, matching the Compose
            preview. The column scrolls if the floor pushes past the height. */}
        <div className="min-h-[58vh] flex-1">
          <CompositorCanvas
            ref={canvasRef}
            playing={playing}
            cleanPreview={isPreview}
            previewAudio={audioOverride ?? audioUrl ?? null}
            onTick={onTick}
            onEnded={onEnded}
          />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!playing && time >= duration - 0.05) {
                canvasRef.current?.seek(0);
              }
              setPlaying(!playing);
            }}
            className="h-8 w-8 shrink-0 p-0"
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>
          <span className="w-10 shrink-0 text-xs tabular-nums text-muted-foreground">
            {fmt(time)}
          </span>
          <input
            type="range"
            min={0}
            max={duration}
            step={0.05}
            value={Math.min(time, duration)}
            onChange={(e) => {
              canvasRef.current?.seek(+e.target.value);
              setTime(+e.target.value);
            }}
            className="flex-1 accent-primary"
          />
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {fmt(duration)}
          </span>
          {!isPreview && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsPreview(true)}
              title="Fullscreen preview — the finished look, no editing marks"
              className="h-8 w-8 shrink-0 p-0"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Layer stack + properties (scrolls independently of the canvas) ── */}
      {!isPreview && (
        <div className="flex w-full flex-col gap-4 lg:min-h-0 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:pr-1">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              {/* Click "Layers +" to add — then switch its type with the
                Image / Text toggle on the right. */}
              <button
                onClick={addTextLayer}
                title="Add a layer"
                className="flex items-center gap-2 text-sm font-semibold transition-colors hover:text-primary"
              >
                <Layers className="h-4 w-4 text-primary" /> Layers
                <span className="rounded-md border border-primary/40 px-1.5 text-xs text-primary">
                  + add
                </span>
              </button>
              <div className="flex overflow-hidden rounded-md border border-border">
                <button
                  onClick={convertToImage}
                  disabled={!selected}
                  title={
                    selected
                      ? "Turn the selected layer into an image (pick a file)"
                      : "Select a layer first"
                  }
                  className={`flex items-center gap-1 px-2 py-1 text-xs transition-colors disabled:opacity-40 ${
                    selected?.kind === "image"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ImagePlus className="h-3.5 w-3.5" /> Image
                </button>
                <button
                  onClick={convertToText}
                  disabled={!selected}
                  title={
                    selected
                      ? "Turn the selected layer into text"
                      : "Select a layer first"
                  }
                  className={`flex items-center gap-1 border-l border-border px-2 py-1 text-xs transition-colors disabled:opacity-40 ${
                    selected?.kind === "text"
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Type className="h-3.5 w-3.5" /> Text
                </button>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  // Picker completes an image conversion of the selected layer;
                  // with nothing selected it adds a fresh image layer.
                  if (selected) {
                    replaceLayer(selected.id, {
                      ...baseOf(selected),
                      kind: "image",
                      src: URL.createObjectURL(f),
                    });
                  } else {
                    addImageLayer(f);
                  }
                }
                e.target.value = "";
              }}
            />
            <LayerList />
            {assets && (
              <AssetsTray
                assets={assets}
                onAddImage={addAnchorImageLayer}
                onAddText={addCaptionLayer}
                onRemix={assets.imageAssetId ? remixFromImage : undefined}
              />
            )}
          </div>

          {selected ? (
            <div className="rounded-xl border border-border bg-card p-4">
              <p className="mb-3 text-sm font-semibold">Layer properties</p>
              <LayerControls layer={panelLayer ?? selected} />
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-4">
              <p className="mb-1 text-sm font-semibold text-muted-foreground">
                Layer properties
              </p>
              <p className="text-xs text-muted-foreground">
                {doc.layers.length > 0
                  ? "Select a layer above (or click it on the canvas) to edit its size, blend, timing and effects."
                  : "Click “Layers + add” to create your first layer — its size, blend, timing and effect controls will appear here."}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
