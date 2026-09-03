"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Layers,
  Trash2,
  ChevronUp,
  ChevronDown,
  Lock,
  Unlock,
  Pause,
  Play,
  Stamp,
  WrapText,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  CompositorCanvas as LayeredCanvas,
  type CompositorCanvasHandle,
} from "@/components/compositor/CompositorCanvas";
import { useCompositorStore } from "@/store/useCompositorStore";
import {
  setAdAspect,
  applyBrandKitToAd,
  refitAdText,
  countOverflowingText,
} from "./adBridge";
import { api } from "@/lib/api";
import type {
  CompositionAspect,
  CompositionDoc,
  Layer,
} from "@/lib/composition/layers";

const ASPECTS: { id: CompositionAspect; label: string; box: string }[] = [
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
}: {
  campaignId: string | null;
  workspaceSlug: string;
}) {
  const doc = useCompositorStore((s) => s.doc);
  const pendingAspect = useCompositorStore((s) => s.pendingAspect);
  const selectedLayerId = useCompositorStore((s) => s.selectedLayerId);
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
        if (active) {
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
        workspaceSlug,
      }).catch(() => {});
    }, 1200);
    return () => clearTimeout(t);
  }, [doc, campaignId, workspaceSlug]);

  const aspect = doc?.aspect ?? pendingAspect;
  const layers = doc?.layers ?? [];

  const [branding, setBranding] = useState(false);

  /* ── Transport ────────────────────────────────────────────────────────────
     The stage rendered `playing={false}` and offered no way to change it, so a
     video ad was a single frozen frame — you could shape it, brand it and
     letter it without ever watching the thing you were about to publish. The
     canvas has always supported playback (it drives the Compositor's own
     scrubber); it just had no controls here.

     Shown only for a video backdrop. An image composition has a virtual clock
     too, but scrubbing a still is a control that does nothing visible, and the
     one thing worth animating on it — layer appear/disappear — belongs to the
     Compositor's timeline, not to a stage this size. */
  const isVideoAd = doc?.background.kind === "video";
  const canvasRef = useRef<CompositorCanvasHandle>(null);
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

  // Recomputed from the doc on every render, so the action appears the moment
  // an overflowing layer exists and disappears once it's been fixed. Cheap —
  // it's a character count over at most twenty layers.
  const overflowing = doc ? countOverflowingText() : 0;

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* ── The artboard ── */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card p-4">
        {doc ? (
          <div className="relative h-full w-full">
            <LayeredCanvas
              ref={canvasRef}
              playing={playing}
              onTick={onTick}
              onEnded={onEnded}
            />
          </div>
        ) : (
          <EmptyArtboard aspect={aspect} loading={loading} />
        )}
      </div>

      {isVideoAd && (
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
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2">
        <div className="flex items-center gap-1">
          {ASPECTS.map((a) => (
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

        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
          // Only offered when there's something to fix. Text created before the
          // sizing rules keeps its old size and runs off the frame; this is the
          // deliberate, user-pressed repair rather than a silent rewrite of a
          // saved composition on load.
          <button
            type="button"
            onClick={() => {
              const fixed = refitAdText();
              toast.success(
                fixed === 1
                  ? "Re-fitted 1 text layer"
                  : `Re-fitted ${fixed} text layers`,
              );
            }}
            title="Shrink text that runs off the frame. Your wording and line breaks are left exactly as they are."
            className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs text-amber-600 transition-colors hover:bg-muted dark:text-amber-400"
          >
            <WrapText className="h-3.5 w-3.5" />
            Re-fit text
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
