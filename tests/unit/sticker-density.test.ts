import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * rasterizeSticker needs a canvas, so it can't run here. What can be pinned is
 * the property that makes a High sticker correct: EVERY size inside it follows
 * `density`. One bare STICKER_FONT_PX left in the body — a glow radius, a
 * stroke width — would stay the 1x size while the glyphs doubled, and a High
 * export would quietly draw every effect at half strength.
 */
const src = readFileSync(
  join(process.cwd(), "lib/composition/sticker.ts"),
  "utf8",
);
const start = src.indexOf("export function rasterizeSticker(");
const body = src.slice(start);

describe("rasterizeSticker honours density", () => {
  it("takes a density, defaulting to 1 so the editor is unchanged", () => {
    expect(body).toMatch(/density = 1,?\s*\)/);
  });

  it("derives every size from one scaled font size", () => {
    expect(body).toContain("const px = STICKER_FONT_PX * density;");
  });

  it("uses the bare constant exactly once — to make that scaled size", () => {
    expect(body.match(/STICKER_FONT_PX/g)).toHaveLength(1);
  });

  it("scales a drawn box and the spray-grain dot size with it", () => {
    expect(body).toContain("spec.boxW * density");
    expect(body).toContain("spec.boxH * density");
    expect(body).toMatch(/\(0\.6 \+ rand\(\) \* 1\.8\) \* density/);
  });

  it("never reads the unscaled box inside the drawing", () => {
    // the only mentions of spec.boxW / spec.boxH are the two scaling lines
    expect(body.match(/spec\.boxW/g)).toHaveLength(2);
    expect(body.match(/spec\.boxH/g)).toHaveLength(2);
  });
});
