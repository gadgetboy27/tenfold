import { describe, expect, it } from "vitest";
import {
  backdropFilterChain,
  backdropMotion,
  isNeutral,
  NEUTRAL_TREATMENT,
  vignetteAngle,
} from "@/lib/composition/treatment";
import { buildFilterGraph, type GraphFiles } from "@/lib/composition/export";
import { docSignature } from "@/lib/composition/signature";
import type {
  BackdropTreatment,
  CompositionDoc,
} from "@/lib/composition/layers";

const tr = (over: Partial<BackdropTreatment> = {}): BackdropTreatment => ({
  ...NEUTRAL_TREATMENT,
  ...over,
});

describe("neutral", () => {
  it("does nothing and costs nothing", () => {
    expect(isNeutral(undefined)).toBe(true);
    expect(isNeutral(tr())).toBe(true);
    expect(backdropFilterChain(tr(), 10, 1080, 1080)).toBe("");
    expect(backdropMotion(undefined, 3, 10)).toEqual({ zoom: 1, panX: 0 });
  });
  it("any single effect makes it non-neutral", () => {
    for (const o of [
      { look: "warm" },
      { grain: 0.2 },
      { vignette: 0.3 },
      { camera: "zoom-in" },
      { pulse: { bpm: 120, strength: 0.05 } },
    ]) {
      expect(isNeutral(tr(o as Partial<BackdropTreatment>))).toBe(false);
    }
  });
});

describe("camera motion", () => {
  it("zooms in across the clip and never below 1", () => {
    const t = tr({ camera: "zoom-in", cameraAmount: 0.2 });
    expect(backdropMotion(t, 0, 10).zoom).toBe(1);
    expect(backdropMotion(t, 5, 10).zoom).toBeCloseTo(1.1);
    expect(backdropMotion(t, 10, 10).zoom).toBeCloseTo(1.2);
  });
  it("zooms out in reverse", () => {
    const t = tr({ camera: "zoom-out", cameraAmount: 0.2 });
    expect(backdropMotion(t, 0, 10).zoom).toBeCloseTo(1.2);
    expect(backdropMotion(t, 10, 10).zoom).toBe(1);
  });
  it("drifts across the spare room, left-to-right or the reverse", () => {
    const right = tr({ camera: "drift-right" });
    expect(backdropMotion(right, 0, 10).panX).toBe(-1);
    expect(backdropMotion(right, 10, 10).panX).toBe(1);
    const left = tr({ camera: "drift-left" });
    expect(backdropMotion(left, 0, 10).panX).toBe(1);
    expect(backdropMotion(left, 10, 10).panX).toBe(-1);
  });
  it("a punch-in lands quickly and then holds", () => {
    const t = tr({ camera: "punch", cameraAmount: 0.2 });
    expect(backdropMotion(t, 0.5, 10).zoom).toBeCloseTo(1.2);
    expect(backdropMotion(t, 8, 10).zoom).toBeCloseTo(1.2);
  });
  it("a pulse peaks on the beat and settles before the next", () => {
    const t = tr({ pulse: { bpm: 120, strength: 0.1 } }); // a beat every 0.5s
    expect(backdropMotion(t, 0, 10).zoom).toBeCloseTo(1.1);
    expect(backdropMotion(t, 0.45, 10).zoom).toBeLessThan(1.01);
    expect(backdropMotion(t, 0.5, 10).zoom).toBeCloseTo(1.1);
  });
});

describe("export filter chain", () => {
  it("builds scale+crop for motion and the look/grain/vignette after it", () => {
    const chain = backdropFilterChain(
      tr({ look: "warm", grain: 0.4, vignette: 0.5, camera: "zoom-in" }),
      10,
      1080,
      1080,
    );
    const order = [
      "scale=w=",
      "crop=1080:1080",
      "eq=",
      "noise=",
      "vignette=",
    ].map((k) => chain.indexOf(k));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order); // camera → look → grain → vignette
  });
  it("skips the zoom filters when nothing moves", () => {
    expect(
      backdropFilterChain(tr({ look: "noir" }), 10, 1080, 1080),
    ).not.toContain("scale=");
  });
  it("a stronger vignette is a tighter lens angle", () => {
    expect(vignetteAngle(1)).toBeLessThan(vignetteAngle(0.2));
  });
});

describe("in the full graph", () => {
  const doc = (treatment?: BackdropTreatment): CompositionDoc => ({
    id: "d",
    aspect: "1:1",
    background: { kind: "video", src: "https://x/v.mp4", treatment },
    layers: [],
  });
  const files: GraphFiles = { imageInputIdx: new Map(), textFile: new Map() };

  it("is untouched when there is no treatment", () => {
    const { graph } = buildFilterGraph(doc(), 10, files);
    expect(graph).toContain("format=gbrp[m0]");
    expect(graph).not.toContain("eval=frame");
  });
  it("sits between the cover-fit and the first layer, on the backdrop only", () => {
    const { graph } = buildFilterGraph(
      doc(tr({ look: "teal", camera: "zoom-in" })),
      10,
      files,
    );
    expect(graph).toMatch(
      /format=gbrp,scale=w='iw\*.*eval=frame,crop=1080:1080.*colorbalance.*\[m0\]/,
    );
  });
  it("changes the render fingerprint, so a stale lock is noticed", () => {
    const a = docSignature(doc());
    const b = docSignature(doc(tr({ look: "warm" })));
    expect(a).not.toBe(b);
  });
});
