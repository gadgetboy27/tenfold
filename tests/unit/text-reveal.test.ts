import { describe, expect, it } from "vitest";
import {
  litCount,
  prefixByCount,
  revealDrawPlan,
  revealEnd,
  revealProgress,
  revealSteps,
  revealTimes,
  revealUnitCount,
} from "@/lib/composition/reveal";
import { motionAt } from "@/lib/composition/effects";
import { buildFilterGraph, type GraphFiles } from "@/lib/composition/export";
import type { CompositionDoc, TextLayer } from "@/lib/composition/layers";

const reveal = {
  mode: "karaoke" as const,
  delaySec: 1,
  durationSec: 4,
  holdSec: 2,
  end: "flash" as const,
  lineWidths: [300, 200],
};

const layer = (over: Partial<TextLayer> = {}): TextLayer => ({
  id: "w",
  kind: "text",
  text: "big summer sale\nnow on",
  font: "Inter",
  sizePx: 60,
  color: "#ffffff",
  pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
  scale: 1,
  rotationDeg: 0,
  opacity: 1,
  blend: "normal",
  appearAt: 0,
  disappearAt: null,
  fadeSec: 0,
  reveal,
  ...over,
});

describe("timing", () => {
  it("delay → read → hold → end", () => {
    expect(revealTimes(0, reveal)).toMatchObject({
      readStart: 1,
      readEnd: 5,
      endStart: 7,
    });
  });
  it("waits out the delay, then runs 0→1", () => {
    expect(revealProgress(0, reveal, 0.5)).toBe(-1);
    expect(revealProgress(0, reveal, 3)).toBe(0.5);
    expect(revealProgress(0, reveal, 99)).toBe(1);
  });
  it("lights the first unit immediately and all of them at the end", () => {
    expect(litCount(-1, 5)).toBe(0);
    expect(litCount(0, 5)).toBe(1);
    expect(litCount(1, 5)).toBe(5);
  });
});

describe("prefixes", () => {
  const t = "big summer sale\nnow on";
  it("counts words and letters", () => {
    expect(revealUnitCount(t, "words")).toBe(5);
    expect(revealUnitCount("abc", "typewriter")).toBe(3);
  });
  it("cuts on word boundaries and keeps line breaks", () => {
    expect(prefixByCount(t, "words", 2)).toBe("big summer");
    expect(prefixByCount(t, "words", 4)).toBe("big summer sale\nnow");
    expect(prefixByCount(t, "words", 0)).toBe("");
    expect(prefixByCount(t, "typewriter", 3)).toBe("big");
  });
  it("steps once per word, ending on the whole text", () => {
    const steps = revealSteps(t, "words", 1, 4);
    expect(steps.map((s) => s.count)).toEqual([1, 2, 3, 4, 5]);
    expect(steps.at(-1)?.count).toBe(5);
  });
  it("caps the number of steps for long typewriter text", () => {
    const steps = revealSteps("x".repeat(400), "typewriter", 0, 5);
    expect(steps.length).toBeLessThanOrEqual(61);
    expect(steps.at(-1)?.count).toBe(400);
  });
});

describe("end effects", () => {
  const ctx = { W: 1000, H: 1000 };
  it("rest outside the window", () => {
    for (const k of ["flash", "bump", "pulse", "shake"] as const) {
      expect(revealEnd(k, 1, ctx)).toEqual({ dx: 0, dy: 0, alpha: 1 });
    }
  });
  it("each moves something mid-way", () => {
    expect(revealEnd("bump", 0.5, ctx).dy).toBeLessThan(0);
    expect(revealEnd("pulse", 0.25, ctx).alpha).toBeLessThan(1);
    expect(revealEnd("flash", 0.2, ctx).alpha).toBeLessThan(1);
    expect(revealEnd("shake", 0.1, ctx).dx).not.toBe(0);
  });
  it("motionAt reports progress and plays the end effect on time", () => {
    const l = layer();
    expect(motionAt(l, 0.5, 20, { W: 1000, H: 1000 })?.reveal).toBe(-1);
    expect(motionAt(l, 3, 20, { W: 1000, H: 1000 })?.reveal).toBe(0.5);
    const flashing = motionAt(l, 7.2, 20, { W: 1000, H: 1000 });
    expect(flashing?.alpha).toBeLessThan(1);
    expect(motionAt(l, 10, 20, { W: 1000, H: 1000 })?.alpha).toBe(1);
  });
  it("text without a reveal is untouched", () => {
    const m = motionAt(layer({ reveal: undefined }), 3, 20, { W: 1, H: 1 });
    expect(m?.reveal).toBeUndefined();
  });
});

describe("export plan + graph", () => {
  it("plans a dim underlay per line plus a lit prefix per step", () => {
    const plan = revealDrawPlan(layer(), 20)!;
    expect(plan.filter((d) => d.dim)).toHaveLength(2);
    expect(plan.filter((d) => !d.dim).length).toBeGreaterThanOrEqual(5);
    // every window is well-formed and inside the clip
    for (const d of plan) {
      expect(d.to).toBeGreaterThan(d.from);
      expect(d.to).toBeLessThanOrEqual(20);
    }
  });
  it("has no plan without measured widths (static fallback)", () => {
    expect(
      revealDrawPlan(
        layer({ reveal: { ...reveal, lineWidths: undefined } }),
        20,
      ),
    ).toBeNull();
  });

  const doc = (l: TextLayer): CompositionDoc => ({
    id: "d",
    aspect: "1:1",
    background: { kind: "image", src: "http://x/bg.jpg", durationSec: 20 },
    layers: [l],
  });
  it("emits one enable-gated drawtext per plan entry", () => {
    const l = layer();
    const plan = revealDrawPlan(l, 20)!;
    const files: GraphFiles = {
      imageInputIdx: new Map(),
      textFile: new Map([
        ["w", "/t/w.txt"],
        ...plan.map((_, k) => [`w#${k}`, `/t/w-${k}.txt`] as [string, string]),
      ]),
    };
    const { graph } = buildFilterGraph(doc(l), 20, files);
    expect(graph.match(/drawtext=/g)).toHaveLength(plan.length);
    expect(graph).toContain("enable='between(t,");
    expect(graph).toContain("/t/w-0.txt");
  });
  it("adds the transparent scrim draw only when there is a panel", () => {
    const l = layer({ bg: { color: "#000000", opacity: 0.4, padPx: 20 } });
    const plan = revealDrawPlan(l, 20)!;
    const files: GraphFiles = {
      imageInputIdx: new Map(),
      textFile: new Map([
        ["w", "/t/w.txt"],
        ...plan.map((_, k) => [`w#${k}`, `/t/w-${k}.txt`] as [string, string]),
      ]),
    };
    const { graph } = buildFilterGraph(doc(l), 20, files);
    expect(graph.match(/drawtext=/g)).toHaveLength(plan.length + 1);
    expect(graph).toContain("fontcolor=0x000000@0");
    expect(graph).toContain("box=1");
  });
});
