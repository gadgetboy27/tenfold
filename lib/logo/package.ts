import sharp from "sharp";
import pngToIco from "png-to-ico";
import { PDFDocument } from "pdf-lib";
import { recolor, setBackground, extractFills, backgroundFill } from "./svg";
import { SOCIAL_SIZES } from "./socialSizes";

// The deliverables machine (Phase 3). Given a finalized logo SVG, produce every
// file a business needs: master PNGs, colour/background variants, JPG, favicon
// .ico, social profile/cover set, a PDF, and a README. Pure over its input —
// deterministic buffers, no I/O — so the route just zips + uploads the result.
//
// All rasterization is Sharp (bundled librsvg). Colour + background variants
// reuse the Phase 2 svg.ts transforms BEFORE rasterizing, so a "black on
// transparent" PNG is a real recolour, not a filter.

export interface BundleFile {
  path: string;
  buffer: Buffer;
}

const MASTER_SIZES = [512, 1024, 2048];
const FAVICON_SIZES = [16, 32, 48, 256];

async function rasterize(
  svg: string,
  w: number,
  h: number = w,
): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 384 })
    .resize(w, h, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

/** Collapse every foreground fill to one colour (single-colour "mono" mark). */
function monochrome(svg: string, rgb: string): string {
  const bg = backgroundFill(svg);
  const fg = extractFills(svg).filter((f) => f.value !== bg);
  return recolor(svg, Object.fromEntries(fg.map((f) => [f.value, rgb])));
}

export async function buildLogoBundle(svg: string): Promise<BundleFile[]> {
  const files: BundleFile[] = [];
  const transparent = setBackground(svg, "transparent");
  const white = setBackground(svg, "light");
  const dark = setBackground(svg, "dark");

  // 1. Master PNGs: each size on transparent / white / dark.
  for (const size of MASTER_SIZES) {
    files.push(
      {
        path: `png/logo-${size}-transparent.png`,
        buffer: await rasterize(transparent, size),
      },
      {
        path: `png/logo-${size}-white.png`,
        buffer: await rasterize(white, size),
      },
      {
        path: `png/logo-${size}-dark.png`,
        buffer: await rasterize(dark, size),
      },
    );
  }

  // 2. JPG (no alpha — must be flattened onto white).
  files.push({
    path: "jpg/logo-1024-white.jpg",
    buffer: await sharp(Buffer.from(white), { density: 384 })
      .resize(1024, 1024, { fit: "contain", background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer(),
  });

  // 3. Colour variants (full / black / white / mono) at 1024, transparent.
  const primaryFg =
    extractFills(svg).find((f) => f.value !== backgroundFill(svg))?.value ??
    "rgb(0,0,0)";
  const variants: Record<string, string> = {
    full: transparent,
    black: monochrome(transparent, "rgb(0,0,0)"),
    white: monochrome(transparent, "rgb(255,255,255)"),
    mono: monochrome(transparent, primaryFg),
  };
  for (const [name, variantSvg] of Object.entries(variants)) {
    files.push({
      path: `variants/logo-${name}.png`,
      buffer: await rasterize(variantSvg, 1024),
    });
    files.push({
      path: `svg/logo-${name}.svg`,
      buffer: Buffer.from(variantSvg, "utf8"),
    });
  }

  // 4. Favicon .ico (multi-size, PNG-compressed entries).
  const faviconPngs = await Promise.all(
    FAVICON_SIZES.map((s) => rasterize(transparent, s)),
  );
  files.push({
    path: "favicon/favicon.ico",
    buffer: await pngToIco(faviconPngs),
  });

  // 5. Social profile + cover set — logo centred on each platform's canvas.
  for (const s of SOCIAL_SIZES) {
    const src = s.kind === "profile" ? transparent : white;
    files.push({
      path: `social/${s.key}-${s.width}x${s.height}.png`,
      buffer: await rasterize(src, s.width, s.height),
    });
  }

  // 6. One-page PDF embedding the 1024 white raster.
  const pdf = await PDFDocument.create();
  const png1024White = await rasterize(white, 1024);
  const img = await pdf.embedPng(png1024White);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  files.push({ path: "pdf/logo.pdf", buffer: Buffer.from(await pdf.save()) });

  // 7. README.
  files.push({
    path: "README.txt",
    buffer: Buffer.from(buildReadme(), "utf8"),
  });

  return files;
}

export function buildReadme(): string {
  return [
    "YOUR BRAND PACKAGE",
    "==================",
    "",
    "svg/         Vector logos — infinitely scalable. Use these wherever you can.",
    "             full = original colours, black / white = single-colour, mono = one-tone.",
    "png/         Raster logos at 512/2048px on transparent, white and dark backgrounds.",
    "             Use transparent on photos, white/dark to match the surface.",
    "jpg/         Flattened logo on white — for tools that reject PNG/SVG.",
    "variants/    Quick single-colour PNGs (full/black/white/mono).",
    "favicon/     favicon.ico (16–256px) for your website tab icon.",
    "social/      Correctly-sized profile pictures and cover banners per platform.",
    "pdf/         Print-ready single-page logo.",
    "",
    "Tip: prefer SVG. Reach for PNG only when a tool won't take vectors.",
    "",
    "Generated by Tenfold — tenfold.nz",
  ].join("\n");
}

/**
 * The logo's palette as hex, most-used first, for writing into the workspace
 * brand kit. Background fill excluded — it's a canvas, not a brand colour.
 */
export function paletteFromSvg(svg: string): string[] {
  const bg = backgroundFill(svg);
  return extractFills(svg)
    .filter((f) => f.value !== bg)
    .map((f) => f.hex);
}
