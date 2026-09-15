import {
  BRAND_FONTS,
  weightsFor,
  type StickerEffect,
  type StickerSpec,
} from "./layers";

export { STICKER_EFFECTS, stickerSpecSchema } from "./layers";
export type { StickerEffect, StickerSpec } from "./layers";

/**
 * Sticker text — a "SALE" burst, a price, a stamp. The other kind of type.
 *
 * The Words block is the headline: it says what the ad says, in the brand's
 * face, and the export draws it with FFmpeg's drawtext. drawtext cannot
 * rotate, flip, glow or stroke, which is precisely what a sticker is for. So
 * a sticker is NOT a text layer. It is rasterised here, in the browser, with
 * the canvas 2D context — glow via shadowBlur, neon via a stroked halo, flips
 * via a negative scale — into a transparent PNG, and lives on the ad as an
 * ordinary IMAGE layer carrying its spec. Everything the stage already does
 * to an image (drag, pull, rotate, per-format nudge, overlay-with-rotation in
 * the export) then applies, and the pixels the user saw are the pixels that
 * ship. The spec stays on the layer so the sticker remains editable: change
 * the text and it is re-rasterised in place.
 */

/** Display faces first — a sticker wants character; text faces after. */
export const STICKER_FONTS = [
  "Anton",
  "Bebas Neue",
  "Alfa Slab One",
  "Bungee",
  "Rye",
  "Special Elite",
  ...BRAND_FONTS.filter(
    (f) =>
      ![
        "Anton",
        "Bebas Neue",
        "Alfa Slab One",
        "Bungee",
        "Rye",
        "Special Elite",
      ].includes(f),
  ),
] as const;

export const DEFAULT_STICKER: StickerSpec = {
  text: "SALE",
  font: "Anton",
  weight: 700,
  color: "#ffffff",
  effect: "neon",
  effectColor: "#ff2d95",
  flipH: false,
  flipV: false,
};

/** Rasterised at this glyph size; the layer's `scale` does the rest. */
export const STICKER_FONT_PX = 200;

/**
 * How far the effect reaches outside the glyphs, so the PNG has room for it.
 * Pure, so the padding rule — and therefore the sticker's box on the stage —
 * is testable without a canvas.
 */
export function stickerPadding(effect: StickerEffect, fontPx: number): number {
  switch (effect) {
    case "glow":
      return Math.round(fontPx * 0.35);
    case "neon":
      return Math.round(fontPx * 0.4);
    case "shadow":
      return Math.round(fontPx * 0.2);
    case "outline":
      return Math.round(fontPx * 0.12);
    default:
      return Math.round(fontPx * 0.06);
  }
}

/** Weight a face can really render — a display face has only its one cut. */
export function stickerWeight(spec: Pick<StickerSpec, "font" | "weight">) {
  return weightsFor(spec.font).includes(spec.weight) ? spec.weight : 400;
}

export interface StickerRaster {
  /** PNG data URL — the image layer's `src`. */
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Draw the sticker. Browser only (needs a 2D context and the loaded faces —
 * call ensureBrandFontsLoaded first). The order of operations is the effect:
 *
 *   shadow  — one offset blurred pass, then the glyphs
 *   glow    — the glyphs drawn three times with a wide blurred shadow in the
 *             effect colour (each pass adds intensity), then once clean
 *   neon    — a thick stroked halo in the effect colour with a wide blur,
 *             twice, then a tight blur, then a pale core: a lit tube
 *   outline — a stroke in the effect colour under the fill
 */
export function rasterizeSticker(spec: StickerSpec): StickerRaster {
  const weight = stickerWeight(spec);
  const font = `${weight} ${STICKER_FONT_PX}px "${spec.font}", sans-serif`;
  const pad = stickerPadding(spec.effect, STICKER_FONT_PX);

  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const m = measure.measureText(spec.text);
  const textW = Math.ceil(m.width);
  const ascent = Math.ceil(m.actualBoundingBoxAscent || STICKER_FONT_PX * 0.8);
  const descent = Math.ceil(
    m.actualBoundingBoxDescent || STICKER_FONT_PX * 0.2,
  );

  const width = textW + pad * 2;
  const height = ascent + descent + pad * 2;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Flips are baked into the pixels — the export has no flip, so the PNG is
  // the only place they can live and still ship.
  ctx.translate(width / 2, height / 2);
  ctx.scale(spec.flipH ? -1 : 1, spec.flipV ? -1 : 1);
  ctx.translate(-width / 2, -height / 2);

  const x = width / 2;
  const y = pad + ascent;
  const glyph = () => ctx.fillText(spec.text, x, y);

  ctx.fillStyle = spec.color;
  switch (spec.effect) {
    case "shadow": {
      ctx.save();
      ctx.shadowColor = spec.effectColor;
      ctx.shadowBlur = STICKER_FONT_PX * 0.08;
      ctx.shadowOffsetX = STICKER_FONT_PX * 0.05;
      ctx.shadowOffsetY = STICKER_FONT_PX * 0.05;
      glyph();
      ctx.restore();
      glyph();
      break;
    }
    case "glow": {
      ctx.save();
      ctx.shadowColor = spec.effectColor;
      ctx.shadowBlur = STICKER_FONT_PX * 0.25;
      glyph();
      glyph();
      glyph();
      ctx.restore();
      glyph();
      break;
    }
    case "neon": {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.strokeStyle = spec.effectColor;
      ctx.lineWidth = STICKER_FONT_PX * 0.06;
      ctx.shadowColor = spec.effectColor;
      ctx.shadowBlur = STICKER_FONT_PX * 0.3;
      ctx.strokeText(spec.text, x, y);
      ctx.strokeText(spec.text, x, y);
      ctx.shadowBlur = STICKER_FONT_PX * 0.08;
      ctx.strokeText(spec.text, x, y);
      ctx.restore();
      // The tube's core — the sticker colour, lit from inside.
      ctx.save();
      ctx.shadowColor = spec.color;
      ctx.shadowBlur = STICKER_FONT_PX * 0.04;
      glyph();
      ctx.restore();
      break;
    }
    case "outline": {
      ctx.save();
      ctx.lineJoin = "round";
      ctx.strokeStyle = spec.effectColor;
      ctx.lineWidth = STICKER_FONT_PX * 0.1;
      ctx.strokeText(spec.text, x, y);
      ctx.restore();
      glyph();
      break;
    }
    default:
      glyph();
  }

  return { dataUrl: canvas.toDataURL("image/png"), width, height };
}
