import { describe, it, expect } from "vitest";
import { extractBrandSignals } from "@/lib/claude/brand-scrape";

/**
 * A website usually sets two faces — a display face on headings and a text
 * face on body — and an ad that borrows only one reads as almost-the-site.
 * The importer used to take the first Google Fonts family and stop.
 */
describe("heading + body font detection", () => {
  it("reads explicit heading and body rules from inline CSS", () => {
    const html = `<html><head><style>
      body { font-family: "Open Sans", sans-serif; }
      h1, h2 { font-family: 'Playfair Display', serif; }
    </style></head><body></body></html>`;
    const { fonts, fontFamily } = extractBrandSignals(html);
    expect(fonts.heading).toEqual({
      name: "Playfair Display",
      mapped: "Playfair Display",
    });
    expect(fonts.body).toEqual({ name: "Open Sans", mapped: "Inter" });
    expect(fontFamily).toBe("Playfair Display"); // the one-font view = heading
  });

  it("falls back to Google Fonts load order: display face first, text face second", () => {
    const html = `<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&amp;family=Lato:wght@400&display=swap" rel="stylesheet">`;
    const { fonts } = extractBrandSignals(html);
    expect(fonts.heading).toEqual({ name: "Poppins", mapped: "Montserrat" });
    expect(fonts.body).toEqual({ name: "Lato", mapped: "Inter" });
  });

  it("uses one family for both when the site only has one", () => {
    const html = `<link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Montserrat:400,700">`;
    const { fonts } = extractBrandSignals(html);
    expect(fonts.heading?.name).toBe("Montserrat");
    expect(fonts.body?.name).toBe("Montserrat");
  });

  it("keeps the site's real name even when nothing we ship is close", () => {
    const html = `<style>h1 { font-family: "Comic Neue", cursive }</style>`;
    const { fonts } = extractBrandSignals(html);
    expect(fonts.heading).toEqual({ name: "Comic Neue", mapped: null });
  });

  it("ignores generic families and reports nothing for a silent page", () => {
    const html = `<style>body { font-family: sans-serif }</style>`;
    const { fonts, fontFamily } = extractBrandSignals(html);
    expect(fonts.heading).toBeNull();
    expect(fonts.body).toBeNull();
    expect(fontFamily).toBeNull();
  });

  it("explicit CSS beats load order", () => {
    const html = `<link href="https://fonts.googleapis.com/css2?family=Lato&family=Merriweather" rel="stylesheet">
      <style>.hero-title { font-family: Merriweather, serif } p { font-family: Lato }</style>`;
    const { fonts } = extractBrandSignals(html);
    expect(fonts.heading?.name).toBe("Merriweather");
    expect(fonts.heading?.mapped).toBe("Lora");
    expect(fonts.body?.name).toBe("Lato");
  });
});
