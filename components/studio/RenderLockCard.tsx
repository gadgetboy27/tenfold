"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Clapperboard,
  FileText,
  Image as ImageIcon,
  Layers,
  Loader2,
  Lock,
  LockOpen,
} from "lucide-react";
import toast from "react-hot-toast";
import { api } from "@/lib/api";
import {
  renderAndLock,
  requestFanOutExport,
  setAdLocked,
  type FanOutOutput,
} from "@/components/compositor/export-client";
import { renderStillJpeg } from "@/lib/composition/still";
import { docSignature } from "@/lib/composition/signature";
import { downloadCampaignPdf } from "@/lib/compositor/campaign-pdf";
import type { CompositionAspect } from "@/lib/composition/layers";
import { useCompositorStore } from "@/store/useCompositorStore";

/**
 * The Publish page's single place for saving, rendering, locking and
 * unlocking. Every other section only EDITS; nothing outside this card can
 * lock an ad, render it, or re-open it. How the ad looks (shape, layers,
 * words, brand) is changed elsewhere — locked, the stage is read-only there
 * until Unlock is pressed here.
 *
 *  - locked   frozen, and (video) the picked render was made from this stage
 *  - stale    unlocked, or a render exists but the stage differs from it
 *  - none     nothing rendered from this stage yet
 *  - clean    no overlays, so there is nothing to lock — the clip publishes as is
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
  workingImage,
  caption,
  onStatus,
  onRendered,
}: {
  workspaceSlug: string;
  campaignId: string;
  target: "video" | "image";
  musicUrl: string | null;
  /** aspect → platforms that want it, for the selected accounts. */
  platformWants: Map<CompositionAspect, string[]>;
  workingImage: string | null;
  caption: string;
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
  const locked = useCompositorStore((s) => s.locked);
  const overlayCount = layers?.length ?? 0;

  const [status, setStatus] = useState<LockStatus>("checking");
  const [bypass, setBypass] = useState(false);
  const [busy, setBusy] = useState<
    "render" | "lock" | "unlock" | "fan" | "pdf" | null
  >(null);
  const [scale, setScale] = useState<1 | 2>(1);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [fanOut, setFanOut] = useState<FanOutOutput[] | null>(null);
  const [recheck, setRecheck] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Is the picked render the ad on the stage? Debounced: dragging a layer
  // changes the doc every frame and the fingerprint walks the whole thing.
  // (The server also reports the lock flag; AdStage seeds the store with it
  // when a project opens, so only the render match is decided here.)
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
        const mine = docSignature(doc, musicUrl);
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
    musicUrl,
    recheck,
  ]);

  // A render only counts once the ad is frozen: "locked" needs both.
  const effective: LockStatus =
    overlayCount === 0
      ? "clean"
      : bypass
        ? "bypass"
        : target === "image"
          ? locked
            ? "locked"
            : "none"
          : status === "locked" && !locked
            ? "stale"
            : status;
  useEffect(() => onStatus(effective), [effective, onStatus]);

  const run = async (
    kind: NonNullable<typeof busy>,
    fn: () => Promise<void>,
  ) => {
    if (busy) return;
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const render = () =>
    run("render", async () => {
      const doc = useCompositorStore.getState().doc;
      if (!doc) return;
      const out = await renderAndLock(doc, workspaceSlug, {
        campaignId,
        audioUrl: musicUrl,
        scale,
      });
      // Local-file layers were uploaded for the render; bring the stage onto
      // the uploaded copy so a reload doesn't read as an edit.
      if (docSignature(out.materialized) !== docSignature(doc)) {
        useCompositorStore.getState().load(out.materialized);
      }
      setRenderUrl(out.url);
      setBypass(false);
      setRecheck((n) => n + 1);
      toast.success("Rendered and locked — this cut is what publishes");
      onRendered?.();
    });

  // Photos have no render to wait for (the picture is flattened at publish),
  // so locking is just freezing the stage as it is.
  const lockPhoto = () =>
    run("lock", async () => {
      await setAdLocked(
        campaignId,
        true,
        workspaceSlug,
        useCompositorStore.getState().doc,
      );
      toast.success("Locked — your overlays go out baked into the image");
    });

  const unlock = () =>
    run("unlock", async () => {
      await setAdLocked(campaignId, false, workspaceSlug);
      setBypass(false);
      setRecheck((n) => n + 1);
      toast.success(
        "Unlocked — edit it in the other sections, then come back here to lock it again",
        { duration: 7000 },
      );
    });

  const previewStill = () =>
    run("render", async () => {
      const doc = useCompositorStore.getState().doc;
      if (!doc) return;
      const blob = await renderStillJpeg(doc);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
    });

  // Every shape the selected accounts want (or all three), one file each.
  const fanAspects: CompositionAspect[] =
    platformWants.size > 1
      ? [...platformWants.keys()]
      : ["9:16", "1:1", "16:9"];
  const renderEveryShape = () =>
    run("fan", async () => {
      const doc = useCompositorStore.getState().doc;
      if (!doc) return;
      const outputs = await requestFanOutExport(
        doc,
        workspaceSlug,
        fanAspects,
        {
          campaignId,
          audioUrl: musicUrl,
          scale,
        },
      );
      setFanOut(outputs);
      toast.success(`Rendered ${outputs.length} shapes`);
    });

  const onePager = () =>
    run("pdf", async () => {
      await downloadCampaignPdf({
        imageUrl: renderUrl ?? workingImage ?? "",
        caption,
        logoUrl: null,
        brandName: null,
      });
    });

  const badge =
    effective === "locked" ? (
      <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
        <Lock className="h-3 w-3" /> Locked
      </span>
    ) : effective === "stale" ? (
      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
        Out of date — render again
      </span>
    ) : effective === "none" ? (
      <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
        {target === "image" ? "Not locked yet" : "Not rendered yet"}
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
        <CheckCircle2 className="h-3 w-3" /> No overlays — nothing to lock
      </span>
    );

  const unlockButton = locked && (
    <button
      type="button"
      onClick={unlock}
      disabled={!!busy}
      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary/50 disabled:opacity-50"
    >
      {busy === "unlock" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <LockOpen className="h-3.5 w-3.5" />
      )}
      Unlock to edit
    </button>
  );

  const btn =
    "flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15 disabled:opacity-50";

  // ── Photo ─────────────────────────────────────────────────────────────────
  if (target === "image") {
    return (
      <div
        ref={rootRef}
        className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /> Finished
            image
          </p>
          {badge}
        </div>
        <p className="text-[11px] leading-snug text-muted-foreground">
          {overlayCount > 0
            ? "Lock your ad to freeze it. Your overlays are baked into the picture when you publish — preview exactly what will go out below. To change anything, unlock it here and edit in the other sections."
            : "No overlays — the image publishes as it is."}
        </p>
        {overlayCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {!locked && (
              <button
                type="button"
                onClick={lockPhoto}
                disabled={!!busy}
                className={btn}
              >
                {busy === "lock" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
                Lock this ad
              </button>
            )}
            {unlockButton}
            <button
              type="button"
              onClick={previewStill}
              disabled={!!busy || isVideoAd}
              className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary/50 disabled:opacity-50"
            >
              Preview the finished image
            </button>
          </div>
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
        The last step before publishing: your stage — {overlayCount} layer
        {overlayCount === 1 ? "" : "s"}, {aspect ?? "—"}
        {musicUrl ? ", with your music" : ""} — becomes the file that goes out,
        and the ad is frozen so it can&apos;t drift from it. To change anything,
        unlock here, edit in the other sections, then come back and lock again.
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
          {(!locked || effective !== "locked") && (
            <button
              type="button"
              onClick={render}
              disabled={!!busy}
              className={btn}
            >
              {busy === "render" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering…
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  {effective === "stale" ? "Re-render & lock" : "Render & lock"}
                </>
              )}
            </button>
          )}
          {unlockButton}
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value) as 1 | 2)}
            disabled={!!busy}
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

      {/* Extra exports — they used to live in Compose. All rendering is here. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <span className="text-[11px] text-muted-foreground">More exports:</span>
        {fanAspects.length > 1 && (
          <button
            type="button"
            onClick={renderEveryShape}
            disabled={!!busy}
            className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary/50 disabled:opacity-50"
          >
            {busy === "fan" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Layers className="h-3 w-3" />
            )}
            Render every shape ({fanAspects.join(", ")})
          </button>
        )}
        <button
          type="button"
          onClick={onePager}
          disabled={!!busy}
          className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] hover:border-primary/50 disabled:opacity-50"
        >
          {busy === "pdf" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <FileText className="h-3 w-3" />
          )}
          One-pager PDF
        </button>
      </div>
      {fanOut && fanOut.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-muted-foreground">
            {fanOut.length} shapes rendered:
          </span>
          {fanOut.map((o) => (
            <a
              key={o.aspect}
              href={o.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-border px-2 py-0.5 text-primary hover:border-primary/50"
            >
              {o.aspect} ↓
            </a>
          ))}
        </div>
      )}
      <p className="text-[10px] leading-snug text-muted-foreground">
        Free — it composes files you already own.
      </p>
    </div>
  );
}
