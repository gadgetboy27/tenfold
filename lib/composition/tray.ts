import { SUPPORTED_FONTS, type SupportedFont } from "@/lib/logo/font-list";

/**
 * What a tray item carries across a drag, and how a drop becomes a layer.
 *
 * Kept out of the components so the arithmetic that turns a mouse position into
 * a layer position is testable without a DOM — it is the part most likely to be
 * quietly wrong, and "the logo landed somewhere else" is exactly the kind of
 * bug you argue with rather than notice.
 */

export type TrayItem =
  | { kind: "mark"; id: string; label: string; src: string }
  | {
      kind: "lettering";
      id: string;
      text: string;
      font: SupportedFont;
      fontSize: number;
      color: string;
      scrim: boolean;
    };

/**
 * The drag payload's MIME type.
 *
 * A custom type rather than "text/plain": the canvas must be able to tell one
 * of our tray items from a file, a URL, or selected text dragged in from
 * another window, and accepting any of those would silently produce a layer
 * nobody asked for.
 */
export const TRAY_MIME = "application/x-prettymuch-tray-item";

export function serializeTrayItem(item: TrayItem): string {
  return JSON.stringify(item);
}

/** Never throws — a malformed or foreign payload is simply "not ours". */
export function parseTrayItem(raw: string | null | undefined): TrayItem | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as TrayItem;
    if (v?.kind === "mark" && typeof v.src === "string" && v.src) return v;
    if (v?.kind === "lettering" && typeof v.text === "string") {
      return {
        ...v,
        // A font that isn't renderable downstream would look right on the
        // canvas and wrong in the export — same rule as the logo lockup.
        font: (SUPPORTED_FONTS as readonly string[]).includes(v.font)
          ? v.font
          : "Montserrat",
      };
    }
    return null;
  } catch {
    return null;
  }
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where a drop landed, as a 0..1 fraction of the MEDIA — not of the container.
 *
 * The canvas is letterboxed inside its container (`containRect`), so measuring
 * against the container puts every drop off by the size of the bars: drop on
 * the visual centre of a 9:16 ad in a wide container and the layer lands right
 * of centre. Fractions are relative to the media because that is what
 * `layerPositionSchema`'s fraction mode means.
 *
 * Clamped to a small inset rather than 0..1: a layer centred exactly on the
 * edge is half outside the frame, which reads as "it vanished" and cannot be
 * grabbed again to fix.
 */
export function dropToFraction(
  clientX: number,
  clientY: number,
  containerRect: Rect,
  media: Rect,
  inset = 0.02,
): { nx: number; ny: number } {
  return dropToFractionInMedia(
    clientX,
    clientY,
    {
      left: containerRect.left + media.left,
      top: containerRect.top + media.top,
      width: media.width,
      height: media.height,
    },
    inset,
  );
}

/**
 * The same answer from a media rect already in CLIENT coordinates.
 *
 * Preferred wherever the media is a real element, because it needs no
 * arithmetic to be wrong about: the `<canvas>` in components/compositor renders
 * at design resolution with `max-w-full max-h-full`, so the browser letterboxes
 * it and `getBoundingClientRect()` IS the media rect — exactly, including any
 * border, padding or transform in between. Recomputing it from the container
 * and an aspect ratio reproduces work the browser has already done, and is one
 * stale layout away from disagreeing with what the user sees.
 */
export function dropToFractionInMedia(
  clientX: number,
  clientY: number,
  media: Rect,
  inset = 0.02,
): { nx: number; ny: number } {
  const clamp = (v: number) => Math.min(1 - inset, Math.max(inset, v));
  return {
    nx: clamp(media.width > 0 ? (clientX - media.left) / media.width : 0.5),
    ny: clamp(media.height > 0 ? (clientY - media.top) / media.height : 0.5),
  };
}
