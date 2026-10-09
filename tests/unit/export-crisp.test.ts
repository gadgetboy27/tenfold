import { describe, it, expect } from "vitest";
import { buildFilterGraph, type GraphFiles } from "@/lib/composition/export";
import {
  imageLayerSchema,
  type CompositionDoc,
} from "@/lib/composition/layers";

/**
 * A vector drawn at 2× for a High render is ALREADY at output size. The graph
 * scales every image layer by (layer scale × canvas scale) — apply that to a
 * 2× vector and it comes out 4×. These pin that the two kinds of file are
 * scaled differently, and that nothing else about the layer changes.
 */
const layer = imageLayerSchema.parse({
  id: "logo",
  kind: "image",
  src: "https://example.com/logo.svg",
  pos: { mode: "fraction", nx: 0.2, ny: 0.2 },
  scale: 0.5,
});
const doc: CompositionDoc = {
  id: "d",
  aspect: "1:1",
  background: { kind: "image", src: "https://x.test/bg.png", durationSec: 5 },
  layers: [layer],
};
const files = (crisp?: Set<string>): GraphFiles => ({
  imageInputIdx: new Map([["logo", 1]]),
  textFile: new Map(),
  crisp,
});
const scaleOf = (graph: string) =>
  /\[1:v\]format=rgba,scale=iw\*([\d.]+):ih\*([\d.]+)/.exec(graph)?.[1];

describe("image layer scale at a render scale", () => {
  it("a normal image is scaled by layer scale × canvas scale", () => {
    expect(scaleOf(buildFilterGraph(doc, 5, files(), 2).graph)).toBe("1");
    expect(scaleOf(buildFilterGraph(doc, 5, files(), 1).graph)).toBe("0.5");
  });

  it("a vector already drawn at 2× is scaled by the layer scale ONLY", () => {
    const g = buildFilterGraph(doc, 5, files(new Set(["logo"])), 2).graph;
    expect(scaleOf(g)).toBe("0.5");
  });

  it("so both end the same size: 2× raster × 0.5 = 1× raster × 0.5 × 2", () => {
    const normal =
      Number(scaleOf(buildFilterGraph(doc, 5, files(), 2).graph)) * 200; // 1x raster
    const crisp =
      Number(
        scaleOf(buildFilterGraph(doc, 5, files(new Set(["logo"])), 2).graph),
      ) * 400; // 2x raster
    expect(crisp).toBe(normal);
  });

  it("a layer that isn't in the crisp set is untouched by another's being in it", () => {
    const g = buildFilterGraph(
      doc,
      5,
      files(new Set(["something-else"])),
      2,
    ).graph;
    expect(scaleOf(g)).toBe("1");
  });

  it("no crisp set at all behaves as it always did", () => {
    expect(scaleOf(buildFilterGraph(doc, 5, files(undefined), 2).graph)).toBe(
      "1",
    );
  });
});
