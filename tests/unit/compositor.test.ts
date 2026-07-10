import { describe, it, expect, beforeEach } from "vitest";
import {
  ASPECT_DESIGN,
  ASPECT_TO_FORMAT,
  BLEND_MODES,
  centerToPos,
  compositionDocSchema,
  effectiveLayer,
  formatToAspect,
  layerAlphaAt,
  layerSchema,
  migrateDocInput,
  resolveCenter,
  type CompositionDoc,
  type Layer,
} from "@/lib/composition/layers";
import { useCompositorStore } from "@/store/useCompositorStore";
import {
  brandKitLayers,
  pickKitLogo,
  wrapText,
} from "@/lib/composition/brand-apply";

const imageLayer: Layer = {
  id: "logo-1",
  kind: "image",
  src: "https://example.com/storage/logo.png",
  pos: { mode: "fraction", nx: 0.83, ny: 0.885 },
  scale: 0.5,
  rotationDeg: 0,
  opacity: 0.9,
  blend: "screen",
  appearAt: 8,
  disappearAt: null,
  fadeSec: 2,
};

const textLayer: Layer = {
  id: "caption-1",
  kind: "text",
  text: "Winter sale — this week only",
  font: "Montserrat",
  sizePx: 72,
  color: "#ffffff",
  pos: { mode: "fraction", nx: 0.5, ny: 0.833 },
  scale: 1,
  rotationDeg: 0,
  opacity: 1,
  blend: "normal",
  appearAt: 0,
  disappearAt: 8,
  fadeSec: 0.5,
};

const doc: CompositionDoc = {
  id: "5b0c8f6e-2a1d-4e3b-9c7f-1234567890ab",
  aspect: "9:16",
  background: {
    kind: "video",
    src: "https://example.com/storage/clip.mp4",
    durationSec: 10,
  },
  layers: [textLayer, imageLayer],
};

describe("composition layer model", () => {
  it("round-trips a full document through JSON + schema unchanged", () => {
    const parsed = compositionDocSchema.parse(JSON.parse(JSON.stringify(doc)));
    expect(parsed).toEqual(doc);
  });

  it("applies defaults to a minimal layer", () => {
    const parsed = layerSchema.parse({
      id: "l1",
      kind: "image",
      src: "https://example.com/a.png",
      pos: { mode: "fraction", nx: 0, ny: 0 },
    });
    expect(parsed).toMatchObject({
      scale: 1,
      rotationDeg: 0,
      opacity: 1,
      blend: "normal",
      appearAt: 0,
      disappearAt: null,
      fadeSec: 0,
    });
  });

  it("rejects unknown blend modes and non-URL image sources", () => {
    expect(() =>
      layerSchema.parse({ ...imageLayer, blend: "color-dodge" }),
    ).toThrow();
    expect(() =>
      layerSchema.parse({ ...imageLayer, src: "logo.png" }),
    ).toThrow();
  });

  it("maps every aspect to a design space and a legacy format, and back", () => {
    for (const aspect of ["9:16", "1:1", "16:9"] as const) {
      expect(ASPECT_DESIGN[aspect].width).toBeGreaterThan(0);
      expect(formatToAspect(ASPECT_TO_FORMAT[aspect])).toBe(aspect);
    }
    expect(formatToAspect("reel")).toBe("9:16");
    expect(formatToAspect("unknown")).toBe("1:1");
  });

  it("exposes a canvas equivalent for every curated blend mode", () => {
    for (const b of BLEND_MODES) {
      expect(b.canvas.length).toBeGreaterThan(0);
      expect(b.label).toContain("—");
    }
  });
});

describe("aspect-independent layout", () => {
  it("resolves a fraction centre proportionally in every aspect", () => {
    const pos = { mode: "fraction", nx: 0.5, ny: 0.85 } as const;
    // Centre stays at the same FRACTION of the canvas whatever the aspect —
    // the caption near the bottom stays near the bottom when reflowed.
    for (const aspect of ["9:16", "1:1", "16:9"] as const) {
      const { width, height } = ASPECT_DESIGN[aspect];
      const c = resolveCenter(pos, aspect, 0, 0);
      expect(c.x).toBeCloseTo(0.5 * width);
      expect(c.y).toBeCloseTo(0.85 * height);
    }
  });

  it("pins an anchor to its corner with a constant-pixel margin across aspects", () => {
    // margin is a fraction of min(W,H) = 1080 for every aspect, so a
    // bottom-right logo sits the same distance from the corner everywhere.
    const pos = {
      mode: "anchor",
      anchor: "bottom-right",
      mx: 0.05,
      my: 0.05,
    } as const;
    const halfW = 100;
    const halfH = 60;
    for (const aspect of ["9:16", "1:1", "16:9"] as const) {
      const { width, height } = ASPECT_DESIGN[aspect];
      const c = resolveCenter(pos, aspect, halfW, halfH);
      // right/bottom edge of the box sits 54px (0.05 * 1080) from the corner.
      expect(width - (c.x + halfW)).toBeCloseTo(54);
      expect(height - (c.y + halfH)).toBeCloseTo(54);
    }
  });

  it("round-trips centre → pos → centre for both modes", () => {
    const cases: Array<Parameters<typeof resolveCenter>[0]> = [
      { mode: "fraction", nx: 0.3, ny: 0.72 },
      { mode: "anchor", anchor: "top-left", mx: 0.06, my: 0.04 },
      { mode: "anchor", anchor: "bottom-right", mx: 0.05, my: 0.05 },
    ];
    for (const pos of cases) {
      const c = resolveCenter(pos, "1:1", 80, 40);
      const back = centerToPos(pos, c.x, c.y, "1:1", 80, 40);
      const c2 = resolveCenter(back, "1:1", 80, 40);
      expect(c2.x).toBeCloseTo(c.x);
      expect(c2.y).toBeCloseTo(c.y);
    }
  });

  it("migrates legacy absolute x/y into a fraction pos for the doc's aspect", () => {
    const legacy = {
      id: "5b0c8f6e-2a1d-4e3b-9c7f-1234567890ab",
      aspect: "9:16",
      background: { kind: "video", src: "https://example.com/clip.mp4" },
      layers: [
        {
          id: "old",
          kind: "image",
          src: "https://example.com/logo.png",
          x: 540,
          y: 960,
          scale: 1,
        },
      ],
    };
    const parsed = compositionDocSchema.parse(legacy);
    // 540/1080 = 0.5, 960/1920 = 0.5 — same pixel centre in 9:16, reflowable.
    expect(parsed.layers[0].pos).toEqual({
      mode: "fraction",
      nx: 0.5,
      ny: 0.5,
    });
    // Idempotent: a doc that already has pos passes straight through.
    const twice = compositionDocSchema.parse(migrateDocInput(legacy));
    expect(twice.layers[0].pos).toEqual({ mode: "fraction", nx: 0.5, ny: 0.5 });
  });
});

describe("per-format overrides", () => {
  it("returns the master layer untouched when no override applies", () => {
    expect(effectiveLayer(imageLayer, "9:16", undefined)).toBe(imageLayer);
    // An override for a DIFFERENT aspect must not leak in.
    expect(
      effectiveLayer(imageLayer, "9:16", {
        "1:1": { [imageLayer.id]: { scale: 2 } },
      }),
    ).toBe(imageLayer);
  });

  it("merges only the overridden aspect's layout fields", () => {
    const eff = effectiveLayer(imageLayer, "1:1", {
      "1:1": {
        [imageLayer.id]: {
          scale: 2,
          pos: { mode: "fraction", nx: 0.1, ny: 0.1 },
        },
      },
    });
    expect(eff.scale).toBe(2);
    expect(eff.pos).toEqual({ mode: "fraction", nx: 0.1, ny: 0.1 });
    // Identity + content (blend, timing) survive.
    expect(eff.id).toBe(imageLayer.id);
    expect(eff.blend).toBe(imageLayer.blend);
  });
});

describe("layerAlphaAt", () => {
  it("is 0 outside the visible window", () => {
    expect(layerAlphaAt(imageLayer, 7.9, 10)).toBe(0);
    expect(layerAlphaAt(textLayer, 8.1, 10)).toBe(0);
  });

  it("fades in and out, scaled by layer opacity", () => {
    // imageLayer: appears at 8, fadeSec 2, opacity 0.9, runs to clip end (10)
    expect(layerAlphaAt(imageLayer, 9, 10)).toBeCloseTo(0.45); // halfway in
    expect(layerAlphaAt(textLayer, 0.25, 10)).toBeCloseTo(0.5); // half faded in
    expect(layerAlphaAt(textLayer, 4, 10)).toBe(1); // fully visible
  });

  it("holds to the clip end without fading out when disappearAt is null", () => {
    // End-card logo: fades in over the final seconds and STAYS at full alpha.
    expect(layerAlphaAt(imageLayer, 10, 10)).toBeCloseTo(0.9);
    expect(layerAlphaAt({ ...imageLayer, fadeSec: 0 }, 10, 10)).toBeCloseTo(
      0.9,
    );
    // …but an explicit disappearAt still fades out at its edge.
    expect(layerAlphaAt(textLayer, 7.75, 10)).toBeCloseTo(0.5);
  });
});

describe("brandKitLayers", () => {
  const kit = {
    logo_url: "https://example.com/logo.png",
    logo_dark_url: "https://example.com/logo-dark.png",
    tagline: "Ten times the brand",
    font_family: "Montserrat",
  };

  it("builds a schema-valid end-card logo + tagline caption from the kit", () => {
    const layers = brandKitLayers(kit, "9:16", 10, 500);
    expect(layers).toHaveLength(2);
    for (const l of layers) expect(() => layerSchema.parse(l)).not.toThrow();

    const logo = layers.find((l) => l.kind === "image")!;
    // Screen blend on the end card: fades in and holds to the clip end.
    expect(logo).toMatchObject({
      src: kit.logo_url,
      blend: "screen",
      appearAt: 8,
      disappearAt: null,
      effects: { in: { kind: "fade", durationSec: 1 }, loop: "none" },
    });
    // 500px-wide logo scaled to ~35% of the 1080 design width.
    expect(logo.scale).toBeCloseTo((1080 * 0.35) / 500);

    const text = layers.find((l) => l.kind === "text")!;
    expect(text).toMatchObject({
      text: kit.tagline,
      font: "Montserrat",
      appearAt: 0,
      effects: { in: { kind: "rise", durationSec: 0.8 } },
    });
  });

  it("uses the campaign caption as main text and moves the tagline to the end card", () => {
    const layers = brandKitLayers(kit, "9:16", 10, 500, "Fresh drop friday");
    const texts = layers.filter((l) => l.kind === "text");
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatchObject({ text: "Fresh drop friday", appearAt: 0 });
    expect(texts[1]).toMatchObject({ text: kit.tagline, appearAt: 8 });
    for (const l of layers) expect(() => layerSchema.parse(l)).not.toThrow();
  });

  it("skips missing pieces and falls back safely", () => {
    expect(brandKitLayers({}, "1:1", 10, null)).toHaveLength(0);
    const only = brandKitLayers(
      { tagline: "Hi", font_family: "Comic Sans" },
      "1:1",
      10,
      null,
    );
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ kind: "text", font: "Inter" });
    // Clips shorter than the fade window still get a valid appearAt.
    const short = brandKitLayers({ logo_url: kit.logo_url }, "1:1", 1.5, 500);
    expect(short[0].appearAt).toBe(0);
  });

  it("wraps long captions onto lines instead of one off-screen strip", () => {
    const long =
      "Fresh sourdough every morning baked with love in our little Ponsonby bakery";
    const wrapped = wrapText(long);
    const lines = wrapped.split("\n");
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(26);
    expect(wrapped.replace(/\n/g, " ")).toBe(long);
    expect(wrapText("short one")).toBe("short one");

    const layers = brandKitLayers(kit, "9:16", 10, 500, long);
    const main = layers.find((l) => l.kind === "text")!;
    expect(main.kind === "text" && main.text).toContain("\n");
  });

  it("prefers the light mark for screen blending, falling back to dark", () => {
    expect(pickKitLogo(kit)).toBe(kit.logo_url);
    expect(pickKitLogo({ logo_dark_url: kit.logo_dark_url })).toBe(
      kit.logo_dark_url,
    );
    expect(pickKitLogo({})).toBe(null);
  });
});

describe("useCompositorStore", () => {
  beforeEach(() => {
    useCompositorStore.getState().reset();
  });

  it("load/edit/save round-trip with dirty tracking", () => {
    const s = () => useCompositorStore.getState();
    s().load(doc);
    expect(s().dirty).toBe(false);

    s().updateLayer("caption-1", {
      text: "New caption",
      pos: { mode: "fraction", nx: 0.2, ny: 0.9 },
    });
    expect(s().dirty).toBe(true);
    const edited = s().doc!.layers.find((l) => l.id === "caption-1")!;
    expect(edited).toMatchObject({
      text: "New caption",
      pos: { mode: "fraction", nx: 0.2, ny: 0.9 },
    });

    // The edited doc still validates — what the PATCH endpoint will receive.
    expect(() => compositionDocSchema.parse(s().doc)).not.toThrow();
    s().markSaved();
    expect(s().dirty).toBe(false);
  });

  it("setAspect reflows by swapping the aspect only, never a layer's pos", () => {
    const s = () => useCompositorStore.getState();
    s().load(doc);
    const before = s().doc!.layers.map((l) => l.pos);
    s().setAspect("16:9");
    // Positions are aspect-independent, so the reflow is purely at render time —
    // the stored pos is untouched.
    expect(s().doc!.aspect).toBe("16:9");
    expect(s().doc!.layers.map((l) => l.pos)).toEqual(before);
  });

  it("patchLayout writes the master by default, this aspect's override in override mode", () => {
    const s = () => useCompositorStore.getState();
    s().load(doc); // aspect 9:16

    // Default: layout edits land on the shared master layer.
    s().patchLayout("logo-1", { scale: 3 });
    expect(s().doc!.layers.find((l) => l.id === "logo-1")!.scale).toBe(3);
    expect(s().doc!.overrides).toBeUndefined();

    // Override mode: the master is untouched, the delta lands on 9:16 only.
    s().setOverrideMode(true);
    s().patchLayout("logo-1", { scale: 5 });
    expect(s().doc!.layers.find((l) => l.id === "logo-1")!.scale).toBe(3);
    expect(s().doc!.overrides!["9:16"]!["logo-1"].scale).toBe(5);

    // Reset reverts this format to the master layout.
    s().resetOverride("logo-1");
    expect(s().doc!.overrides?.["9:16"]).toBeUndefined();
  });

  it("adds, reorders and removes layers", () => {
    const s = () => useCompositorStore.getState();
    s().load({ ...doc, layers: [textLayer] });

    s().addLayer(imageLayer);
    expect(s().doc!.layers.map((l) => l.id)).toEqual(["caption-1", "logo-1"]);
    expect(s().selectedLayerId).toBe("logo-1");

    s().moveLayer("logo-1", "down"); // toward the back
    expect(s().doc!.layers.map((l) => l.id)).toEqual(["logo-1", "caption-1"]);
    s().moveLayer("logo-1", "down"); // already at the back — no-op
    expect(s().doc!.layers.map((l) => l.id)).toEqual(["logo-1", "caption-1"]);

    s().removeLayer("logo-1");
    expect(s().doc!.layers.map((l) => l.id)).toEqual(["caption-1"]);
    // Deleting the selected layer keeps a selection alive (top remaining),
    // so the properties panel never vanishes mid-edit.
    expect(s().selectedLayerId).toBe("caption-1");
    s().removeLayer("caption-1");
    expect(s().selectedLayerId).toBe(null);
  });

  it("replaces a layer in place, keeping stack position (kind conversion)", () => {
    const s = () => useCompositorStore.getState();
    s().load({ ...doc, layers: [textLayer, imageLayer] });

    // Convert the text layer to an image, preserving base props + position.
    s().replaceLayer("caption-1", {
      ...imageLayer,
      id: "caption-1",
      pos: { mode: "fraction", nx: 0.5, ny: 0.83 },
      src: "https://example.com/swapped.png",
    });
    const ids = s().doc!.layers.map((l) => l.id);
    expect(ids).toEqual(["caption-1", "logo-1"]); // same order
    const swapped = s().doc!.layers[0];
    expect(swapped.kind).toBe("image");
    expect(swapped).toMatchObject({
      pos: { mode: "fraction", nx: 0.5, ny: 0.83 },
    }); // position kept
    expect(s().selectedLayerId).toBe("caption-1");
    expect(s().dirty).toBe(true);
  });

  it("ignores edits when no document is loaded", () => {
    const s = () => useCompositorStore.getState();
    s().addLayer(imageLayer);
    s().setAspect("16:9");
    expect(s().doc).toBe(null);
    expect(s().dirty).toBe(false);
  });
});
