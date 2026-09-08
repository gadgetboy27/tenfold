import { describe, it, expect } from "vitest";
import { buildFilterGraph, type GraphFiles } from "@/lib/composition/export";
import type { CompositionDoc } from "@/lib/composition/layers";

/**
 * The output resolution multiplier.
 *
 * Everything POSITIONAL is a fraction of the canvas, so it scales for free.
 * Everything measured in PIXELS does not, and there are exactly three: an
 * image layer's own scale, a text layer's font size, and the scrim's border
 * width. Miss one and the render is subtly wrong only above 1× — which is
 * precisely where nobody looks.
 *
 * The image-layer case is the trap: FFmpeg's `iw` is the LAYER's own width,
 * not the canvas, so a mark at scale 1 renders at its native pixel size
 * whatever the output resolution is. Double the canvas without doubling this
 * and every mark comes out half-size on the page.
 */

const doc = (): CompositionDoc => ({
  id: "d",
  aspect: "1:1",
  background: { kind: "image", src: "https://x.test/bg.png" },
  layers: [
    {
      id: "img",
      kind: "image",
      src: "https://x.test/mark.png",
      pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    },
    {
      id: "txt",
      kind: "text",
      text: "Hello",
      font: "Inter",
      sizePx: 64,
      color: "#ffffff",
      bg: { color: "#000000", opacity: 0.45, padPx: 20 },
      pos: { mode: "fraction", nx: 0.5, ny: 0.8 },
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    },
  ],
});

// The real GraphFiles shape. Typed rather than cast: an `as never` here hid
// a wrong fixture and turned a compile error into a runtime one.
const files: GraphFiles = {
  imageInputIdx: new Map([["img", 1]]),
  textFile: new Map([["txt", "/tmp/txt.txt"]]),
};

function graphAt(scale: number): string {
  return buildFilterGraph(doc(), 5, files, scale).graph;
}

describe("1× is the design space", () => {
  it("renders the canvas at its declared size", () => {
    expect(graphAt(1)).toContain("scale=1080:1080");
  });

  it("draws text at its declared point size", () => {
    expect(graphAt(1)).toContain("fontsize=64");
  });
});

describe("2× scales every pixel-measured value, not just the canvas", () => {
  it("doubles the canvas", () => {
    expect(graphAt(2)).toContain("scale=2160:2160");
  });

  it("doubles the font size", () => {
    // Half-size type on a double-size canvas is the failure this catches.
    expect(graphAt(2)).toContain("fontsize=128");
  });

  it("doubles the scrim padding so it stays proportional to the type", () => {
    expect(graphAt(2)).toContain("boxborderw=40");
  });

  it("doubles an image layer's scale — `iw` is the LAYER, not the canvas", () => {
    // The trap. Without this a mark renders at native size on a 2× canvas,
    // i.e. half as large relative to the frame.
    expect(graphAt(2)).toContain("scale=iw*2:ih*2");
  });
});

describe("the multiplier is uniform", () => {
  it("every scaled value moves together", () => {
    const g = graphAt(2);
    for (const expected of [
      "scale=2160:2160",
      "fontsize=128",
      "boxborderw=40",
      "scale=iw*2:ih*2",
    ]) {
      expect(g, expected).toContain(expected);
    }
  });
});
