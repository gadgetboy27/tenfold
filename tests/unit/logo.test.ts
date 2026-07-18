import { describe, it, expect } from "vitest";
import { CREDIT_COSTS } from "@/lib/credits/costs";
import { logoBriefSchema, type LogoBrief } from "@/lib/logo/brief";
import {
  composeLogoPrompt,
  composeRefinePrompt,
} from "@/lib/logo/promptComposer";
import {
  validateVectorizeUpload,
  VECTORIZE_MAX_BYTES,
} from "@/lib/logo/upload";
import {
  extractFills,
  backgroundFill,
  setBackground,
  applyBrandPalette,
  recolor,
  rgbToHex,
  hexToRgb,
} from "@/lib/logo/svg";

// Phase 1 unit coverage: the pure pieces the whole studio rests on — the brief
// schema (defaults + the one required field), the prompt composer (type/colour/
// personality mapping), and the new credit costs. The route/webhook plumbing is
// exercised end-to-end in integration; these lock the deterministic logic.

const baseBrief = (over: Partial<LogoBrief> = {}): LogoBrief =>
  logoBriefSchema.parse({ businessName: "Acme", ...over });

describe("logo credit costs", () => {
  it("defines every Phase-1 logo job type with a positive cost", () => {
    for (const key of [
      "logo_concepts",
      "logo_refine",
      "logo_finalize",
      "logo_vectorize",
      "logo_mockups",
      "brand_package",
    ] as const) {
      expect(CREDIT_COSTS[key], key).toBeGreaterThan(0);
    }
  });

  it("prices concepts above a single refine", () => {
    expect(CREDIT_COSTS.logo_concepts).toBeGreaterThan(
      CREDIT_COSTS.logo_refine,
    );
  });
});

describe("logoBriefSchema", () => {
  it("requires a business name", () => {
    expect(logoBriefSchema.safeParse({}).success).toBe(false);
    expect(logoBriefSchema.safeParse({ businessName: "" }).success).toBe(false);
  });

  it("defaults type, colour, personality and notes when omitted", () => {
    const b = baseBrief();
    expect(b.logoType).toBe("combination");
    expect(b.colorDirection).toBe("auto");
    expect(b.personality).toEqual({
      classicModern: 50,
      playfulSerious: 50,
      minimalDetailed: 50,
      warmCool: 50,
    });
    expect(b.notes).toBe("");
  });

  it("rejects an unknown logo type", () => {
    const r = logoBriefSchema.safeParse({
      businessName: "Acme",
      logoType: "mascot",
    });
    expect(r.success).toBe(false);
  });

  it("rejects personality values out of the 0–100 range", () => {
    const r = logoBriefSchema.safeParse({
      businessName: "Acme",
      personality: { classicModern: 150 },
    });
    expect(r.success).toBe(false);
  });
});

describe("composeLogoPrompt", () => {
  it("embeds the exact name in quotes for a wordmark", () => {
    const { prompt } = composeLogoPrompt(
      baseBrief({ businessName: "Acme Coffee", logoType: "wordmark" }),
    );
    expect(prompt).toContain('"Acme Coffee"');
    expect(prompt).toContain("no separate icon");
  });

  it("omits any name for a text-free icon", () => {
    const { prompt } = composeLogoPrompt(
      baseBrief({ businessName: "Acme", logoType: "icon" }),
    );
    expect(prompt).toContain("no text");
    expect(prompt).not.toContain('"Acme"');
  });

  it("returns no palette for auto and a palette otherwise", () => {
    expect(composeLogoPrompt(baseBrief()).colors).toBeUndefined();
    const bold = composeLogoPrompt(baseBrief({ colorDirection: "bold" }));
    expect(bold.colors?.length).toBeGreaterThan(0);
    // Palette entries are 0–255 RGB triples for Recraft.
    for (const c of bold.colors ?? []) {
      for (const v of [c.r, c.g, c.b]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });

  it("adds a descriptor only when a slider leaves the neutral band", () => {
    const neutral = composeLogoPrompt(baseBrief()).prompt;
    expect(neutral).not.toContain("modern, contemporary");
    const modern = composeLogoPrompt(
      baseBrief({
        personality: {
          classicModern: 90,
          playfulSerious: 50,
          minimalDetailed: 50,
          warmCool: 50,
        },
      }),
    ).prompt;
    expect(modern).toContain("modern, contemporary");
  });

  it("includes the industry phrase when provided", () => {
    const { prompt } = composeLogoPrompt(baseBrief({ industry: "coffee" }));
    expect(prompt).toContain("for a coffee business");
  });
});

describe("composeRefinePrompt", () => {
  it("wraps a user instruction and keeps the vector guardrail", () => {
    expect(composeRefinePrompt("make it bolder")).toContain("make it bolder");
    expect(composeRefinePrompt("make it bolder")).toContain("flat vector logo");
  });

  it("falls back to a clean-up prompt when empty", () => {
    expect(composeRefinePrompt("  ")).toContain("refine and clean up");
  });
});

describe("validateVectorizeUpload", () => {
  it("accepts a small png/jpg/webp", () => {
    for (const name of ["logo.png", "logo.JPG", "logo.jpeg", "logo.webp"]) {
      expect(validateVectorizeUpload({ name, size: 1000 })).toBeNull();
    }
  });

  it("rejects an empty file", () => {
    expect(validateVectorizeUpload({ name: "logo.png", size: 0 })).toBe(
      "empty",
    );
  });

  it("rejects an unsupported type", () => {
    expect(validateVectorizeUpload({ name: "logo.svg", size: 100 })).toBe(
      "type",
    );
    expect(validateVectorizeUpload({ name: "logo.gif", size: 100 })).toBe(
      "type",
    );
    expect(validateVectorizeUpload({ name: "logo", size: 100 })).toBe("type");
  });

  it("rejects a file over 5 MB", () => {
    expect(
      validateVectorizeUpload({
        name: "logo.png",
        size: VECTORIZE_MAX_BYTES + 1,
      }),
    ).toBe("size");
  });
});

// Fixture mirrors real Recraft output: flat <path> list, fill="rgb(...)", the
// first path is the full-canvas background rect. Verified against live SVGs.
const FIXTURE = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048" width="1024" height="1024">',
  '<path d="M 0 0 L 2048 0 L 2048 2048 L 0 2048 L 0 0 z" fill="rgb(248,248,246)"></path>',
  '<path d="M 100 100 L 200 200 z" fill="rgb(29,53,87)"></path>',
  '<path d="M 300 300 L 400 400 z" fill="rgb(29,53,87)"></path>',
  '<path d="M 500 500 L 600 600 z" fill="rgb(230,57,70)"></path>',
  "</svg>",
].join("\n");

describe("svg colour helpers", () => {
  it("round-trips rgb ↔ hex", () => {
    expect(rgbToHex("rgb(230,57,70)")).toBe("#e63946");
    expect(hexToRgb("#e63946")).toBe("rgb(230,57,70)");
    expect(hexToRgb("#fff")).toBe("rgb(255,255,255)");
  });

  it("extracts distinct fills, most-used first, with hex", () => {
    const fills = extractFills(FIXTURE);
    expect(fills.map((f) => f.value)).toEqual([
      "rgb(29,53,87)", // ×2
      "rgb(248,248,246)", // ×1 (background)
      "rgb(230,57,70)", // ×1
    ]);
    expect(fills[0].count).toBe(2);
    expect(fills[0].hex).toBe("#1d3557");
  });

  it("recolours only whole fill attributes", () => {
    const out = recolor(FIXTURE, { "rgb(29,53,87)": "rgb(0,255,0)" });
    expect(out).toContain('fill="rgb(0,255,0)"');
    expect(out).not.toContain('fill="rgb(29,53,87)"');
    // The other colours are untouched.
    expect(out).toContain('fill="rgb(230,57,70)"');
  });
});

describe("svg background", () => {
  it("detects the full-canvas background fill", () => {
    expect(backgroundFill(FIXTURE)).toBe("rgb(248,248,246)");
  });

  it("returns null when there is no covering background rect", () => {
    const noBg = FIXTURE.replace(
      '<path d="M 0 0 L 2048 0 L 2048 2048 L 0 2048 L 0 0 z" fill="rgb(248,248,246)"></path>\n',
      "",
    );
    expect(backgroundFill(noBg)).toBeNull();
  });

  it("makes the background transparent without touching foreground", () => {
    const out = setBackground(FIXTURE, "transparent");
    expect(backgroundFill(out)).toBe("none");
    expect(out).toContain('fill="rgb(29,53,87)"'); // foreground intact
  });

  it("sets light, dark and brand backgrounds", () => {
    expect(backgroundFill(setBackground(FIXTURE, "light"))).toBe(
      "rgb(255,255,255)",
    );
    expect(backgroundFill(setBackground(FIXTURE, "dark"))).toBe(
      "rgb(17,17,17)",
    );
    expect(backgroundFill(setBackground(FIXTURE, "brand", "#e63946"))).toBe(
      "rgb(230,57,70)",
    );
  });
});

describe("applyBrandPalette", () => {
  it("maps foreground fills onto the palette but preserves the background", () => {
    const out = applyBrandPalette(FIXTURE, ["#112233", "#445566"]);
    // Most-used foreground → palette[0], next → palette[1].
    expect(out).toContain(hexToRgb("#112233"));
    expect(out).toContain(hexToRgb("#445566"));
    // Background untouched.
    expect(backgroundFill(out)).toBe("rgb(248,248,246)");
  });

  it("leaves the svg unchanged for an empty palette", () => {
    expect(applyBrandPalette(FIXTURE, [])).toBe(FIXTURE);
  });
});

describe("brand package builder", () => {
  it("produces the full deliverable set with valid buffers", async () => {
    const { buildLogoBundle } = await import("@/lib/logo/package");
    const files = await buildLogoBundle(FIXTURE);
    const paths = files.map((f) => f.path);

    // Representative files from each group are present.
    expect(paths).toContain("png/logo-1024-transparent.png");
    expect(paths).toContain("png/logo-2048-dark.png");
    expect(paths).toContain("jpg/logo-1024-white.jpg");
    expect(paths).toContain("variants/logo-black.png");
    expect(paths).toContain("svg/logo-mono.svg");
    expect(paths).toContain("favicon/favicon.ico");
    expect(paths).toContain("pdf/logo.pdf");
    expect(paths).toContain("README.txt");
    expect(paths.some((p) => p.startsWith("social/"))).toBe(true);

    const byPath = (p: string) => files.find((f) => f.path === p)!.buffer;
    // ICO magic: reserved=0, type=1.
    const ico = byPath("favicon/favicon.ico");
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    // PDF + PNG headers.
    expect(byPath("pdf/logo.pdf").subarray(0, 5).toString()).toBe("%PDF-");
    expect(
      byPath("png/logo-1024-transparent.png").subarray(1, 4).toString(),
    ).toBe("PNG");
    // The black variant SVG really recoloured to black.
    expect(byPath("svg/logo-black.svg").toString()).toContain(
      'fill="rgb(0,0,0)"',
    );
  }, 30000);

  it("extracts the palette as hex, excluding the background", async () => {
    const { paletteFromSvg } = await import("@/lib/logo/package");
    const palette = paletteFromSvg(FIXTURE);
    expect(palette).toContain("#1d3557");
    expect(palette).toContain("#e63946");
    expect(palette).not.toContain("#f8f8f6"); // background excluded
  });
});

describe("social sizes", () => {
  it("has positive, uniquely-keyed dimensions", async () => {
    const { SOCIAL_SIZES } = await import("@/lib/logo/socialSizes");
    const keys = SOCIAL_SIZES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const s of SOCIAL_SIZES) {
      expect(s.width).toBeGreaterThan(0);
      expect(s.height).toBeGreaterThan(0);
    }
    expect(SOCIAL_SIZES.some((s) => s.kind === "cover")).toBe(true);
  });
});
