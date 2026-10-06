import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { buildFilterGraph, type GraphFiles } from "@/lib/composition/export";
import {
  planPixelFx,
  FX_SUFFIX,
  hasPixelFx,
} from "@/lib/composition/fx/export-plan";
import { defaultFx } from "@/lib/composition/fx/catalog";
import {
  ASPECT_DESIGN,
  imageLayerSchema,
  resolveCenter,
  rotatedHalfExtents,
  type CompositionDoc,
  type ImageLayer,
} from "@/lib/composition/layers";
import type { PixelFx } from "@/lib/composition/fx/types";

/**
 * A sticker with a pixel effect reaches FFmpeg as two ordinary image layers —
 * the still, shown only while the effect isn't playing, and the rendered
 * frames, shown only while it is — so every transform the export already does
 * applies to both. These pin the plan (what each half is, and when it shows),
 * and that the graph FFmpeg gets says the same.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

let SRC: Buffer;
let dir: string;
const W = 120;
const H = 60;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "fx-export-test-"));
  SRC = await sharp({
    create: { width: W, height: H, channels: 4, background: "#ffffff" },
  })
    .png()
    .toBuffer();
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

const sticker = (
  fx: PixelFx | undefined,
  over: Record<string, unknown> = {},
): ImageLayer =>
  imageLayerSchema.parse({
    id: "s1",
    kind: "image",
    src: "https://example.com/sticker.png",
    pos: { mode: "fraction", nx: 0.5, ny: 0.5 },
    sticker: {
      text: "SALE",
      font: "Anton",
      weight: 700,
      color: "#ffffff",
      ...(fx ? { fx } : {}),
    },
    ...over,
  });

const doc = (
  layers: ImageLayer[],
  over: Partial<CompositionDoc> = {},
): CompositionDoc => ({
  id: "d",
  aspect: "1:1",
  background: {
    kind: "image",
    src: "https://example.com/bg.jpg",
    durationSec: 10,
  },
  layers,
  ...over,
});

const read = async () => SRC;
const fast = (
  kind: Parameters<typeof defaultFx>[0],
  over: Partial<PixelFx> = {},
): PixelFx => ({
  ...defaultFx(kind),
  lengthSec: 0.4,
  ...over,
});

describe("planPixelFx", () => {
  it("leaves a doc with no effect exactly as it was", async () => {
    const d = doc([sticker(undefined)]);
    expect(hasPixelFx(d)).toBe(false);
    const plan = await planPixelFx(d, 10, dir, read);
    expect(plan.doc).toBe(d);
    expect(plan.sequences.size).toBe(0);
  });

  it("splits a sticker into the still and the effect, still first", async () => {
    const plan = await planPixelFx(
      doc([sticker(fast("crumble", { startPct: 40 }))]),
      10,
      dir,
      read,
    );
    expect(plan.doc.layers.map((l) => l.id)).toEqual(["s1", `s1${FX_SUFFIX}`]);
    expect(plan.sequences.has(`s1${FX_SUFFIX}`)).toBe(true);
  });

  it("writes the frames as a numbered sequence FFmpeg can read", async () => {
    const plan = await planPixelFx(
      doc([sticker(fast("crumble"))]),
      10,
      dir,
      read,
    );
    const seq = plan.sequences.get(`s1${FX_SUFFIX}`)!;
    expect(seq.pattern.endsWith("f%05d.png")).toBe(true);
    const folder = seq.pattern.replace(/f%05d\.png$/, "");
    const files = (await readdir(folder)).sort();
    expect(files[0]).toBe("f00001.png");
    expect(files.length).toBeGreaterThan(5);
    expect(seq.fps).toBeGreaterThan(0);
  });

  it("a transition going out: still before, effect during, nothing after", async () => {
    const plan = await planPixelFx(
      doc([
        sticker(fast("crumble", { mode: "out", startPct: 40, lengthSec: 1 })),
      ]),
      10,
      dir,
      read,
    );
    const [still, play] = plan.doc.layers as Array<
      ImageLayer & { showIntervals?: Array<[number, number]> }
    >;
    expect(still.showIntervals).toEqual([[0, 4]]);
    expect(play.showIntervals).toEqual([[4, 5]]);
  });

  it("a transition coming in: nothing before, effect during, still after", async () => {
    const plan = await planPixelFx(
      doc([sticker(fast("slice", { mode: "in", startPct: 40, lengthSec: 1 }))]),
      10,
      dir,
      read,
    );
    const [still, play] = plan.doc.layers as Array<
      ImageLayer & { showIntervals?: Array<[number, number]> }
    >;
    expect(still.showIntervals).toEqual([[5, 10]]);
    expect(play.showIntervals).toEqual([[4, 5]]);
  });

  it("a pulse: still on both sides of the effect", async () => {
    const plan = await planPixelFx(
      doc([sticker(fast("electric", { startPct: 40, lengthSec: 1 }))]),
      10,
      dir,
      read,
    );
    const [still] = plan.doc.layers as Array<
      ImageLayer & { showIntervals?: Array<[number, number]> }
    >;
    expect(still.showIntervals).toEqual([
      [0, 4],
      [5, 10],
    ]);
  });

  it("the same percentage lands at the right second on a 10s, 15s or 30s clip", async () => {
    const starts: number[] = [];
    for (const clip of [10, 15, 30]) {
      const plan = await planPixelFx(
        doc([sticker(fast("electric", { startPct: 40 }))]),
        clip,
        dir,
        read,
      );
      starts.push(plan.sequences.get(`s1${FX_SUFFIX}`)!.startSec);
    }
    expect(starts[0]).toBeCloseTo(4, 6);
    expect(starts[1]).toBeCloseTo(6, 6);
    expect(starts[2]).toBeCloseTo(12, 6);
  });

  it("the effect carries the still's look: scale, rotation, opacity, blend, timing", async () => {
    const plan = await planPixelFx(
      doc([
        sticker(fast("glitch"), {
          scale: 1.7,
          rotationDeg: 12,
          opacity: 0.6,
          blend: "screen",
          appearAt: 1,
        }),
      ]),
      10,
      dir,
      read,
    );
    const play = plan.doc.layers[1] as ImageLayer;
    expect(play.scale).toBe(1.7);
    expect(play.rotationDeg).toBe(12);
    expect(play.opacity).toBe(0.6);
    expect(play.blend).toBe("screen");
    expect(play.appearAt).toBe(1);
  });

  it("uses this format's nudged size and tilt, not the master's", async () => {
    const d = doc([sticker(fast("shine"))], {
      overrides: { "1:1": { s1: { scale: 2.5, rotationDeg: -20 } } },
    });
    const plan = await planPixelFx(d, 10, dir, read);
    const play = plan.doc.layers[1] as ImageLayer;
    expect(play.scale).toBe(2.5);
    expect(play.rotationDeg).toBe(-20);
  });

  it("pins an edge-anchored sticker's effect to the still's own centre", async () => {
    const layer = sticker(fast("shine"), {
      pos: { mode: "anchor", anchor: "bottom-right", mx: 0.05, my: 0.05 },
      scale: 1.5,
    });
    const plan = await planPixelFx(doc([layer]), 10, dir, read);
    const play = plan.doc.layers[1] as ImageLayer;
    expect(play.pos.mode).toBe("fraction");
    const half = rotatedHalfExtents((W * 1.5) / 2, (H * 1.5) / 2, 0);
    const c = resolveCenter(layer.pos, "1:1", half.halfW, half.halfH);
    const { width, height } = ASPECT_DESIGN["1:1"];
    if (play.pos.mode === "fraction") {
      expect(play.pos.nx * width).toBeCloseTo(c.x, 6);
      expect(play.pos.ny * height).toBeCloseTo(c.y, 6);
    }
  });

  it("only the layer with an effect is split; others pass through untouched", async () => {
    const plain = sticker(undefined, { id: "plain" });
    const fancy = sticker(fast("dust"), { id: "fancy" });
    const plan = await planPixelFx(doc([plain, fancy]), 10, dir, read);
    expect(plan.doc.layers.map((l) => l.id)).toEqual([
      "plain",
      "fancy",
      `fancy${FX_SUFFIX}`,
    ]);
    expect(plan.doc.layers[0]).toBe(plain);
  });

  it("skips the effect layer when the sticker is off the ad for the whole effect", async () => {
    const plan = await planPixelFx(
      doc([sticker(fast("electric", { startPct: 80 }), { disappearAt: 3 })]),
      10,
      dir,
      read,
    );
    expect(plan.doc.layers.map((l) => l.id)).toEqual(["s1"]);
    expect(plan.sequences.size).toBe(0);
  });

  it("reuses the frames when the same sticker is planned for another format", async () => {
    const layer = sticker(fast("crumble", { lengthSec: 0.4 }));
    const a = await planPixelFx(doc([layer], { aspect: "1:1" }), 10, dir, read);
    const t = Date.now();
    const b = await planPixelFx(
      doc([layer], { aspect: "9:16" }),
      10,
      dir,
      read,
    );
    expect(Date.now() - t).toBeLessThan(1500);
    expect(b.sequences.get(`s1${FX_SUFFIX}`)!.fps).toBe(
      a.sequences.get(`s1${FX_SUFFIX}`)!.fps,
    );
  });
});

describe("the FFmpeg graph", () => {
  async function graphFor(fx: PixelFx, clip = 10) {
    const plan = await planPixelFx(doc([sticker(fx)]), clip, dir, read);
    const files: GraphFiles = {
      imageInputIdx: new Map([
        ["s1", 1],
        [`s1${FX_SUFFIX}`, 2],
      ]),
      textFile: new Map(),
      sequence: plan.sequences,
    };
    return buildFilterGraph(plan.doc, clip, files).graph;
  }

  it("overlays the still only when the effect isn't playing", async () => {
    const g = await graphFor(
      fast("crumble", { mode: "out", startPct: 40, lengthSec: 1 }),
    );
    expect(g).toContain("enable='between(t,0,10)*(gte(t,0)*lt(t,4))'");
  });

  it("overlays the effect only during it", async () => {
    const g = await graphFor(
      fast("crumble", { mode: "out", startPct: 40, lengthSec: 1 }),
    );
    expect(g).toContain("enable='between(t,0,10)*(gte(t,4)*lt(t,5))'");
  });

  it("shifts the frame sequence to where its first frame belongs on the clock", async () => {
    const g = await graphFor(fast("crumble", { startPct: 40 }));
    expect(g).toContain("[2:v]setpts=PTS+4/TB,format=rgba");
    // the still is a plain looped input — no shift
    expect(g).toContain("[1:v]format=rgba");
    expect(g).not.toContain("[1:v]setpts");
  });

  it("moves with the percentage: 40% is 6s on a 15s clip", async () => {
    const g = await graphFor(fast("crumble", { startPct: 40 }), 15);
    expect(g).toContain("setpts=PTS+6/TB");
  });

  it("a pulse emits the still's two stretches as a sum of half-open intervals", async () => {
    const g = await graphFor(fast("electric", { startPct: 40, lengthSec: 1 }));
    expect(g).toContain(
      "enable='between(t,0,10)*(gte(t,0)*lt(t,4)+gte(t,5)*lt(t,10))'",
    );
  });

  it("a layer with no effect keeps the plain enable it always had", () => {
    const plain = doc([sticker(undefined)]);
    const files: GraphFiles = {
      imageInputIdx: new Map([["s1", 1]]),
      textFile: new Map(),
    };
    const { graph } = buildFilterGraph(plain, 10, files);
    expect(graph).toContain("enable='between(t,0,10)'");
    expect(graph).not.toContain("gte(t,");
  });

  it("never shows the still when nothing is left for it to show in", async () => {
    const plan = await planPixelFx(
      doc([
        sticker(fast("crumble", { mode: "out", startPct: 0, lengthSec: 1 })),
      ]),
      10,
      dir,
      read,
    );
    const files: GraphFiles = {
      imageInputIdx: new Map([
        ["s1", 1],
        [`s1${FX_SUFFIX}`, 2],
      ]),
      textFile: new Map(),
      sequence: plan.sequences,
    };
    expect(buildFilterGraph(plan.doc, 10, files).graph).toContain("enable='0'");
  });
});
