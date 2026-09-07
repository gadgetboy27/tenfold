"use client";

import { useEffect, useState } from "react";
import { Type, Image as ImageIcon, Plus, GripVertical } from "lucide-react";
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
  /** Opens the gallery picker on THIS project's assets before everything else. */
  campaignId?: string | null;
}

interface Mark {
  id: string;
  label: string;
  src: string;
}

export function ElementTray({ workspaceSlug, campaignId }: Props) {
  const [marks, setMarks] = useState<Mark[]>([]);
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
  const [text, setText] = useState("");
  const [font, setFont] = useState<BrandFont>("Montserrat");
  const [fontSize, setFontSize] = useState(64);
  const [color, setColor] = useState("#ffffff");
  const [scrim, setScrim] = useState(true);
  const [weight, setWeight] = useState<400 | 700>(700);

  // Marks come from the two places a workspace's marks actually live: the
  // brand kit (the one that stamps every campaign) and finished Logo Studio
  // projects. Failing quietly is right here — an empty tray is a tray, but an
  // error banner over a side panel is noise on a screen doing another job.
  // Without this the font <select> lists eleven families the browser hasn't
  // fetched, so every option renders in the fallback face and the picker looks
  // broken. Same call the compositor canvas makes; it's idempotent.
  useEffect(() => {
    void ensureBrandFontsLoaded();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const found: Mark[] = [];
      try {
        const res = await api("/api/brand-kit", { workspaceSlug });
        if (res.ok) {
          const kit = await res.json();
          if (typeof kit?.logo_url === "string" && kit.logo_url)
            found.push({
              id: "kit-light",
              label: "Brand mark",
              src: kit.logo_url,
            });
          if (typeof kit?.logo_dark_url === "string" && kit.logo_dark_url)
            found.push({
              id: "kit-dark",
              label: "Brand mark (dark)",
              src: kit.logo_dark_url,
            });
        }
      } catch {
        /* no kit — the Logo Studio marks below may still be there */
      }
      try {
        const res = await api("/api/logo", { workspaceSlug });
        if (res.ok) {
          const data = await res.json();
          for (const p of (data?.projects ?? []) as {
            id: string;
            finalUrl?: string | null;
            thumbnailUrl?: string | null;
            name?: string | null;
          }[]) {
            const src = p.finalUrl ?? p.thumbnailUrl;
            if (src) found.push({ id: p.id, label: p.name || "Logo", src });
          }
        }
      } catch {
        /* ignore */
      }
      if (alive) setMarks(found);
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

  // Brand marks first — they're the ones used on every ad — then whatever was
  // pulled in for this one.
  const tiles = [...marks, ...picked];

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
        Build it here, then drag it onto the ad — it lands where you drop it,
        and you can move, resize and delete it there.
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
            Nothing here yet — pull an image in from your gallery, or set a
            brand logo in Logo &amp; brand.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
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
                  {m.label}
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
