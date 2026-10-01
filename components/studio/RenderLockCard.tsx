"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clapperboard,
  Image as ImageIcon,
  Loader2,
  Lock,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import { renderAndLock } from "@/components/compositor/export-client";
import { renderStillJpeg } from "@/lib/composition/still";
import { docSignature } from "@/lib/composition/signature";
import type { CompositionAspect } from "@/lib/composition/layers";
import { useCompositorStore } from "@/store/useCompositorStore";

/**
 * Where an ad is rendered and locked — the only place. Everything about HOW
 * the ad looks (shape, layers, words, brand) is done on the other pages; this
 * card turns what is on the stage into the file that publishes and says,
 * truthfully, whether the file matches the stage.
 *
 *  - locked   the picked render was made from exactly this stage
 *  - stale    a render exists but the stage has changed since
 *  - none     nothing rendered from this stage yet
 *  - clean    no overlays, so the clip publishes as it is — nothing to lock
 *  - bypass   the user chose to publish the original clip without overlays
 */
export type LockStatus =
  | "checking"
  | "locked"
  | "stale"
  | "none"
  | "clean"
  | "bypass";

export function RenderLockCard({
  workspaceSlug,
  campaignId,
  target,
  musicUrl,
  platformWants,
  onStatus,
  onRendered,
}: {
  workspaceSlug: string;
  campaignId: string;
  target: "video" | "image";
  musicUrl: string | null;
  /** aspect → platforms that want it, for the selected accounts. */
  platformWants: Map<CompositionAspect, string[]>;
  onStatus: (s: LockStatus) => void;
  /** A render became the publish pick — re-read the project. */
  onRendered?: () => void;
}) {
  const layers = useCompositorStore((s) => s.doc?.layers);
  const overrides = useCompositorStore((s) => s.doc?.overrides);
  const aspect = useCompositorStore((s) => s.doc?.aspect ?? null);
  const isVideoAd = useCompositorStore(
    (s) => s.doc?.background.kind === "video",
  );
  const overlayCount = layers?.length ?? 0;

  const [status, setStatus] = useState<LockStatus>("checking");
  const [bypass, setBypass] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [scale, setScale] = useState<1 | 2>(1);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [recheck, setRecheck] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Is the picked render the ad on the stage? Debounced: dragging a layer
  // changes the doc every frame and the fingerprint walks the whole thing.
  useEffect(() => {
    if (target !== "video") return;
    if (overlayCount === 0) return;
    let live = true;
    // Any edit invalidates a previous verdict at once — a stale "locked" must
    // not be able to authorise a publish in the debounce window below.
    const pending = setTimeout(() => setStatus("checking"), 0);
    const t = setTimeout(async () => {
      try {
        const doc = useCompositorStore.getState().doc;
        if (!doc) return;
        const mine = docSignature(doc);
        const res = await api(`/api/campaigns/${campaignId}/render-lock`, {
          workspaceSlug,
        });
        if (!live) return;
        if (!res.ok) return setStatus("none");
        const d = (await res.json()) as { docSig: string | null };
        setStatus(
          d.docSig === null ? "none" : d.docSig === mine ? "locked" : "stale",
        );
      } catch {
        if (live) setStatus("none");
      }
    }, 600);
    return () => {
      live = false;
      clearTimeout(pending);
      clearTimeout(t);
    };
  }, [
    target,
    campaignId,
    workspaceSlug,
    layers,
    overrides,
    aspect,
    overlayCount,
    recheck,
  ]);

  const effective: LockStatus =
    overlayCount === 0 ? "clean" : bypass ? "bypass" : status;
  useEffect(() => onStatus(effective), [effective, onStatus]);

  const render = async () => {
    const doc = useCompositorStore.getState().doc;
    if (!doc || rendering) return;
    setRendering(true);
    try {
      const out = await renderAndLock(doc, workspaceSlug, {
        campaignId,
        audioUrl: musicUrl,
        scale,
      });
      setRenderUrl(out.url);
      setBypass(false);
      setRecheck((n) => n + 1);
      toast.success("Rendered and locked — this cut is what publishes");
      onRendered?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't render the cut",
      );
    } finally {
      setRendering(false);
    }
  };

  const previewStill = async () => {
    const doc = useCompositorStore.getState().doc;
    if (!doc || previewing) return;
    setPreviewing(true);
    try {
      const blob = await renderStillJpeg(doc);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't build the preview",
      );
    } finally {
      setPreviewing(false);
    }
  };

  const badge =
    effective === "locked" ? (
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <Lock className="h-3 w-3" /> Locked — matches your stage
      </span>
    ) : effective === "stale" ? (
      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
        Out of date — your stage changed after the last render
      </span>
    ) : effective === "none" ? (
      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
        Not rendered yet
      </span>
    ) : effective === "checking" ? (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking…
      </span>
    ) : effective === "bypass" ? (
      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
        Original clip — your overlays will not be in it
      </span>
    ) : (
      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <CheckCircle2 className="h-3 w-3" /> No overlays — nothing to render
      </span>
    );

  // ── Photo: baked in at publish; preview it here ───────────────────────────
  if (target === "image") {
    const flatten = overlayCount > 0;
    return (
      <div
        ref={rootRef}
        className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3"
      >
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /> Finished
          image
        </p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {flatten
            ? "Your overlays are baked into the picture automatically when you publish. Preview exactly what will go out:"
            : "No overlays — the image publishes as it is."}
        </p>
        {flatten && (
          <button
            type="button"
            onClick={previewStill}
            disabled={previewing || isVideoAd}
            className="flex w-fit items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary/50 disabled:opacity-50"
          >
            {previewing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Preview the finished image
          </button>
        )}
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- local blob preview
          <img
            src={preview}
            alt="Finished ad"
            className="max-h-64 w-fit rounded-lg border border-border"
          />
        )}
      </div>
    );
  }

  // ── Video ─────────────────────────────────────────────────────────────────
  const wantedHere = aspect ? platformWants.get(aspect) : undefined;
  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium">
          <Clapperboard className="h-3.5 w-3.5 text-muted-foreground" /> Render
          &amp; lock
        </p>
        {badge}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        This is the last step before publishing: it turns your stage —{" "}
        {overlayCount} layer{overlayCount === 1 ? "" : "s"}, {aspect ?? "—"}
        {musicUrl ? ", with your music" : ""} — into the file that goes out. To
        change the shape, text, stickers or brand, go back to Create, Wording or
        Compose.
      </p>

      {aspect && platformWants.size > 0 && !wantedHere && (
        <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
          Nothing you&apos;ve selected posts in {aspect}. Change the shape on
          the Ad stage if you want a different one.
        </p>
      )}
      {platformWants.size > 1 && (
        <p className="text-[11px] leading-snug text-amber-600 dark:text-amber-400">
          Your accounts want different shapes; one cut can&apos;t be both, so
          the others get it letterboxed.
        </p>
      )}

      {overlayCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={render}
            disabled={rendering}
            className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
          >
            {rendering ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering…
              </>
            ) : (
              <>
                <Lock className="h-3.5 w-3.5" />
                {effective === "locked" ? "Re-render" : "Render & lock"}
              </>
            )}
          </button>
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value) as 1 | 2)}
            disabled={rendering}
            aria-label="Render quality"
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value={1}>Standard</option>
            <option value={2}>High (2×)</option>
          </select>
          {renderUrl && (
            <a
              href={renderUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-primary hover:underline"
            >
              View / download this render
            </a>
          )}
        </div>
      )}

      {overlayCount > 0 && effective !== "locked" && (
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={bypass}
            onChange={(e) => setBypass(e.target.checked)}
          />
          Publish the original clip without my overlays
        </label>
      )}
      <p className="text-[10px] leading-snug text-muted-foreground">
        Free — it composes files you already own.
      </p>
    </div>
  );
}
