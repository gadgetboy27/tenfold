import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  adWatchResultSchema,
  overlayProposalSchema,
  applicableNotes,
  resolveOverlayText,
  withUserWording,
  normalizeWatchResult,
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
    const parsed = withText.success
      ? (withText.data as Record<string, unknown>)
      : {};
    expect(parsed.text).toBeUndefined();
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

/**
 * A proposal is a starting point, not a verdict. Two directions:
 * BEFORE — steer the watcher with wording you already have.
 * AFTER  — accept a note but rewrite the copy, keeping its layout judgement.
 */
describe("editing the wording", () => {
  const proposal = {
    text: "Roasted in Northland",
    zone: "top" as const,
    font: "Inter" as const,
    color: "#ffffff",
    widthFrac: 0.6,
    scrim: true,
  };

  it("uses the model's copy when nothing was edited", () => {
    expect(resolveOverlayText(proposal)).toBe("Roasted in Northland");
    expect(resolveOverlayText(proposal, "")).toBe("Roasted in Northland");
    expect(resolveOverlayText(proposal, "   ")).toBe("Roasted in Northland");
  });

  it("uses your wording when you supply it", () => {
    expect(resolveOverlayText(proposal, "Small-batch, Bay of Islands")).toBe(
      "Small-batch, Bay of Islands",
    );
  });

  it("keeps the styling when only the words change", () => {
    // The placement, font, colour and scrim are the part worth keeping — an
    // edit to the copy must not quietly discard the layout judgement.
    const edited = withUserWording(proposal, "Small-batch, Bay of Islands");
    expect(edited.zone).toBe("top");
    expect(edited.font).toBe("Inter");
    expect(edited.color).toBe("#ffffff");
    expect(edited.scrim).toBe(true);
    expect(edited.widthFrac).toBe(0.6);
  });

  it("returns the same object when accepted as-is", () => {
    // Reference equality distinguishes "accepted" from "rewritten", which is
    // worth knowing: copy that is always rewritten is copy that needs work.
    expect(withUserWording(proposal)).toBe(proposal);
    expect(withUserWording(proposal, "Roasted in Northland")).toBe(proposal);
  });

  it("tells the model to place supplied wording verbatim", () => {
    const src = readFileSync("lib/claude/ad-watcher.ts", "utf8");
    expect(src).toContain("do not rewrite it");
  });
});

/**
 * The 400 these pin cost a live review: `strict: true` rejects the JSON Schema
 * constraint keywords, so a schema carrying `maxItems` fails the request before
 * the model runs. It had been fixed once and came back — reverting the feature
 * merge during an unrelated outage took the fix with it, and re-merging did not
 * bring it back because git considered that commit already merged.
 *
 * A unit test on the schema object is what makes that survivable, so the next
 * revert fails a test instead of a paid API call.
 */
describe("the tool schema stays callable", () => {
  const schemaSource = (() => {
    const src = readFileSync("lib/claude/ad-watcher.ts", "utf8");
    const start = src.indexOf("const WATCH_TOOL");
    const end = src.indexOf("const SYSTEM");
    // Strip comments first: the comments around this code NAME the forbidden
    // keywords in order to explain them, and would fail the assertion below.
    return src
      .slice(start, end)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  })();

  for (const kw of ["maxItems", "maxLength", "minItems", "minLength"]) {
    it(`carries no ${kw}, which a strict schema rejects with a 400`, () => {
      expect(schemaSource).not.toContain(kw);
    });
  }

  it("carries no pattern or numeric bounds either", () => {
    expect(schemaSource).not.toMatch(/\bpattern\s*:/);
    expect(schemaSource).not.toMatch(/\bminimum\s*:/);
    expect(schemaSource).not.toMatch(/\bmaximum\s*:/);
  });

  it("still tells the model the limits, in prose", () => {
    // Dropping the keywords is only safe because the model is still ASKED.
    expect(schemaSource).toContain("At most 6 notes");
    expect(schemaSource).toMatch(/Max 240 characters/);
    expect(schemaSource).toMatch(/hex triplet/);
  });
});

describe("normalising what the model actually returns", () => {
  it("trims a seventh note rather than losing the whole review", () => {
    const parsed = adWatchResultSchema.safeParse(
      normalizeWatchResult({
        working: "ok",
        notes: Array.from({ length: 9 }, () => note()),
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.notes).toHaveLength(6);
  });

  it("truncates an over-long sentence rather than throwing", () => {
    const parsed = adWatchResultSchema.safeParse(
      normalizeWatchResult({
        working: "x".repeat(400),
        notes: [note({ observation: "y".repeat(400), why: "z".repeat(300) })],
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.working).toHaveLength(240);
      expect(parsed.data.notes[0].observation).toHaveLength(240);
    }
  });

  it("truncates overlay copy but keeps its styling", () => {
    const parsed = adWatchResultSchema.safeParse(
      normalizeWatchResult({
        working: "ok",
        notes: [
          note({
            overlay: {
              text: "w".repeat(200),
              zone: "bottom",
              font: "Inter",
              color: "#ffffff",
              widthFrac: 0.6,
              scrim: true,
            },
          }),
        ],
      }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const o = parsed.data.notes[0].overlay!;
      expect(o.text).toHaveLength(120);
      expect(o.zone).toBe("bottom");
      expect(o.widthFrac).toBe(0.6);
    }
  });

  it("still refuses a bad colour — normalising is not laundering", () => {
    // Length is a preference. A colour NAME reaches an FFmpeg filtergraph and
    // renders nothing, so it must keep failing loudly.
    expect(
      adWatchResultSchema.safeParse(
        normalizeWatchResult({
          working: "ok",
          notes: [
            note({
              overlay: {
                text: "hi",
                zone: "bottom",
                font: "Inter",
                color: "white",
                widthFrac: 0.6,
                scrim: true,
              },
            }),
          ],
        }),
      ).success,
    ).toBe(false);
  });

  it("passes a note with no overlay through untouched", () => {
    const parsed = adWatchResultSchema.safeParse(
      normalizeWatchResult({ working: "ok", notes: [note()] }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.notes[0].overlay).toBeUndefined();
  });
});
