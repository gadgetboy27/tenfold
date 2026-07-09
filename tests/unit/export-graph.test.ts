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
      x: 540,
      y: 1690,
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
      x: 540,
      y: 860,
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
    expect(graph).toContain("x=540-text_w/2:y=1690-text_h/2");
    expect(graph).toContain("alpha='1*clip((t-0)/0.5,0,1)'");
    expect(graph).toContain("enable='between(t,0,4)'");
  });

  it("flattens blend-mode layers onto the neutral canvas then blends", () => {
    const { graph, outLabel } = buildFilterGraph(doc, 4, files);
    // scaled + opacity + fade-in on the layer itself
    expect(graph).toContain("[1:v]format=rgba,scale=iw*0.5:ih*0.5");
    expect(graph).toContain("colorchannelmixer=aa=0.9");
    expect(graph).toContain("fade=t=in:st=2:d=1:alpha=1");
    // no fade-out for a hold-to-end layer
    expect(graph).not.toContain("fade=t=out");
    // screen blend via black (neutral) canvas
    expect(graph).toContain("color=c=black:s=1080x1920:r=30:d=4,format=gbrp");
    expect(graph).toContain("blend=all_mode=screen:enable='between(t,2,4)'");
    expect(outLabel).toBe("m2");
  });

  it("gates an explicit disappearAt with enable and a fade-out", () => {
    const timed: CompositionDoc = {
      ...doc,
      layers: [{ ...doc.layers[1], blend: "normal", disappearAt: 3 }],
    };
    const { graph } = buildFilterGraph(timed, 4, files);
    expect(graph).toContain("fade=t=out:st=2:d=1:alpha=1");
    expect(graph).toContain("overlay=x=540-w/2:y=860-h/2:format=gbrp");
    expect(graph).toContain("enable='between(t,2,3)'");
  });
});
