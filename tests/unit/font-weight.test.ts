import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { BRAND_FONTS, weightOf } from "@/lib/composition/layers";

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
};

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
    for (const family of BRAND_FONTS) {
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

  it("Bold and Regular are different files", () => {
    // Pointing both weights at one file is the lazy "fix" that reintroduces
    // exactly the mismatch this whole change exists to remove.
    for (const family of BRAND_FONTS) {
      expect(EXPECTED[family][400]).not.toBe(EXPECTED[family][700]);
    }
  });
});

describe("weightOf", () => {
  it("defaults to Regular, so pre-existing compositions render unchanged", () => {
    expect(weightOf({})).toBe(400);
    expect(weightOf({ weight: undefined })).toBe(400);
  });

  it("passes an explicit weight through", () => {
    expect(weightOf({ weight: 700 })).toBe(700);
    expect(weightOf({ weight: 400 })).toBe(400);
  });
});
