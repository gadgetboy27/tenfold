import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  adWatchResultSchema,
  overlayProposalSchema,
  applicableNotes,
} from "@/lib/composition/ad-notes";
import { wordTreatmentSchema } from "@/lib/composition/words";
import { sampleTimestamps } from "@/lib/composition/frames";

const note = (over: Record<string, unknown> = {}) => ({
  kind: "hook",
  atSec: 1.2,
  observation: "Nothing states what is being sold in the opening seconds.",
  why: "A scroller decides in about two seconds whether to keep watching.",
  confidence: "high",
  ...over,
});

/**
 * The watcher proposes COPY as well as placement, which the Words tool
 * deliberately never does. These pin the boundary between the two, because the
 * cheapest way to break the Words guarantee is to "unify" the schemas.
 */
describe("the Words guarantee is untouched", () => {
  it("still refuses letters in a word treatment", () => {
    // wordTreatmentSchema is what stops an IMAGE model's invented spelling
    // reaching the canvas. Adding a text field here is the day that dies.
    const withText = wordTreatmentSchema.safeParse({
      name: "Corner stamp",
      zone: "bottom",
      font: "Inter",
      color: "#ffffff",
      widthFrac: 0.8,
      scrim: true,
      text: "SNEAKY COPY",
    });
    // Parsed, but the letters must be stripped — never carried through.
    expect(
      (withText.success ? withText.data : ({} as Record<string, unknown>)).text,
    ).toBeUndefined();
  });

  it("keeps the watcher's proposal schema separate from it", () => {
    // Different pipeline, different threat model: here the COMPOSITOR spells
    // the words with a real font file and no image model ever sees them.
    // Asserted on the IMPORTS, not the file text: the header comment explains
    // the separation and names wordTreatmentSchema on purpose, so a raw text
    // match would fail on the explanation rather than a real coupling. What
    // matters is that this module does not reach into words.ts at all.
    const imports = readFileSync("lib/composition/ad-notes.ts", "utf8")
      .split("\n")
      .filter((l) => l.trimStart().startsWith("import"))
      .join("\n");
    expect(imports).not.toContain("composition/words");
    expect(
      overlayProposalSchema.safeParse({
        text: "Roasted in Northland",
        zone: "top",
        font: "Inter",
        color: "#ffffff",
        widthFrac: 0.6,
        scrim: true,
      }).success,
    ).toBe(true);
  });
});

describe("what may be applied automatically", () => {
  it("applies only high-confidence notes that carry an overlay", () => {
    const result = adWatchResultSchema.parse({
      working: "Strong opening motion.",
      notes: [
        note({
          confidence: "high",
          overlay: {
            text: "Roasted in Northland",
            zone: "top",
            font: "Inter",
            color: "#ffffff",
            widthFrac: 0.6,
            scrim: true,
          },
        }),
        note({
          confidence: "medium",
          overlay: {
            text: "Maybe this",
            zone: "bottom",
            font: "Inter",
            color: "#ffffff",
            widthFrac: 0.6,
            scrim: true,
          },
        }),
        note({ kind: "pacing", confidence: "high" }), // no overlay
      ],
    });
    const applicable = applicableNotes(result);
    expect(applicable).toHaveLength(1);
    expect(applicable[0].overlay?.text).toBe("Roasted in Northland");
  });

  it("never auto-applies a medium-confidence guess", () => {
    // A guess stamped onto someone's ad costs a re-render, an approval round
    // trip and trust — worse than no feature.
    const result = adWatchResultSchema.parse({
      working: "Clean framing.",
      notes: [
        note({
          confidence: "medium",
          overlay: {
            text: "x",
            zone: "top",
            font: "Inter",
            color: "#ffffff",
            widthFrac: 0.5,
            scrim: false,
          },
        }),
      ],
    });
    expect(applicableNotes(result)).toHaveLength(0);
  });

  it("accepts a review with no notes at all", () => {
    // "This ad is fine" has to be expressible, or the model pads to fill.
    expect(
      adWatchResultSchema.parse({
        working: "Reads well throughout.",
        notes: [],
      }).notes,
    ).toHaveLength(0);
  });

  it("caps notes so the model can't pad", () => {
    expect(
      adWatchResultSchema.safeParse({
        working: "ok",
        notes: Array.from({ length: 7 }, () => note()),
      }).success,
    ).toBe(false);
  });

  it("rejects a colour that isn't a hex triplet", () => {
    // This value reaches an FFmpeg filtergraph; "red" would render nothing.
    expect(
      overlayProposalSchema.safeParse({
        text: "hi",
        zone: "top",
        font: "Inter",
        color: "white",
        widthFrac: 0.5,
        scrim: false,
      }).success,
    ).toBe(false);
  });
});

describe("frame sampling", () => {
  it("weights the opening, where an ad is won or lost", () => {
    const t = sampleTimestamps(20, 6);
    const firstHalf = t.filter((x) => x < 10).length;
    expect(firstHalf).toBeGreaterThan(t.length / 2);
  });

  it("never samples frame zero", () => {
    // Frame 0 of a fade-in is black, and a model shown black faithfully
    // reports that the ad opens on nothing.
    expect(Math.min(...sampleTimestamps(15, 6))).toBeGreaterThanOrEqual(0.4);
  });

  it("stays inside the clip", () => {
    const d = 8;
    expect(Math.max(...sampleTimestamps(d, 6))).toBeLessThanOrEqual(d);
  });

  it("collapses duplicates on a very short clip", () => {
    // Paying to show the model the same instant twice teaches it nothing.
    const t = sampleTimestamps(1, 6);
    expect(new Set(t).size).toBe(t.length);
  });
});
