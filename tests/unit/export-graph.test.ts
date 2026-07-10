import { describe, it, expect } from "vitest";
import { buildFilterGraph, type GraphFiles } from "@/lib/composition/export";
import type { CompositionDoc } from "@/lib/composition/layers";

const doc: CompositionDoc = {
  id: "5b0c8f6e-2a1d-4e3b-9c7f-1234567890ab",
  aspect: "9:16",
  background: { kind: "video", src: "https://example.com/clip.mp4" },
  layers: [
    {
      id: "tagline",
      kind: "text",
      text: "Ten times the brand",
      font: "Montserrat",
      sizePx: 60,
      color: "#ffffff",
      pos: { mode: "fraction", nx: 540 / 1080, ny: 1690 / 1920 },
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0.5,
    },
    {
      id: "logo",
      kind: "image",
      src: "https://example.com/logo.png",
      pos: { mode: "fraction", nx: 540 / 1080, ny: 860 / 1920 },
      scale: 0.5,
      rotationDeg: 0,
      opacity: 0.9,
      blend: "screen",
      appearAt: 2,
      disappearAt: null,
      fadeSec: 1,
    },
  ],
};

const files: GraphFiles = {
  imageInputIdx: new Map([["logo", 1]]),
  textFile: new Map([["tagline", "/tmp/text-0.txt"]]),
};

describe("buildFilterGraph", () => {
  it("cover-fits the background into the design space in planar RGB", () => {
    const { graph } = buildFilterGraph(doc, 4, files);
    expect(graph).toContain(
      "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,format=gbrp[m0]",
    );
  });

  it("renders text with the brand font, centred, faded via alpha expression", () => {
    const { graph } = buildFilterGraph(doc, 4, files);
    expect(graph).toContain("Montserrat.ttf");
    expect(graph).toContain("textfile=/tmp/text-0.txt");
    // legacy fadeSec maps onto a sampled fade-in window in the alpha expr
    expect(graph).toContain("x=540-text_w/2:y=1690-text_h/2");
    expect(graph).toMatch(/alpha='clip\(1\*\(\(if\(between\(t,0,0\.5\)/);
    expect(graph).toContain("enable='between(t,0,4)'");
  });

  it("flattens blend-mode layers onto the neutral canvas then blends", () => {
    const { graph, outLabel } = buildFilterGraph(doc, 4, files);
    // scaled + opacity + animated alpha (geq, per-frame T) on the layer itself
    expect(graph).toContain("[1:v]format=rgba,scale=iw*0.5:ih*0.5");
    expect(graph).toContain("colorchannelmixer=aa=0.9");
    expect(graph).toMatch(/geq=r='r\(X,Y\)'.*a='alpha\(X,Y\)\*clip\(/);
    expect(graph).toContain("between(T,2,3)"); // fade-in window in T
    // screen blend via black (neutral) canvas
    expect(graph).toContain("color=c=black:s=1080x1920:r=30:d=4,format=gbrp");
    expect(graph).toContain("blend=all_mode=screen:enable='between(t,2,4)'");
    expect(outLabel).toBe("m2");
  });

  it("gates an explicit disappearAt with enable and a fade-out window", () => {
    const timed: CompositionDoc = {
      ...doc,
      layers: [{ ...doc.layers[1], blend: "normal", disappearAt: 3 }],
    };
    const { graph } = buildFilterGraph(timed, 4, files);
    // fade-out window (disappearAt 3 - fade 1 = starts at 2) via geq alpha
    expect(graph).toContain("gte(T,2)");
    expect(graph).toContain("overlay=x=540-w/2:y=860-h/2:format=gbrp");
    expect(graph).toContain("enable='between(t,2,3)'");
  });

  it("emits animated overlay position and rotation for motion effects", () => {
    const animated: CompositionDoc = {
      ...doc,
      layers: [
        {
          ...doc.layers[1],
          blend: "normal",
          fadeSec: 0,
          effects: {
            in: { kind: "bounce", durationSec: 1 },
            out: { kind: "spin", durationSec: 0.5 },
            loop: "float",
          },
        },
      ],
    };
    const { graph } = buildFilterGraph(animated, 4, files);
    // bounce animates y: piecewise expr inside the overlay y, plus the
    // ambient float sine term
    expect(graph).toMatch(/y='860-h\/2\+\(\(if\(between\(t,2,3\)/);
    expect(graph).toContain("sin((t-2)*2*PI/3)*10");
    // spin exit animates rotation with the diagonal-padded rotate filter
    expect(graph).toMatch(/rotate=a='0\.000000\+\(\(if\(gte\(t,3\.5\)/);
    expect(graph).toContain("ow='hypot(iw,ih)'");
    // spin exit also fades alpha via geq
    expect(graph).toContain("gte(T,3.5)");
  });

  it("pins an anchor layer to its corner with a constant-pixel margin", () => {
    const pinned: CompositionDoc = {
      ...doc,
      layers: [
        {
          ...doc.layers[1],
          blend: "normal",
          fadeSec: 0,
          pos: { mode: "anchor", anchor: "bottom-right", mx: 0.05, my: 0.05 },
        },
      ],
    };
    const { graph } = buildFilterGraph(pinned, 4, files);
    // min(1080,1920)=1080, margin 0.05 → 54px inset; overlay uses runtime w/h,
    // so the mark's bottom-right corner sits 54px from the frame corner.
    expect(graph).toContain("overlay=x=1026-w:y=1866-h:format=gbrp");
  });

  it("keeps static layers expression-free", () => {
    const still: CompositionDoc = {
      ...doc,
      layers: [
        {
          ...doc.layers[1],
          blend: "normal",
          fadeSec: 0,
          effects: {
            in: { kind: "none", durationSec: 0.8 },
            out: { kind: "none", durationSec: 0.8 },
            loop: "none",
          },
        },
      ],
    };
    const { graph } = buildFilterGraph(still, 4, files);
    expect(graph).toContain("overlay=x=540-w/2:y=860-h/2:format=gbrp");
    expect(graph).not.toContain("geq");
    expect(graph).not.toContain("rotate");
  });
});
