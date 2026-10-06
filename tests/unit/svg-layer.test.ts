import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { downloadLayerImage } from "@/lib/composition/export";
import { isSvg, svgToPng } from "@/lib/composition/svg-raster";

/**
 * FFmpeg has no SVG decoder, so an ad with a vector layer (a traced logo)
 * locked fine and then failed to render: "no decoder found for: svg". The
 * preview draws SVG natively, which is why nothing looked wrong until export.
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect x="50" y="25" width="100" height="50" fill="#e11"/></svg>`;
const asDataUrl = (s: string | Buffer, type = "image/svg+xml") =>
  `data:${type};base64,${Buffer.from(s).toString("base64")}`;

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "svg-layer-"));
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe("isSvg", () => {
  it("recognises the shapes an SVG file really comes in", () => {
    expect(isSvg(Buffer.from(SVG))).toBe(true);
    expect(isSvg(Buffer.from(`<?xml version="1.0"?>\n${SVG}`))).toBe(true);
    expect(
      isSvg(Buffer.from(`﻿<?xml version="1.0"?><!-- logo -->\n${SVG}`)),
    ).toBe(true);
    expect(isSvg(Buffer.from(SVG.toUpperCase()))).toBe(true);
    expect(isSvg(Buffer.from(`  \n\t${SVG}`))).toBe(true);
  });

  it("does not mistake a raster for one", async () => {
    const png = await sharp({
      create: { width: 4, height: 4, channels: 4, background: "#fff" },
    })
      .png()
      .toBuffer();
    const jpg = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#fff" },
    })
      .jpeg()
      .toBuffer();
    const webp = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#fff" },
    })
      .webp()
      .toBuffer();
    expect(isSvg(png)).toBe(false);
    expect(isSvg(jpg)).toBe(false);
    expect(isSvg(webp)).toBe(false);
  });

  it("does not mistake other text for one", () => {
    expect(isSvg(Buffer.from("<html><body>not an image</body></html>"))).toBe(
      false,
    );
    expect(isSvg(Buffer.alloc(0))).toBe(false);
  });
});

describe("svgToPng", () => {
  it("rasterises at the SVG's own size, which the layer's scale then applies to", async () => {
    const meta = await sharp(await svgToPng(Buffer.from(SVG))).metadata();
    expect(meta.format).toBe("png");
    expect([meta.width, meta.height]).toEqual([200, 100]);
  });

  it("keeps transparency — a logo must not gain a white box", async () => {
    const { data, info } = await sharp(await svgToPng(Buffer.from(SVG)))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0); // top-left corner is outside the rect
    const mid =
      (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) *
      4;
    expect(data[mid + 3]).toBe(255); // the rect itself is opaque
    expect(data[mid]).toBeGreaterThan(200); // …and red
  });
});

describe("downloadLayerImage — what the export hands FFmpeg", () => {
  it("turns an SVG layer into a PNG file", async () => {
    const out = join(dir, "svg.img");
    await downloadLayerImage(asDataUrl(SVG), out);
    expect((await sharp(await readFile(out)).metadata()).format).toBe("png");
  });

  it("recognises an SVG by its content even when it is labelled as something else", async () => {
    const out = join(dir, "mislabelled.img");
    await downloadLayerImage(asDataUrl(SVG, "application/octet-stream"), out);
    expect((await sharp(await readFile(out)).metadata()).format).toBe("png");
  });

  it("leaves a raster layer's bytes exactly as they were", async () => {
    const jpg = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#09c" },
    })
      .jpeg()
      .toBuffer();
    const out = join(dir, "photo.img");
    await downloadLayerImage(asDataUrl(jpg, "image/jpeg"), out);
    expect((await readFile(out)).equals(jpg)).toBe(true);
  });
});
