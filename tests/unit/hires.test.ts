import { describe, it, expect, vi } from "vitest";
import { hiResDoc } from "@/lib/composition/hires";
import { defaultFx } from "@/lib/composition/fx/catalog";
import {
  imageLayerSchema,
  type CompositionDoc,
  type ImageLayer,
} from "@/lib/composition/layers";

/**
 * A sticker is a picture drawn at a fixed size, so a High render would enlarge
 * it and it would go soft next to FFmpeg's crisp text. hiResDoc redraws it at
 * k× and divides its scale by k — net size unchanged, k× the pixels. The
 * invariants that make that safe: it lands exactly where it did, nothing else
 * is touched, and the stage's own doc is never changed.
 */
const sticker = (id: string, over: Record<string, unknown> = {}): ImageLayer =>
  imageLayerSchema.parse({
    id,
    kind: "image",
    src: `https://example.com/${id}.png`,
    pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
    sticker: { text: "SALE", font: "Anton", weight: 700, color: "#ffffff" },
    scale: 0.8,
    ...over,
  });
const logo = (id: string) =>
  imageLayerSchema.parse({
    id,
    kind: "image",
    src: `https://example.com/${id}.svg`,
    pos: { mode: "fraction", nx: 0.2, ny: 0.2 },
    scale: 0.5,
  });

const doc = (
  layers: ImageLayer[],
  over: Partial<CompositionDoc> = {},
): CompositionDoc => ({
  id: "d",
  aspect: "1:1",
  background: { kind: "image", src: "https://example.com/bg.jpg" },
  layers,
  ...over,
});
const raster = vi.fn((_spec: unknown, density: number) => ({
  dataUrl: `data:image/png;base64,HI${density}`,
}));

describe("hiResDoc", () => {
  it("is the same doc at Standard — nothing to redraw", () => {
    const d = doc([sticker("s")]);
    expect(hiResDoc(d, 1, raster)).toBe(d);
    expect(hiResDoc(d, 0, raster)).toBe(d);
  });

  it("is the same doc when there are no stickers", () => {
    const d = doc([logo("l")]);
    expect(hiResDoc(d, 2, raster)).toBe(d);
  });

  it("redraws each sticker at k× and divides its scale by k", () => {
    raster.mockClear();
    const out = hiResDoc(doc([sticker("s", { scale: 0.8 })]), 2, raster);
    const s = out.layers[0] as ImageLayer;
    expect(s.src).toBe("data:image/png;base64,HI2");
    expect(s.scale).toBeCloseTo(0.4, 9);
    expect(raster).toHaveBeenCalledWith(
      expect.objectContaining({ text: "SALE" }),
      2,
    );
  });

  it("the server multiplies by k again, so the sticker lands at its original size", () => {
    const k = 2;
    const out = hiResDoc(doc([sticker("s", { scale: 0.8 })]), k, raster);
    const s = out.layers[0] as ImageLayer;
    expect(s.scale * k).toBeCloseTo(0.8, 9);
  });

  it("leaves every other layer exactly as it was", () => {
    const l = logo("l");
    const out = hiResDoc(doc([l, sticker("s")]), 2, raster);
    expect(out.layers[0]).toBe(l);
  });

  it("never changes the doc it was given — the stage keeps its normal-size pictures", () => {
    const d = doc([sticker("s")]);
    const before = JSON.stringify(d);
    hiResDoc(d, 2, raster);
    expect(JSON.stringify(d)).toBe(before);
  });

  it("keeps the sticker's spec — including its effect — untouched", () => {
    const fx = defaultFx("crumble");
    const d = doc([
      sticker("s", {
        sticker: {
          text: "SALE",
          font: "Anton",
          weight: 700,
          color: "#ffffff",
          fx,
        },
      }),
    ]);
    const s = hiResDoc(d, 2, raster).layers[0] as ImageLayer;
    expect(s.sticker?.fx).toEqual(fx);
    expect(s.sticker?.text).toBe("SALE");
  });

  it("a per-format size nudge REPLACES the scale, so it shrinks too", () => {
    const d = doc([sticker("s"), logo("l")], {
      overrides: {
        "1:1": { s: { scale: 1.2 }, l: { scale: 0.9 } },
        "9:16": { s: { scale: 0.6 } },
      },
    });
    const out = hiResDoc(d, 2, raster);
    expect(out.overrides?.["1:1"]?.s?.scale).toBeCloseTo(0.6, 9);
    expect(out.overrides?.["9:16"]?.s?.scale).toBeCloseTo(0.3, 9);
    // a nudge on something that is NOT a sticker is left alone
    expect(out.overrides?.["1:1"]?.l?.scale).toBe(0.9);
  });

  it("an override that doesn't set a scale is left alone", () => {
    const d = doc([sticker("s")], {
      overrides: { "1:1": { s: { rotationDeg: 15 } } },
    });
    expect(hiResDoc(d, 2, raster).overrides?.["1:1"]?.s).toEqual({
      rotationDeg: 15,
    });
  });

  it("does not touch the original's overrides", () => {
    const d = doc([sticker("s")], {
      overrides: { "1:1": { s: { scale: 1.2 } } },
    });
    hiResDoc(d, 2, raster);
    expect(d.overrides?.["1:1"]?.s?.scale).toBe(1.2);
  });
});
