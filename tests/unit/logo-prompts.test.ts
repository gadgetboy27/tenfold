import { describe, it, expect } from "vitest";
import {
  buildLogoPrompt,
  isLogoStyle,
  LOGO_STYLES,
  LOGO_STYLE_LABELS,
} from "@/lib/logo/prompts";

/**
 * The logo prompt engineering — the from-scratch core of the builder. A logo is
 * not a photo, so the job of these prompts is to force the model AWAY from its
 * photorealistic default and toward flat, iconic, reproducible marks.
 */

describe("buildLogoPrompt", () => {
  it("always includes the logo spine and a negative prompt", () => {
    const { prompt, negativePrompt } = buildLogoPrompt({
      brandName: "Acme",
      style: "minimalist",
    });
    // The spine is what makes it a LOGO, not an image.
    expect(prompt).toMatch(/logo/i);
    expect(prompt).toMatch(/flat design|vector/i);
    expect(prompt).toMatch(/white background/i);
    // The negative prompt is what keeps a photo/clutter from creeping in.
    expect(negativePrompt).toMatch(/photograph|photorealistic/i);
    expect(negativePrompt).toMatch(/gibberish text|misspelled/i);
  });

  it("steers a wordmark toward the exact brand name, spelled correctly", () => {
    // Wordmarks live or die on spelling — the model must be told the letters.
    const { prompt } = buildLogoPrompt({
      brandName: "Northshore",
      style: "wordmark",
    });
    expect(prompt).toContain('"Northshore"');
    expect(prompt).toMatch(/spelled correctly/i);
  });

  it("references the brand by name for non-wordmark styles without demanding text", () => {
    const { prompt } = buildLogoPrompt({
      brandName: "Northshore",
      style: "icon",
    });
    expect(prompt).toContain('"Northshore"');
    // An icon shouldn't be told to render the text literally.
    expect(prompt).not.toMatch(/spelled correctly/i);
  });

  it("folds an optional brief into the prompt", () => {
    const { prompt } = buildLogoPrompt({
      brandName: "Acme",
      style: "tech",
      brief: "deep blue, fintech",
    });
    expect(prompt).toContain("deep blue, fintech");
  });

  it("omits an empty brand name cleanly (no dangling quotes)", () => {
    const { prompt } = buildLogoPrompt({ brandName: "   ", style: "emblem" });
    expect(prompt).not.toContain('""');
    expect(prompt).toMatch(/logo/i);
  });

  it("gives every style its own distinct direction", () => {
    const prompts = LOGO_STYLES.map(
      (style) => buildLogoPrompt({ brandName: "Acme", style }).prompt,
    );
    // No two styles should produce the same prompt.
    expect(new Set(prompts).size).toBe(LOGO_STYLES.length);
  });
});

describe("style registry", () => {
  it("has a label for every style", () => {
    for (const s of LOGO_STYLES) {
      expect(LOGO_STYLE_LABELS[s]).toBeTruthy();
    }
  });

  it("validates known and rejects unknown styles", () => {
    expect(isLogoStyle("minimalist")).toBe(true);
    expect(isLogoStyle("wordmark")).toBe(true);
    expect(isLogoStyle("hologram")).toBe(false);
    expect(isLogoStyle("")).toBe(false);
  });
});
