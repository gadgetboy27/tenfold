import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BRAND_FONTS, weightOf, weightsFor } from "@/lib/composition/layers";

/**
 * Bold has to be a FILE, and these guard the gap between claiming it and
 * having it.
 *
 * drawtext has no weight parameter — it renders whatever the .ttf contains.
 * So before the Bold files existed, offering a weight control would have
 * previewed bold in the browser (which loads wght@400;700 from Google) and
 * exported Regular. That is the "correct preview, wrong video" failure this
 * repo has been bitten by, and it's why `weight` didn't exist until now.
 *
 * The invariant worth protecting: **every weight the UI can offer has a file
 * on disk.** Add a sixth family to BRAND_FONTS without shipping its two files
 * and this fails, rather than a user discovering it in a rendered MP4.
 */

const FONT_DIR = join(process.cwd(), "public", "fonts");

/** Mirrors export.ts's FONT_FILES. Asserted equal to it below. */
const EXPECTED: Record<string, Record<400 | 700, string>> = {
  Inter: { 400: "Inter.ttf", 700: "Inter-Bold.ttf" },
  Montserrat: { 400: "Montserrat.ttf", 700: "Montserrat-Bold.ttf" },
  "Playfair Display": {
    400: "PlayfairDisplay.ttf",
    700: "PlayfairDisplay-Bold.ttf",
  },
  Lora: { 400: "Lora.ttf", 700: "Lora-Bold.ttf" },
  Roboto: { 400: "Roboto.ttf", 700: "Roboto-Bold.ttf" },
  Anton: { 400: "Anton-Regular.ttf", 700: "Anton-Regular.ttf" },
  "Bebas Neue": { 400: "BebasNeue-Regular.ttf", 700: "BebasNeue-Regular.ttf" },
  "Alfa Slab One": {
    400: "AlfaSlabOne-Regular.ttf",
    700: "AlfaSlabOne-Regular.ttf",
  },
  Bungee: { 400: "Bungee-Regular.ttf", 700: "Bungee-Regular.ttf" },
  Rye: { 400: "Rye-Regular.ttf", 700: "Rye-Regular.ttf" },
  "Special Elite": {
    400: "SpecialElite-Regular.ttf",
    700: "SpecialElite-Regular.ttf",
  },
};

/** Families that ship two real cuts. The rest are display faces, one cut. */
const TWO_WEIGHT = new Set([
  "Inter",
  "Montserrat",
  "Playfair Display",
  "Lora",
  "Roboto",
]);

/** usWeightClass out of the OS/2 table, and whether the font is variable. */
function fontFacts(file: string): { weightClass: number; variable: boolean } {
  const d = readFileSync(join(FONT_DIR, file));
  const numTables = d.readUInt16BE(4);
  const tags: string[] = [];
  let os2Offset = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = d.toString("latin1", rec, rec + 4);
    tags.push(tag);
    if (tag === "OS/2") os2Offset = d.readUInt32BE(rec + 8);
  }
  return {
    weightClass: os2Offset >= 0 ? d.readUInt16BE(os2Offset + 4) : -1,
    variable: tags.includes("fvar"),
  };
}

describe("every offered weight has a file", () => {
  it("covers all BRAND_FONTS at 400 and 700", () => {
    for (const family of BRAND_FONTS) {
      expect(EXPECTED[family], `${family} has no file mapping`).toBeDefined();
      for (const w of [400, 700] as const) {
        const file = EXPECTED[family][w];
        expect(
          existsSync(join(FONT_DIR, file)),
          `${family} ${w} → public/fonts/${file} is missing`,
        ).toBe(true);
      }
    }
  });

  it("the Bold files are actually bold, and actually static", () => {
    // The bug this catches: shipping a variable font, or the Regular renamed.
    // Either previews bold and exports 400 — silently.
    for (const family of BRAND_FONTS.filter((f) => TWO_WEIGHT.has(f))) {
      const { weightClass, variable } = fontFacts(EXPECTED[family][700]);
      expect(weightClass, `${family} Bold usWeightClass`).toBe(700);
      expect(variable, `${family} Bold is still variable`).toBe(false);
    }
  });

  it("the Regular files are still 400", () => {
    for (const family of BRAND_FONTS) {
      expect(fontFacts(EXPECTED[family][400]).weightClass).toBe(400);
    }
  });

  it("no shipped font is variable", () => {
    // A variable font renders its DEFAULT instance wherever axes can't be set,
    // which is everywhere in this pipeline.
    for (const family of BRAND_FONTS) {
      for (const w of [400, 700] as const) {
        expect(fontFacts(EXPECTED[family][w]).variable, family).toBe(false);
      }
    }
  });

  it("Bold and Regular are different files where a Bold is claimed", () => {
    // Pointing both weights at one file is the lazy "fix" that reintroduces
    // exactly the mismatch this whole change exists to remove — but it is the
    // CORRECT thing for a display face, which is why those don't offer 700.
    for (const family of BRAND_FONTS) {
      const twoFiles = EXPECTED[family][400] !== EXPECTED[family][700];
      expect(twoFiles, `${family}`).toBe(TWO_WEIGHT.has(family));
      expect(weightsFor(family).includes(700), `${family} offers 700`).toBe(
        TWO_WEIGHT.has(family),
      );
    }
  });

  it("never offers a weight the family has no cut for", () => {
    // The faux-bold trap: canvas SYNTHESISES bold for a single-weight family
    // and looks convincing; drawtext opens the Regular file and renders
    // Regular. Offering it would recreate the mismatch in a new place.
    for (const family of BRAND_FONTS) {
      for (const w of weightsFor(family)) {
        expect(fontFacts(EXPECTED[family][w]).weightClass).toBe(w);
      }
    }
  });
});

describe("weightOf", () => {
  it("defaults to Regular, so pre-existing compositions render unchanged", () => {
    expect(weightOf({})).toBe(400);
    expect(weightOf({ font: "Inter", weight: undefined })).toBe(400);
  });

  it("passes an explicit weight through when the family has it", () => {
    expect(weightOf({ font: "Inter", weight: 700 })).toBe(700);
    expect(weightOf({ font: "Inter", weight: 400 })).toBe(400);
  });

  it("clamps a Bold the family has no file for", () => {
    // Belt and braces with the UI: a stored 700 can arrive from an older doc
    // or a hand-edited payload, and the canvas must not fake what the export
    // can't produce.
    expect(weightOf({ font: "Anton", weight: 700 })).toBe(400);
    expect(weightOf({ font: "Bebas Neue", weight: 700 })).toBe(400);
    expect(weightOf({ font: "Special Elite", weight: 700 })).toBe(400);
  });

  it("clamps an unknown family rather than trusting it", () => {
    expect(weightOf({ font: "Comic Sans MS", weight: 700 })).toBe(400);
  });
});
