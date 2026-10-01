"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Layers,
  Undo2,
  Redo2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Lock,
  Unlock,
  Pause,
  Play,
  Stamp,
  WrapText,
  Maximize2,
  X,
  Combine,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  TRAY_MIME,
  parseTrayItem,
  dropToFractionInMedia,
} from "@/lib/composition/tray";
import { dropTrayItem } from "@/components/studio/adBridge";
import { useAdShortcuts } from "@/components/studio/useAdShortcuts";
import {
  CompositorCanvas as LayeredCanvas,
  type CompositorCanvasHandle,
} from "@/components/compositor/CompositorCanvas";
import { useCompositorStore } from "@/store/useCompositorStore";
import {
  setAdAspect,
  applyBrandKitToAd,
  fitTextToFrame,
  countOutsideSafeArea,
} from "./adBridge";
import { api } from "@/lib/api";
import type {
  CompositionAspect,
  CompositionDoc,
  Layer,
} from "@/lib/composition/layers";
import { combineLayersToImage } from "@/lib/composition/combine";
import { v4 as uuidv4 } from "uuid";

/** The three shapes with their little proportional boxes. Shared with the
 *  Compose pane so the picker reads the same on every screen. */
export const ASPECT_CHIPS: {
  id: CompositionAspect;
  label: string;
  box: string;
}[] = [
  { id: "9:16", label: "9:16", box: "h-6 w-[13.5px]" },
  { id: "1:1", label: "1:1", box: "h-6 w-6" },
  { id: "16:9", label: "16:9", box: "h-[13.5px] w-6" },
];

/**
 * The Ad stage — the permanent centre pane.
 *
 * Unlike every other Studio surface this NEVER unmounts as the user moves
 * between tools: it is the thing being built, and the rail on the right feeds
 * it. Owning the composition doc here (rather than inside the Compositor
 * section, as before) is what makes "everything overlays onto the ad" possible
 * — a generated image chosen in the rail becomes a layer on a canvas that is
 * already on screen.
 *
 * Before a doc exists it shows a placeholder artboard. That's deliberate:
 * `background.src` is a required URL, so an "empty" composition can't be
 * persisted — the first image chosen creates the real doc at whichever aspect
 * was picked here (see adBridge.ts).
 */
export function AdStage({
  campaignId,
  workspaceSlug,
  onPickMusic,
}: {
  campaignId: string | null;
  workspaceSlug: string;
  /** A dropped track is not a layer — it sets what the next render bakes in. */
  onPickMusic?: (url: string) => void;
}) {
  const doc = useCompositorStore((s) => s.doc);
  const pendingAspect = useCompositorStore((s) => s.pendingAspect);
  const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
  const multiSelectedIds = useCompositorStore((s) => s.multiSelectedIds);
  const clearMultiSelect = useCompositorStore((s) => s.clearMultiSelect);
  const combineLayers = useCompositorStore((s) => s.combineLayers);
  const load = useCompositorStore((s) => s.load);
  const reset = useCompositorStore((s) => s.reset);
  const selectLayer = useCompositorStore((s) => s.selectLayer);
  const removeLayer = useCompositorStore((s) => s.removeLayer);
  const moveLayer = useCompositorStore((s) => s.moveLayer);
  const updateLayer = useCompositorStore((s) => s.updateLayer);

  // Keyed on campaignId so switching projects re-mounts this state rather than
  // needing a setState inside the effect below.
  const [loading, setLoading] = useState(!!campaignId);

  // Load this campaign's saved composition, if it has one. No campaign (or no
  // saved doc) simply leaves the placeholder up — not an error state.
  useEffect(() => {
    if (!campaignId) {
      reset();
      return;
    }
    let active = true;
    (async () => {
      try {
        const campRes = await api(`/api/campaigns/${campaignId}`, {
          workspaceSlug,
        });
        if (!campRes.ok) return;
        const camp = (await campRes.json()) as {
          latestCompositionId?: string | null;
        };
        if (!camp.latestCompositionId) return;

        const compRes = await api(
          `/api/compositions/${camp.latestCompositionId}`,
          { workspaceSlug },
        );
        if (!compRes.ok) return;
        const row = (await compRes.json()) as {
          id: string;
          aspect: CompositionAspect;
          background: CompositionDoc["background"];
          layers: Layer[];
          overrides?: CompositionDoc["overrides"];
        };
        // Is this ad frozen? Read BEFORE loading so no edit can slip in
        // between the doc appearing and the lock arriving.
        let isLocked = false;
        try {
          const lockRes = await api(
            `/api/campaigns/${campaignId}/render-lock`,
            {
              workspaceSlug,
            },
          );
          if (lockRes.ok) {
            isLocked =
              ((await lockRes.json()) as { locked?: boolean }).locked === true;
          }
        } catch {
          // Unknown reads as unlocked; the save route still refuses a locked ad.
        }
        if (active) {
          useCompositorStore.getState().setLocked(isLocked);
          load({
            id: row.id,
            aspect: row.aspect,
            background: row.background,
            layers: row.layers,
            overrides: row.overrides,
          });
        }
      } catch {
        if (active) toast.error("Couldn't load this campaign's ad");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      // Switching campaigns must not carry the previous ad's layers across.
      reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, workspaceSlug]);

  // Autosave. The rail mutates the doc from outside this component (addLayer),
  // and the canvas writes drag/resize straight to the store, so there is no
  // single "save" moment to hook — debounce on the doc itself instead.
  //
  // A doc counts as saved only once the server says so. This used to record it
  // as saved BEFORE the request and discard any failure, so one rejected save
  // (rate limit, validation, a payload too big for the proxy) meant the layers
  // were never stored and nothing ever retried — the ad reopened without its
  // text. Now a failure is retried with backoff and said out loud once.
  const adLocked = useCompositorStore((s) => s.locked);
  const lastSavedRef = useRef<string>("");
  const saveFailedRef = useRef(false);
  const [saveRetry, setSaveRetry] = useState(0);
  useEffect(() => {
    // A locked ad is frozen — nothing here may write it; Publish's lock saved it.
    if (!doc || !campaignId || adLocked) return;
    const serialized = JSON.stringify(doc);
    if (serialized === lastSavedRef.current) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      let problem: string | null = null;
      try {
        const res = await api("/api/compositions/save", {
          method: "POST",
          body: JSON.stringify({ doc, campaignId }),
          workspaceSlug,
        });
        if (res.ok) {
          lastSavedRef.current = serialized;
          if (saveFailedRef.current) {
            saveFailedRef.current = false;
            toast.success("Your ad is saved again");
          }
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        problem =
          res.status === 429
            ? "Too many saves at once"
            : (body.error ?? `Save failed (${res.status})`);
      } catch {
        problem = "Couldn't reach the server";
      }
      if (cancelled) return;
      if (!saveFailedRef.current) {
        saveFailedRef.current = true;
        toast.error(
          `Your latest changes aren't saved yet — ${problem}. Retrying…`,
        );
      }
      // Back off, then run this effect again for the same doc.
      setTimeout(() => !cancelled && setSaveRetry((n) => n + 1), 5000);
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [doc, campaignId, workspaceSlug, saveRetry, adLocked]);

  const aspect = doc?.aspect ?? pendingAspect;
  const layers = doc?.layers ?? [];

  const [branding, setBranding] = useState(false);
  const [combining, setCombining] = useState(false);

  /* ── Transport ────────────────────────────────────────────────────────────
     The stage rendered `playing={false}` and offered no way to change it, so a
     video ad was a single frozen frame — you could shape it, brand it and
     letter it without ever watching the thing you were about to publish. The
     canvas has always supported playback (it drives the Compositor's own
     scrubber); it just had no controls here.

     Shown for a video backdrop, OR for a still whose text is animated. An
     image composition has a virtual clock too, but scrubbing a plain still is
     a control that does nothing visible. Once a text block has a read-out
     (Wording → "Read it out"), though, there is something to watch — and
     without these controls the stage never plays, so the words sat there as
     ordinary static text with no way to see the effect. */
  const isVideoAd = doc?.background.kind === "video";
  const hasReadOut = layers.some((l) => l.kind === "text" && !!l.reveal);
  // A camera move or pulse on the backdrop also needs the clock to be seen.
  const fx = doc?.background.treatment;
  const hasBackdropMotion = !!fx && (fx.camera !== "none" || !!fx.pulse);
  const hasMotion = hasReadOut || hasBackdropMotion;
  const showTransport = isVideoAd || hasMotion;
  const canvasRef = useRef<CompositorCanvasHandle>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const undo = useCompositorStore((s) => s.undo);
  const redo = useCompositorStore((s) => s.redo);
  const canUndo = useCompositorStore((s) => s.past.length > 0);
  const canRedo = useCompositorStore((s) => s.future.length > 0);

  // Undo/redo AND delete, shared with Compose — see useAdShortcuts.
  useAdShortcuts();

  /* ── Fullscreen preview ──────────────────────────────────────────────────
     The finished look with no editing chrome around it. Was Compose-only
     (its own canvas, its own toggle); lives here now so every section gets
     it the same way, matching the stage everywhere it appears rather than
     being one more thing Compose did differently. Escape closes it — a
     fullscreen overlay with no keyboard exit is a trap on a laptop with no
     visible chrome. */
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  // The doc's own hint until the video element reports the file's real length.
  const [duration, setDuration] = useState(doc?.background.durationSec ?? 10);

  const onTick = useCallback((t: number, d: number) => {
    setTime(t);
    if (d > 0 && Number.isFinite(d)) setDuration(d);
  }, []);
  const onEnded = useCallback(() => setPlaying(false), []);

  // A new backdrop is a different clip: leave the transport as it was and the
  // scrubber reads against the PREVIOUS file's length until the next tick
  // corrects it, which looks like the control is stuck. Ticking a clip in the
  // project strip lands here, so this covers exactly the flow this stage
  // exists for.
  //
  // Adjusted during render, not in an effect: the change arrives from the
  // zustand store (adBridge, outside React's tree), and resetting in an effect
  // would paint one frame of the new clip against the old clock first. This is
  // React's documented shape for "a prop changed, so derived state must
  // change" — https://react.dev/learn/you-might-not-need-an-effect. No seek()
  // is needed to go with it: the canvas swaps the <video> element's src, and
  // the browser reloads it at currentTime 0 on its own.
  const bgSrc = doc?.background.src ?? null;
  const [lastBgSrc, setLastBgSrc] = useState(bgSrc);
  if (bgSrc !== lastBgSrc) {
    setLastBgSrc(bgSrc);
    setPlaying(false);
    setTime(0);
    setDuration(doc?.background.durationSec ?? 10);
  }

  // How many text boxes / stickers have any part outside the safe margin of
  // this shape. Measured for real (fonts, scale, position, panel padding), so
  // it is async and debounced: dragging changes the doc every frame. Switching
  // shape already fits everything automatically (setAdAspect); this catches the
  // rest — a box the user dragged to the edge, or new wording that grew.
  const [outsideSafe, setOutsideSafe] = useState(0);
  useEffect(() => {
    if (!doc) return;
    let live = true;
    const t = setTimeout(async () => {
      const n = await countOutsideSafeArea();
      if (live) setOutsideSafe(n);
    }, 500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [doc]);
  const overflowing = doc ? outsideSafe : 0;

  // Stamp the workspace's logo and tagline onto the ad. The machinery has
  // always existed (brandKitLayers) but was only reachable from the classic
  // compositor — so the Studio could design a logo it could never apply.
  const applyBrand = async () => {
    setBranding(true);
    try {
      const res = await api("/api/brand-kit", { workspaceSlug });
      const kit = (await res.json().catch(() => ({}))) as {
        logo_url?: string | null;
        logo_dark_url?: string | null;
        tagline?: string | null;
        font_family?: string | null;
        body_font_family?: string | null;
      };
      // The real clip length, not the 10s default: brandKitLayers times its
      // end card off this, so a 30s ad would otherwise flash the logo a third
      // of the way in and hold nothing at the end.
      const outcome = await applyBrandKitToAd(kit, duration);
      if (!outcome.ok) {
        toast.error(
          outcome.reason === "no-ad"
            ? "Put something on the ad first."
            : "No brand logo yet — finish one in Logo & brand, then use it as your brand mark.",
        );
        return;
      }
      toast.success(
        outcome.variant === "only"
          ? "Brand applied"
          : `Brand applied — used the ${outcome.variant} mark for this backdrop`,
      );
    } catch {
      toast.error("Couldn't load your brand kit");
    } finally {
      setBranding(false);
    }
  };

  // "Combine into one panel" (Option A — flatten, one-way). Shift-click on
  // the canvas builds the pending set (multiSelectedIds); this turns it into
  // one new image layer via combineLayersToImage, which reuses the live
  // renderer's own drawLayer so the flattened pixels can't drift from what
  // the canvas actually showed.
  const handleCombine = async () => {
    if (!doc || multiSelectedIds.length < 2) return;
    setCombining(true);
    try {
      const layers = doc.layers.filter((l) => multiSelectedIds.includes(l.id));
      const result = await combineLayersToImage(layers, doc.aspect);
      const newLayer: Layer = {
        id: uuidv4(),
        kind: "image",
        src: result.dataUrl,
        pos: { mode: "fraction", nx: result.nx, ny: result.ny },
        scale: 1,
        rotationDeg: 0,
        opacity: 1,
        blend: "normal",
        appearAt: 0,
        disappearAt: null,
        fadeSec: 0,
      };
      combineLayers(multiSelectedIds, newLayer);
      toast.success(`Combined ${layers.length} layers into one panel`);
    } catch (err) {
      toast.error((err as Error).message ?? "Couldn't combine those layers");
    } finally {
      setCombining(false);
    }
  };

  /**
   * Drop a prepared element straight onto the ad.
   *
   * The whole point of the stage owning the doc is that this is one gesture:
   * the drop position becomes the layer position and the autosave below
   * persists it, so there is no "add" step and no "save" step.
   *
   * The media rect comes from the <canvas> element itself, not from the
   * container — it renders at design resolution under `max-w/h-full`, so the
   * browser letterboxes it and its own bounding box IS the ad. Measuring the
   * container instead puts every drop off by the width of the bars.
   */
  const handleStageDrop = (e: React.DragEvent) => {
    setDragOver(false);
    const item = parseTrayItem(e.dataTransfer.getData(TRAY_MIME));
    if (!item) return; // not ours — let the browser do whatever it would
    e.preventDefault();
    if (useCompositorStore.getState().locked) {
      toast.error("This ad is locked — unlock it in Publish to edit.");
      return;
    }
    const media = stageRef.current
      ?.querySelector("canvas")
      ?.getBoundingClientRect();
    if (!media) return;
    const { nx, ny } = dropToFractionInMedia(e.clientX, e.clientY, media);
    // Each kind lands differently, and the toast says which — a clip REPLACES
    // the backdrop and a track never touches the canvas at all, so reporting
    // all three as "placed" would describe something that didn't happen.
    const outcome = dropTrayItem(item, { nx, ny });
    if (outcome.placed === "music") {
      onPickMusic?.(outcome.src);
      toast.success("Soundtrack set — it's baked in on the next render");
      return;
    }
    if (outcome.placed === "background") {
      toast.success("On the stage — your layers are still on top");
      return;
    }
    if (outcome.placed === "none") {
      // "Nothing happened" is the one outcome worth avoiding: dropping onto an
      // empty artboard is a reasonable thing to try, and silence reads broken.
      toast.error(
        "Pick an image or clip for the ad first — there's nothing to place it on yet.",
      );
      return;
    }
    toast.success(item.kind === "mark" ? "Mark placed" : "Lettering placed");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ── The artboard ── */}
      <div
        className={
          fullscreen
            ? "fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 sm:p-8"
            : "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card p-4"
        }
      >
        {/* Shift-click on the canvas builds this set (amber outlines, drawn by
            lib/composition/render.ts). Shown only while there's something to
            do with it — a plain click elsewhere clears it (see
            CompositorCanvas's onPointerDown), so this banner never outlives
            its own selection. */}
        {!fullscreen && multiSelectedIds.length > 0 && (
          <div className="absolute inset-x-6 top-6 z-10 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] backdrop-blur">
            <Combine className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="text-foreground">
              {multiSelectedIds.length} layer
              {multiSelectedIds.length === 1 ? "" : "s"} marked
              {multiSelectedIds.length === 1 &&
                " — shift-click another to combine"}
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {multiSelectedIds.length >= 2 && (
                <button
                  type="button"
                  onClick={() => void handleCombine()}
                  disabled={combining}
                  className="flex items-center gap-1.5 rounded-md bg-amber-500 px-2 py-1 font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {combining ? "Combining…" : "Combine into one panel"}
                </button>
              )}
              <button
                type="button"
                onClick={clearMultiSelect}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {fullscreen && (
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            title="Close fullscreen (Esc)"
            aria-label="Close fullscreen"
            className="absolute right-6 top-6 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 py-1.5 text-xs text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" /> Close
          </button>
        )}
        {doc ? (
          <div
            ref={stageRef}
            className={`relative h-full w-full rounded-lg transition-shadow ${
              dragOver
                ? "ring-2 ring-primary ring-offset-2 ring-offset-card"
                : ""
            }`}
            onDragOver={(e) => {
              // Only claim the drop for our own payload; preventDefault is what
              // makes this a valid target at all, so doing it unconditionally
              // would swallow files and links the browser should handle.
              if (!e.dataTransfer.types.includes(TRAY_MIME)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              if (!dragOver) setDragOver(true);
            }}
            onDragLeave={(e) => {
              // Only when the pointer actually leaves the stage — dragging over
              // a child fires dragleave for the parent, which would flicker the
              // ring off and on for the whole drag.
              if (e.currentTarget.contains(e.relatedTarget as Node | null))
                return;
              setDragOver(false);
            }}
            onDrop={handleStageDrop}
          >
            {adLocked && !fullscreen && (
              <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-card/90 px-2 py-1 text-[11px] text-amber-600 backdrop-blur dark:text-amber-400">
                <Lock className="h-3 w-3" /> Locked — unlock it in Publish to
                edit
              </div>
            )}
            <LayeredCanvas
              ref={canvasRef}
              playing={playing}
              cleanPreview={fullscreen}
              onTick={onTick}
              onEnded={onEnded}
            />
          </div>
        ) : (
          <EmptyArtboard aspect={aspect} loading={loading} />
        )}
      </div>

      {!fullscreen && showTransport && (
        <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2">
          <button
            type="button"
            onClick={() => {
              // Replay from the top rather than sitting on the last frame —
              // pressing play at the end of a clip must play something.
              if (!playing && time >= duration - 0.05)
                canvasRef.current?.seek(0);
              setPlaying((p) => !p);
            }}
            title={playing ? "Pause" : "Play the ad through"}
            aria-label={playing ? "Pause" : "Play"}
            className="shrink-0 rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {playing ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </button>
          <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
            {fmtTime(time)}
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
            aria-label="Scrub the ad"
            className="min-w-0 flex-1 accent-primary"
          />
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {fmtTime(duration)}
          </span>
        </div>
      )}

      {/* ── Aspect picker + layer stack ── */}
      {!fullscreen && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2">
          <div className="flex items-center gap-1">
            {ASPECT_CHIPS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAdAspect(a.id)}
                title={`${a.label} artboard`}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
                  aspect === a.id
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`${a.box} rounded-[2px] border ${
                    aspect === a.id
                      ? "border-primary"
                      : "border-muted-foreground/50"
                  }`}
                />
                {a.label}
              </button>
            ))}
          </div>

          <span className="h-5 w-px bg-border" />

          {/* Undo/redo. Everything on the ad is placed by hand now — dropped,
            dragged, restyled — and a bin per layer only covers the one action
            that happens to be "add". This covers all of them. */}
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              aria-label="Undo"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Undo2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (⇧⌘Z)"
              aria-label="Redo"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Redo2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <span className="h-5 w-px bg-border" />

          <div className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
            <span title="Shift-click layers on the ad to mark them for Combine">
              <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </span>
            {layers.length === 0 ? (
              <span className="text-xs text-muted-foreground">
                {doc ? "No overlays yet" : "Nothing on the ad yet"}
              </span>
            ) : (
              // Front-most first, matching how a designer reads a stack.
              [...layers].reverse().map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => selectLayer(l.id)}
                  className={`shrink-0 rounded-md px-2 py-1 text-xs transition-colors ${
                    selectedLayerId === l.id
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {l.kind === "text" ? `“${l.text.slice(0, 14)}”` : "Image"}
                </button>
              ))
            )}
          </div>

          {overflowing > 0 && (
            // A warning that is also the fix: lettering outside the safe margin
            // gets clipped on some screens and looks cramped on all of them.
            <button
              type="button"
              disabled={adLocked}
              onClick={async () => {
                const r = await fitTextToFrame();
                const n = r.resized + r.moved;
                setOutsideSafe(await countOutsideSafeArea());
                toast.success(
                  n === 0
                    ? "Nothing needed moving"
                    : `Fitted ${n} text box${n === 1 ? "" : "es"} inside the safe area`,
                );
              }}
              title="Some text sits outside the safe area and may be cut off. This shrinks and nudges it inside, for this shape only. Your wording is left exactly as it is."
              className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-amber-600 transition-colors hover:bg-muted disabled:opacity-40 dark:text-amber-400"
            >
              <WrapText className="h-3.5 w-3.5" />
              {overflowing} outside the safe area — fit
            </button>
          )}

          <button
            type="button"
            onClick={applyBrand}
            disabled={!doc || branding}
            title="Stamp your brand logo and tagline onto this ad"
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
          >
            <Stamp className="h-3.5 w-3.5" />
            {branding ? "Applying…" : "Brand"}
          </button>

          <button
            type="button"
            onClick={() => {
              // A read-out is only worth previewing in motion, so start it
              // from the top rather than showing the frozen first frame.
              if (hasMotion) {
                canvasRef.current?.seek(0);
                setPlaying(true);
              }
              setFullscreen(true);
            }}
            disabled={!doc}
            title="Fullscreen preview"
            aria-label="Fullscreen preview"
            className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-30"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>

          {selectedLayerId && (
            <div className="flex shrink-0 items-center gap-1">
              <IconBtn
                title="Bring forward"
                onClick={() => moveLayer(selectedLayerId, "up")}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                title="Send backward"
                onClick={() => moveLayer(selectedLayerId, "down")}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </IconBtn>
              <IconBtn
                title={
                  layers.find((l) => l.id === selectedLayerId)?.locked
                    ? "Unlock layer"
                    : "Lock layer"
                }
                onClick={() => {
                  const cur = layers.find((l) => l.id === selectedLayerId);
                  updateLayer(selectedLayerId, { locked: !cur?.locked });
                }}
              >
                {layers.find((l) => l.id === selectedLayerId)?.locked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <Unlock className="h-3.5 w-3.5" />
                )}
              </IconBtn>
              <IconBtn
                title="Remove from ad"
                onClick={() => {
                  removeLayer(selectedLayerId);
                  toast.success("Removed from the ad");
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </IconBtn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** m:ss — the clip lengths here are 10-30s, so no hours case exists. */
function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

/** The placeholder artboard, drawn at the picked aspect so choosing a shape is
 *  meaningful before there's anything to show in it. */
function EmptyArtboard({
  aspect,
  loading,
}: {
  aspect: CompositionAspect;
  loading: boolean;
}) {
  const ratio =
    aspect === "9:16" ? "9 / 16" : aspect === "16:9" ? "16 / 9" : "1 / 1";
  return (
    <div
      className="flex max-h-full max-w-full items-center justify-center rounded-xl border-2 border-dashed border-border bg-background/40"
      style={{ aspectRatio: ratio, height: "100%" }}
    >
      <p className="px-6 text-center text-sm text-muted-foreground">
        {loading ? (
          "Loading your ad…"
        ) : (
          <>
            Your ad builds here.
            <br />
            <span className="text-xs text-muted-foreground/70">
              Generate something on the right and choose it to place it.
            </span>
          </>
        )}
      </p>
    </div>
  );
}
