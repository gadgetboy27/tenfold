import { describe, it, expect } from "vitest";
import {
  composeWordmark,
  coerceFont,
  escapeXml,
  markAspect,
  DEFAULT_WORDMARK,
} from "@/lib/logo/wordmark";
import { SUPPORTED_FONTS } from "@/lib/logo/font-list";

/**
 * What these guard: importing your own logo used to land on the AI refine
 * screen, so the lockup composer is new surface with no prior coverage. The
 * geometry is an estimate by design, but the DEGENERATE cases are not — an
 * empty name or a missing mark must still produce a valid, non-empty SVG,
 * because the alternative is a blank canvas that reads as "the import failed".
 */

const MARK =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100"/></svg>';
const base = { ...DEFAULT_WORDMARK, markSvg: MARK, text: "Oho Coffee" };

describe("font safety", () => {
  it("refuses a face the compositor cannot draw", () => {
    // The picker is constrained to BRAND_FONTS; anything else would render in
    // the editor and silently fall back everywhere downstream.
    expect(coerceFont("Comic Sans MS")).toBe("Montserrat");
    expect(coerceFont(undefined)).toBe("Montserrat");
    expect(coerceFont(42)).toBe("Montserrat");
    for (const f of SUPPORTED_FONTS) expect(coerceFont(f)).toBe(f);
  });

  it("names the real family when saving, the scoped one only for preview", () => {
    expect(composeWordmark({ ...base, font: "Lora" })).toContain(
      'font-family="Lora, sans-serif"',
    );
    expect(
      composeWordmark({
        ...base,
        font: "Lora",
        previewFontFamily: "__scoped_abc",
      }),
    ).toContain('font-family="__scoped_abc"');
  });
});

describe("escaping", () => {
  it("survives a business name with XML metacharacters", () => {
    const svg = composeWordmark({ ...base, text: 'Ben & "Jerry" <Co>' });
    expect(svg).toContain("Ben &amp; &quot;Jerry&quot; &lt;Co&gt;");
    // The raw form would break the document.
    expect(svg).not.toContain('"Jerry"');
  });

  it("escapes each metacharacter exactly once", () => {
    expect(escapeXml("&")).toBe("&amp;");
    expect(escapeXml("&amp;")).toBe("&amp;amp;");
  });
});

describe("mark aspect", () => {
  it("reads the viewBox", () => {
    expect(markAspect(MARK)).toBe(2);
  });
  it("falls back to width/height", () => {
    expect(markAspect('<svg width="300" height="100"></svg>')).toBe(3);
  });
  it("assumes square when it can't tell", () => {
    // Square is at worst slightly stretched; zero would drop the mark entirely
    // and look like a failed import.
    expect(markAspect("<svg></svg>")).toBe(1);
    expect(markAspect('<svg viewBox="0 0 0 0"></svg>')).toBe(1);
  });
});

describe("degenerate lockups still render", () => {
  it("falls back to text-only when there is no mark", () => {
    const svg = composeWordmark({ ...base, markSvg: null, layout: "stacked" });
    expect(svg).toContain("<text");
    expect(svg).toContain("Oho Coffee");
    // No empty space reserved for a mark that isn't there.
    expect(svg.match(/<svg/g)).toHaveLength(1);
  });

  it("falls back to mark-only when the name is blank", () => {
    const svg = composeWordmark({ ...base, text: "   ", layout: "horizontal" });
    expect(svg).not.toContain("<text");
    expect(svg).toContain("<rect");
  });

  it("produces a valid document even with neither", () => {
    const svg = composeWordmark({ ...base, markSvg: null, text: "" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("never emits a non-positive viewBox", () => {
    for (const layout of [
      "stacked",
      "horizontal",
      "text-only",
      "mark-only",
    ] as const) {
      const svg = composeWordmark({ ...base, layout });
      const vb = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      expect(vb, layout).toBeTruthy();
      expect(Number(vb![1]), layout).toBeGreaterThan(0);
      expect(Number(vb![2]), layout).toBeGreaterThan(0);
    }
  });
});

describe("nested mark", () => {
  it("keeps the mark's own viewBox so it isn't re-scaled by hand", () => {
    const svg = composeWordmark(base);
    expect(svg).toContain('viewBox="0 0 200 100"');
  });

  it("overrides the mark's own sizing rather than letting it win", () => {
    const sized =
      '<svg xmlns="http://www.w3.org/2000/svg" width="999" height="999" viewBox="0 0 10 10"><rect/></svg>';
    const svg = composeWordmark({ ...base, markSvg: sized });
    expect(svg).not.toContain('width="999"');
  });

  it("drops an XML prolog and doctype that would be illegal when nested", () => {
    const withProlog =
      '<?xml version="1.0"?><!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect/></svg>';
    const svg = composeWordmark({ ...base, markSvg: withProlog });
    expect(svg).not.toContain("<?xml");
    expect(svg).not.toContain("<!DOCTYPE");
  });
});
