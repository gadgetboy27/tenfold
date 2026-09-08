"use client";

import { useEffect, useState } from "react";
import {
  Type,
  Image as ImageIcon,
  Plus,
  GripVertical,
  Film,
  Music,
  MessageSquare,
} from "lucide-react";
import { api } from "@/lib/api";
import { GalleryPicker } from "@/components/shared/GalleryPicker";
import {
  BRAND_FONTS,
  weightsFor,
  type BrandFont,
} from "@/lib/composition/layers";
import { ensureBrandFontsLoaded } from "@/lib/composition/fonts";
import {
  TRAY_MIME,
  serializeTrayItem,
  type TrayItem,
} from "@/lib/composition/tray";

/**
 * The element tray — prepare a thing, then drop it where you want it.
 *
 * Before this, the only way onto the canvas was an operation that decided
 * placement for you: brand-apply pinned the mark to a corner, the Words step
 * put lettering where the reserved zone was. Both are good defaults and
 * neither is a way to say "no, THERE". Marks and lettering are also the two
 * things people want to fiddle with BEFORE committing them — the wording, the
 * face, whether it needs a scrim — and doing that on the live canvas means
 * every experiment is an edit to the ad.
 *
 * So: compose here, drag over, drop. The drop point becomes the layer's
 * position (see lib/composition/tray.ts for why that's measured against the
 * media and not the container).
 */

interface Props {
  workspaceSlug: string;
  /** Scopes the shelf, and opens the picker on this project's assets first. */
  campaignId?: string | null;
  /**
   * A clip becomes the BACKDROP, never a layer — `layerSchema` is a
   * discriminated union of image|text, so there is no video layer to stack.
   * Handed up so Studio's own videoUrl follows the stage.
   */
  onStageVideo?: (v: { id: string; url: string }) => void;
  /**
   * Music is not a layer either. FFmpeg muxes it at render time, so picking a
   * track sets what the next render bakes in.
   */
  onPickMusic?: (url: string) => void;
  /** The caption, placed as a text layer on the ad. */
  onPlaceCaption?: () => void;
  /** Which track is currently going into the render, for the selected state. */
  musicUrl?: string | null;
}

interface Mark {
  id: string;
  label: string;
  src: string;
}

export function ElementTray({
  workspaceSlug,
  campaignId,
  onStageVideo,
  onPickMusic,
  onPlaceCaption,
  musicUrl,
}: Props) {
  const [gallery, setGallery] = useState<Mark[]>([]);
  /**
   * Everything THIS project has produced, gathered in the room where the ad is
   * assembled.
   *
   * Every tool wrote its output somewhere else — images to the gallery, clips
   * and tracks to the strip, the caption into campaign state, the logo into
   * the brand kit — so building the finished thing meant remembering where
   * each piece had gone. The pieces were never missing; they were scattered.
   *
   * Product shot and Virtual try-on need no special handling: they write
   * ordinary campaign assets, so they arrive in `images` with everything else.
   */
  const [project, setProject] = useState<{
    images: Mark[];
    videos: { id: string; url: string; branded: boolean }[];
    audio: { id: string; url: string }[];
    caption: string;
    anchorId: string | null;
  }>({ images: [], videos: [], audio: [], caption: "", anchorId: null });

  useEffect(() => {
    if (!campaignId) return;
    let alive = true;
    (async () => {
      try {
        const res = await api(`/api/campaigns/${campaignId}/progress`, {
          workspaceSlug,
        });
        if (!res.ok) return;
        const d = (await res.json()) as {
          bundle?: {
            images?: { id: string; url: string; branded: boolean }[];
            videos?: { id: string; url: string; branded: boolean }[];
            audio?: { id: string; url: string }[];
            caption?: string;
            anchorId?: string | null;
          };
        };
        if (!alive) return;
        setProject({
          // Branded exports are excluded: an export is the OUTPUT of this
          // stage, and compositing over pixels that already carry the layers
          // is how you get doubled type — the same rule the strip applies.
          images: (d.bundle?.images ?? [])
            .filter((i) => !i.branded)
            .map((i) => ({ id: i.id, label: "This project", src: i.url })),
          videos: d.bundle?.videos ?? [],
          audio: d.bundle?.audio ?? [],
          caption: d.bundle?.caption ?? "",
          anchorId: d.bundle?.anchorId ?? null,
        });
      } catch {
        /* the gallery and brand shelves below still work */
      }
    })();
    return () => {
      alive = false;
    };
  }, [campaignId, workspaceSlug]);
  /**
   * Images pulled in from the gallery this session.
   *
   * The section used to offer brand marks and nothing else, which answered
   * "stamp your logo" and not the more common "put THAT picture on the ad" —
   * a product cutout, a photo, an earlier render. There was no way to add an
   * arbitrary image as a LAYER anywhere: the strip stages a still as the
   * BACKDROP, and the compositing ops take a second image only as an input to
   * a generation. Kept in state rather than persisted because the tray is a
   * staging shelf, not a collection; the ad itself is what gets saved.
   */
  const [picked, setPicked] = useState<Mark[]>([]);
  const [picking, setPicking] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api("/api/brand-kit", { workspaceSlug });
        if (!res.ok) return;
        const kit = await res.json();
        if (!alive) return;
        const found: Mark[] = [];
        if (typeof kit?.logo_url === "string" && kit.logo_url)
          found.push({
            id: "kit-light",
            label: "Brand mark",
            src: kit.logo_url,
          });
        if (typeof kit?.logo_dark_url === "string" && kit.logo_dark_url)
          found.push({
            id: "kit-dark",
            label: "Dark mark",
            src: kit.logo_dark_url,
          });
        setMarks(found);
      } catch {
        /* no kit yet */
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceSlug]);
  const [text, setText] = useState("");
  const [font, setFont] = useState<BrandFont>("Montserrat");
  const [fontSize, setFontSize] = useState(64);
  const [color, setColor] = useState("#ffffff");
  const [scrim, setScrim] = useState(true);
  const [weight, setWeight] = useState<400 | 700>(700);

  // Without this the font picker lists eleven families the browser hasn't
  // fetched, so every option renders in the fallback face and the control
  // looks broken. Same call the canvas makes; idempotent.
  useEffect(() => {
    void ensureBrandFontsLoaded();
  }, []);

  /**
   * The workspace's images, newest first.
   *
   * This used to list brand marks only — the logo and its dark variant —
   * which answered "stamp your logo" and not the far more common "put THAT
   * picture on the ad". Reported as three mystery squares whose use wasn't
   * obvious, which is fair: two of the three were the same mark in two
   * colours, and neither is what you reach for most of the time.
   *
   * Fails quietly. An empty shelf is a shelf; an error banner over a side
   * panel is noise on a screen doing another job.
   */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api("/api/gallery", { workspaceSlug });
        if (!res.ok) return;
        const data = (await res.json()) as {
          assets?: { id: string; url: string }[];
        };
        if (!alive) return;
        setGallery(
          (data.assets ?? []).map((a) => ({
            id: a.id,
            label: "Image",
            src: a.url,
          })),
        );
      } catch {
        /* nothing to show — the picker below still works */
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceSlug]);

  function startDrag(e: React.DragEvent, item: TrayItem) {
    e.dataTransfer.setData(TRAY_MIME, serializeTrayItem(item));
    // A plain-text mirror so dragging into a text field somewhere else does
    // something sane rather than nothing.
    e.dataTransfer.setData(
      "text/plain",
      item.kind === "lettering" ? item.text : item.label,
    );
    e.dataTransfer.effectAllowed = "copy";
  }

  /**
   * Shelf order, most-relevant first: what you imported for THIS ad, then what
   * this project made, then your brand marks, then the rest of the workspace.
   * De-duped by id, so a project image doesn't appear twice via the gallery.
   */
  const seen = new Set<string>();
  const tiles = [...picked, ...project.images, ...marks, ...gallery].filter(
    (m) => (seen.has(m.id) ? false : (seen.add(m.id), true)),
  );

  const letteringItem: TrayItem = {
    kind: "lettering",
    id: "lettering",
    text: text.trim() || "Your text",
    font,
    fontSize,
    weight,
    color,
    scrim,
  };

  return (
    <div className="flex w-full flex-col gap-5 text-sm">
      <p className="text-xs text-muted-foreground">
        Everything this project has made, in one place. Drag any of it onto the
        ad — it lands where you drop it, and moves, resizes and deletes there.
        The ★ is the still your video was generated from; the others are its
        siblings from the same generation, so swapping the look is one drag.
      </p>

      {/* ── Images ── */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <ImageIcon className="h-3.5 w-3.5" /> Images
          </h3>
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            <Plus className="h-3 w-3" /> From gallery
          </button>
        </div>

        {tiles.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No images yet — generate some, or import one below.
          </p>
        ) : (
          /* Two rows visible, the rest on a scroll. A shelf that grows with
             the gallery pushes the lettering controls off the panel entirely;
             a fixed height keeps the tray a tray. max-h is set from the row
             maths (2 × tile + gap + label) rather than a guessed pixel value,
             so it stays two rows if the tile size changes. */
          <div className="no-scrollbar grid max-h-[13.5rem] grid-cols-3 gap-2 overflow-y-auto pr-0.5">
            {tiles.map((m) => (
              <div key={m.id} className="space-y-1">
                <div
                  draggable
                  onDragStart={(e) =>
                    startDrag(e, {
                      kind: "mark",
                      id: m.id,
                      label: m.label,
                      src: m.src,
                    })
                  }
                  title={`Drag "${m.label}" onto the ad`}
                  /* Checkerboard, not white. Half these are transparent PNGs
                     and SVGs, and a white mark on a white tile is an empty
                     box — which is exactly how three real logos read as
                     three mystery squares. */
                  className="flex aspect-square cursor-grab items-center justify-center rounded-lg border border-border bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] p-2 transition-colors hover:border-primary/60 active:cursor-grabbing"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.src}
                    alt={m.label}
                    draggable={false}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                {/* A visible label, not just a tooltip. A tooltip answers
                    "what is this" only for someone who already suspected. */}
                <p className="truncate text-center text-[10px] leading-tight text-muted-foreground">
                  {/* The one the video was generated from. Without it the six
                      directions are six identical-looking tiles and you cannot
                      tell which became the ad — so swapping to a sibling is a
                      guess rather than a choice. */}
                  {m.id === project.anchorId ? (
                    <span className="text-primary">★ used for the video</span>
                  ) : (
                    m.label
                  )}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <GalleryPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(a) => {
          setPicked((prev) =>
            prev.some((p) => p.id === a.id)
              ? prev
              : [...prev, { id: a.id, label: "From gallery", src: a.url }],
          );
          setPicking(false);
        }}
        workspaceSlug={workspaceSlug}
        campaignId={campaignId}
        title="Pick an image to place"
        hint="It becomes a layer you drag onto the ad — position and size it there."
      />

      {/* ── Clips ──
          Draggable like everything else, because "put this on the ad" is the
          same gesture. What it MEANS differs: a clip replaces the backdrop
          rather than stacking, since layerSchema is image|text and there is no
          video layer. The label says so instead of the drop surprising you. */}
      {project.videos.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Film className="h-3.5 w-3.5" /> Clips
            <span className="font-normal normal-case tracking-normal opacity-70">
              · becomes the backdrop
            </span>
          </h3>
          <div className="grid grid-cols-3 gap-2">
            {project.videos.map((v) => (
              <button
                key={v.id}
                draggable
                onDragStart={(e) =>
                  startDrag(e, {
                    kind: "video",
                    id: v.id,
                    label: v.branded ? "Export" : "Clip",
                    src: v.url,
                  })
                }
                onClick={() => onStageVideo?.({ id: v.id, url: v.url })}
                title="Drag onto the ad, or click — either way it becomes the backdrop"
                className="flex aspect-square cursor-grab items-center justify-center rounded-lg border border-border bg-black/40 text-[10px] text-muted-foreground transition-colors hover:border-primary/60 active:cursor-grabbing"
              >
                <span className="flex flex-col items-center gap-1">
                  <Film className="h-4 w-4" />
                  {v.branded ? "Export" : "Clip"}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── Music ──
          Never appears on the canvas — FFmpeg muxes it at render time — so
          dropping it sets what the next render bakes in. That is the closest
          honest meaning "put this on the ad" can have for audio. */}
      {project.audio.length > 0 && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Music className="h-3.5 w-3.5" /> Music
            <span className="font-normal normal-case tracking-normal opacity-70">
              · baked in on render
            </span>
          </h3>
          <div className="space-y-1.5">
            {project.audio.map((a, i) => (
              <button
                key={a.id}
                draggable
                onDragStart={(e) =>
                  startDrag(e, {
                    kind: "music",
                    id: a.id,
                    label: `Track ${i + 1}`,
                    src: a.url,
                  })
                }
                onClick={() => onPickMusic?.(a.url)}
                title="Drag onto the ad, or click — either way it becomes the soundtrack"
                className={`flex w-full cursor-grab items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition-colors active:cursor-grabbing ${
                  musicUrl === a.url
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <Music className="h-3.5 w-3.5 shrink-0" />
                Track {i + 1}
                {musicUrl === a.url && (
                  <span className="ml-auto text-[10px] text-primary">
                    in the mix
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── The caption ──
          A real text layer, so once it's on the ad it moves, restyles and
          edits in place like any other — double-click to retype it. */}
      {project.caption && (
        <section className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <MessageSquare className="h-3.5 w-3.5" /> Caption
          </h3>
          <button
            type="button"
            draggable
            onDragStart={(e) =>
              startDrag(e, {
                kind: "lettering",
                id: "caption",
                text: project.caption,
                font,
                fontSize,
                weight,
                color,
                scrim,
              })
            }
            onClick={() => onPlaceCaption?.()}
            title="Drag it where you want it, or click to drop it in"
            className="w-full cursor-grab rounded-lg border border-border px-2.5 py-2 text-left text-xs leading-relaxed text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:cursor-grabbing"
          >
            {project.caption.slice(0, 120)}
            {project.caption.length > 120 ? "…" : ""}
          </button>
        </section>
      )}

      {/* ── Lettering ── */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Type className="h-3.5 w-3.5" /> Lettering
        </h3>

        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your wording"
          aria-label="Lettering text"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
        />

        <select
          value={font}
          onChange={(e) => {
            const next = e.target.value as BrandFont;
            setFont(next);
            // A single-weight display face can't honour a stored Bold.
            if (!weightsFor(next).includes(weight)) setWeight(400);
          }}
          aria-label="Lettering font"
          style={{ fontFamily: `"${font}", sans-serif` }}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/60"
        >
          {BRAND_FONTS.map((f) => (
            <option
              key={f}
              value={f}
              style={{ fontFamily: `"${f}", sans-serif` }}
            >
              {f}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <input
            type="range"
            min={16}
            max={200}
            step={2}
            value={fontSize}
            aria-label="Lettering size"
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="flex-1 accent-[var(--primary)]"
          />
          <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {fontSize}
          </span>
          <input
            type="color"
            value={color}
            aria-label="Lettering colour"
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-7 shrink-0 cursor-pointer rounded border"
          />
        </div>

        <div className="flex gap-1">
          {([700, 400] as const).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWeight(w)}
              style={{ fontFamily: `"${font}", sans-serif`, fontWeight: w }}
              className={`flex-1 rounded-lg border px-2 py-1 text-xs transition-colors ${
                weight === w
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {w === 700 ? "Bold" : "Regular"}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={scrim}
            onChange={(e) => setScrim(e.target.checked)}
            className="accent-[var(--primary)]"
          />
          {/* Same reason the FFmpeg caption presets have always drawn a box:
              white lettering over bright footage is unreadable. */}
          Shade behind the text (keeps it readable on bright footage)
        </label>

        {/* The draggable chip IS the preview — what you drag is what lands. */}
        <div
          draggable
          onDragStart={(e) => startDrag(e, letteringItem)}
          title="Drag this onto the ad"
          className="flex cursor-grab items-center gap-2 rounded-lg border border-border bg-[repeating-conic-gradient(#e5e7eb_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] p-3 transition-colors hover:border-primary/60 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span
            className="truncate"
            style={{
              fontFamily: `"${font}", sans-serif`,
              color,
              // Scaled down from design-space px purely so a 200px setting
              // still fits a side panel; the real size goes with the payload.
              fontSize: Math.max(12, Math.min(28, fontSize / 3)),
              fontWeight: weight,
              backgroundColor: scrim ? "rgba(0,0,0,0.45)" : undefined,
              padding: scrim ? "2px 6px" : undefined,
              borderRadius: scrim ? 4 : undefined,
            }}
          >
            {text.trim() || "Your text"}
          </span>
        </div>
      </section>
    </div>
  );
}
