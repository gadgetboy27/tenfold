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
    expect(CREDIT_COSTS.logo_concepts).toBeGreaterThan(CREDIT_COSTS.logo_refine);
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
    expect(validateVectorizeUpload({ name: "logo.png", size: 0 })).toBe("empty");
  });

  it("rejects an unsupported type", () => {
    expect(validateVectorizeUpload({ name: "logo.svg", size: 100 })).toBe("type");
    expect(validateVectorizeUpload({ name: "logo.gif", size: 100 })).toBe("type");
    expect(validateVectorizeUpload({ name: "logo", size: 100 })).toBe("type");
  });

  it("rejects a file over 5 MB", () => {
    expect(
      validateVectorizeUpload({ name: "logo.png", size: VECTORIZE_MAX_BYTES + 1 }),
    ).toBe("size");
  });
});
