import { describe, it, expect } from "vitest";
import {
  buildWordsLayer,
  sizeForWords,
  wordTreatmentSchema,
  wordTreatmentsSchema,
  DEFAULT_TREATMENT,
  WORD_ZONES,
  WORD_SIZES,
} from "@/lib/composition/words";
import { ASPECT_DESIGN, layerSchema } from "@/lib/composition/layers";

/**
 * The Words tool exists because asking an image model for specific letters is
 * a request, not a constraint — a hot-sauce brief that never mentioned text
 * came back with bottles reading "AUNCEAAN FLEANCE".
 *
 * The guarantee is structural: a treatment describes how type should LOOK and
 * has nowhere to put letters. These tests pin that, because the day someone
 * adds a `text` field "for convenience" is the day the guarantee quietly dies.
 */

describe("a treatment cannot carry wording", () => {
  it("strips any text the model tries to smuggle in", () => {
    const parsed = wordTreatmentSchema.parse({
      name: "Corner stamp",
      zone: "top-left",
      font: "Inter",
      color: "#ffffff",
      widthFrac: 0.5,
      scrim: true,
      // A model returning this must not be able to influence what is drawn.
      text: "Buy Now!!",
      words: "Buy Now!!",
    });

    expect(parsed).not.toHaveProperty("text");
    expect(parsed).not.toHaveProperty("words");
  });

  it("rejects a treatment naming a font we have no file for", () => {
    // The browser can render almost any family, but the FFmpeg export resolves
    // through FONT_FILES and silently falls back to Inter. Accepting an unknown
    // font here would give a correct preview and a wrong video.
    const bad = wordTreatmentSchema.safeParse({
      ...DEFAULT_TREATMENT,
      font: "Comic Sans MS",
    });
    expect(bad.success).toBe(false);
  });

  it("rejects a zone that isn't one of the nine anchors", () => {
    const bad = wordTreatmentSchema.safeParse({
      ...DEFAULT_TREATMENT,
      zone: "middle-ish",
    });
    expect(bad.success).toBe(false);
  });

  it("caps how many suggestions can come back", () => {
    const many = Array.from({ length: 9 }, () => DEFAULT_TREATMENT);
    expect(wordTreatmentsSchema.safeParse({ treatments: many }).success).toBe(
      false,
    );
    expect(wordTreatmentsSchema.safeParse({ treatments: [] }).success).toBe(
      false,
    );
  });
});

describe("buildWordsLayer", () => {
  it("draws exactly the letters given, unchanged", () => {
    const layer = buildWordsLayer({
      id: "words",
      text: "Hop Pilot — 4.8% Pale Ale",
      treatment: DEFAULT_TREATMENT,
      aspect: "1:1",
    });
    expect(layer.text).toBe("Hop Pilot — 4.8% Pale Ale");
  });

  it("produces a layer the document schema accepts", () => {
    // A layer that can't be parsed back is one the compositor silently drops.
    for (const zone of WORD_ZONES) {
      const layer = buildWordsLayer({
        id: "words",
        text: "Launch Week",
        treatment: { ...DEFAULT_TREATMENT, zone: zone.id },
        aspect: "9:16",
      });
      expect(layerSchema.safeParse(layer).success).toBe(true);
    }
  });

  it("anchors rather than floats, so a corner stays a corner", () => {
    const layer = buildWordsLayer({
      id: "words",
      text: "Sale",
      treatment: { ...DEFAULT_TREATMENT, zone: "bottom-right" },
      aspect: "16:9",
    });
    // Fraction mode would drift as the frame changes shape; anchor mode is
    // exactly why a logo lock-up survives a 1:1 → 9:16 re-render.
    expect(layer.pos).toMatchObject({ mode: "anchor", anchor: "bottom-right" });
  });

  it("adds a scrim only when the treatment asks for one", () => {
    const withScrim = buildWordsLayer({
      id: "w",
      text: "Hi",
      treatment: { ...DEFAULT_TREATMENT, scrim: true },
      aspect: "1:1",
    });
    const without = buildWordsLayer({
      id: "w",
      text: "Hi",
      treatment: { ...DEFAULT_TREATMENT, scrim: false },
      aspect: "1:1",
    });
    expect(withScrim.bg).toBeDefined();
    expect(without.bg).toBeUndefined();
  });
});

describe("sizeForWords", () => {
  it("shrinks as the wording gets longer", () => {
    const short = sizeForWords("Sale", 0.8, "1:1");
    const long = sizeForWords(
      "Our biggest clearance event of the entire year",
      0.8,
      "1:1",
    );
    expect(short).toBeGreaterThan(long);
  });

  it("keeps the longest line inside the frame at every aspect", () => {
    const text = "Small-batch hot sauce, made in Wellington";
    for (const aspect of ["1:1", "9:16", "16:9"] as const) {
      const size = sizeForWords(text, 0.8, aspect);
      const widest = Math.max(...text.split("\n").map((l) => l.length));
      // ~0.5em per character for a sans face — the same approximation the
      // sizing uses, checked against the real design width.
      expect(widest * size * 0.5).toBeLessThanOrEqual(
        ASPECT_DESIGN[aspect].width,
      );
    }
  });

  it("stays within the schema's own size bounds", () => {
    // One very long word, and one very short line on the widest frame — both
    // would otherwise produce a size the layer schema rejects.
    expect(sizeForWords("a".repeat(400), 0.9, "9:16")).toBeGreaterThanOrEqual(8);
    expect(sizeForWords("A", 0.9, "16:9")).toBeLessThanOrEqual(400);
  });
});

describe("size presets", () => {
  it("every preset is a width the schema accepts", () => {
    // widthFrac is bounded 0.2-0.9; a preset outside that would build a layer
    // the document rejects, i.e. text that silently never appears.
    for (const sz of WORD_SIZES) {
      expect(
        wordTreatmentSchema.safeParse({
          ...DEFAULT_TREATMENT,
          widthFrac: sz.widthFrac,
        }).success,
      ).toBe(true);
    }
  });

  it("bigger presets really do produce bigger type", () => {
    const text = "Launch Week";
    const sizes = WORD_SIZES.map((sz) =>
      sizeForWords(text, sz.widthFrac, "1:1"),
    );
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]).toBeGreaterThan(sizes[i - 1]);
    }
  });

  it("even the largest preset keeps long wording inside the frame", () => {
    // The point of sizing by width fraction rather than point size: "Full
    // width" on a long headline must shrink the type, not overflow.
    const longest = WORD_SIZES[WORD_SIZES.length - 1];
    const text = "Our biggest clearance event of the entire year, ends Sunday";
    const size = sizeForWords(text, longest.widthFrac, "9:16");
    expect(text.length * size * 0.5).toBeLessThanOrEqual(
      ASPECT_DESIGN["9:16"].width,
    );
  });
});
