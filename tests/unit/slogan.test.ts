import { describe, expect, it } from "vitest";
import {
  normalizeSlogans,
  SLOGAN_COUNT,
  SLOGAN_MAX_WORDS,
} from "@/lib/claude/slogan";

describe("normalizeSlogans", () => {
  it("reads a JSON array", () => {
    expect(
      normalizeSlogans(
        '["Coffee with an edge", "Wake up louder", "Roasted by hand"]',
      ),
    ).toEqual(["Coffee with an edge", "Wake up louder", "Roasted by hand"]);
  });

  it("copes with a preamble around the array", () => {
    expect(
      normalizeSlogans('Here you go:\n["One", "Two"]\nHope that helps'),
    ).toEqual(["One", "Two"]);
  });

  it("falls back to lines, stripping numbering, bullets and quotes", () => {
    expect(
      normalizeSlogans(
        '1. "Fresh every dawn"\n- Brewed bold\n3) Taste the morning',
      ),
    ).toEqual(["Fresh every dawn", "Brewed bold", "Taste the morning"]);
  });

  it("never returns more than the requested number", () => {
    const many = JSON.stringify(
      Array.from({ length: 8 }, (_, i) => `Slogan ${i}`),
    );
    expect(normalizeSlogans(many)).toHaveLength(SLOGAN_COUNT);
  });

  it("drops anything longer than a slogan rather than trimming it mid-thought", () => {
    const long = Array.from(
      { length: SLOGAN_MAX_WORDS + 1 },
      () => "word",
    ).join(" ");
    expect(normalizeSlogans(JSON.stringify([long, "Short and sharp"]))).toEqual(
      ["Short and sharp"],
    );
  });

  it("refuses a long multi-sentence line but allows short fragments", () => {
    expect(
      normalizeSlogans(
        JSON.stringify([
          "We roast every bean by hand. You taste the difference",
          "Fresh. Fast. Yours.",
        ]),
      ),
    ).toEqual(["Fresh. Fast. Yours."]);
  });

  it("removes duplicates ignoring case", () => {
    expect(normalizeSlogans('["Bold taste", "bold taste", "Another"]')).toEqual(
      ["Bold taste", "Another"],
    );
  });

  it("returns nothing for an empty reply", () => {
    expect(normalizeSlogans("")).toEqual([]);
  });
});
