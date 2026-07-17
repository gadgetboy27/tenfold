import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * The "built with tenfold" corner mark — applied to assets published by
 * workspaces without the `watermarkFree` entitlement (free/payg only).
 *
 * Applied at PUBLISH time, never baked into the stored source asset. Two
 * reasons: the source stays clean so an upgrade takes effect immediately with
 * no re-render, and the publish route is the only choke point every asset
 * passes through — Step6Publish posts the raw fal.ai clip and the raw anchor
 * still, neither of which goes near the composition pipeline.
 *
 * Derivatives are cached as asset rows tagged `metadata.watermark_of`, so a
 * campaign published to 13 platforms renders the mark once, not 13 times.
 */

/** Wording is deliberate: "built with" credits the user, not us. */
const WORDMARK = "built with <b>tenfold</b>";

/** Lockup width as a fraction of frame width — discreet but legible. */
const LOCKUP_FRACTION = 0.16;
/** Below this the wordmark stops being readable at all, so stop shrinking. */
const MIN_LOCKUP_PX = 120;
/** Inset from the frame edge, as a fraction of the SHORT side (so a 16:9 and
 *  a 9:16 render feel equally inset rather than one hugging the edge). */
const MARGIN_FRACTION = 0.04;

const INTER_TTF = join(process.cwd(), "public", "fonts", "Inter.ttf");

/**
 * The amplification burst (mirrors components/brand/Logo.tsx) in solid white
 * rather than the violet gradient. BRAND.md forbids recolouring outside the
 * palette, but this is the app-icon treatment — white burst on a dark ground —
 * and the gradient turns to mud at 24px over arbitrary footage.
 */
function markSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
    <g fill="#ffffff">
      <rect x="236" y="40" width="40" height="216" rx="20" />
      <rect x="236" y="150" width="40" height="106" rx="20" transform="rotate(60 256 256)" />
      <rect x="236" y="40" width="40" height="216" rx="20" transform="rotate(120 256 256)" />
      <rect x="236" y="150" width="40" height="106" rx="20" transform="rotate(180 256 256)" />
      <rect x="236" y="40" width="40" height="216" rx="20" transform="rotate(240 256 256)" />
      <rect x="236" y="150" width="40" height="106" rx="20" transform="rotate(300 256 256)" />
      <circle cx="256" cy="256" r="34" />
    </g>
  </svg>`;
}

/** Rounded scrim behind the lockup — the mark has to survive a white sky and a
 *  black shadow, so it never sits directly on the footage. */
function scrimSvg(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}"
      fill="#000000" fill-opacity="0.38" />
  </svg>`;
}

let lockupCache: Promise<Buffer> | null = null;

/**
 * Render the lockup once at a generous base size and cache it; consumers scale
 * it down per frame. Building it here (rather than as an SVG composited at
 * render time) keeps all font resolution in one place: sharp's text renderer
 * gets an explicit fontfile, so it never depends on what fontconfig found in
 * the container.
 */
function buildLockup(): Promise<Buffer> {
  return (async () => {
    const textBuf = await sharp({
      text: {
        text: `<span foreground="#ffffff">${WORDMARK}</span>`,
        font: "Inter",
        fontfile: INTER_TTF,
        rgba: true,
        dpi: 220,
      },
    })
      .png()
      .toBuffer();

    const textMeta = await sharp(textBuf).metadata();
    const textW = textMeta.width ?? 260;
    const textH = textMeta.height ?? 40;

    const markSize = Math.round(textH * 1.5);
    const gap = Math.round(markSize * 0.32);
    const padX = Math.round(markSize * 0.55);
    const padY = Math.round(markSize * 0.3);
    const w = padX * 2 + markSize + gap + textW;
    const h = padY * 2 + Math.max(markSize, textH);

    const markBuf = await sharp(Buffer.from(markSvg(markSize)))
      .png()
      .toBuffer();

    return sharp(Buffer.from(scrimSvg(w, h)))
      .composite([
        { input: markBuf, top: Math.round((h - markSize) / 2), left: padX },
        {
          input: textBuf,
          top: Math.round((h - textH) / 2),
          left: padX + markSize + gap,
        },
      ])
      .png()
      .toBuffer();
  })();
}

function lockupPng(): Promise<Buffer> {
  // Cache the PROMISE, not the buffer: concurrent publishes would otherwise
  // each kick off their own render before the first resolved.
  lockupCache ??= buildLockup();
  return lockupCache;
}

/** The lockup sized and positioned for a specific frame. */
async function lockupFor(
  frameW: number,
  frameH: number,
): Promise<{ buf: Buffer; top: number; left: number }> {
  const width = Math.max(MIN_LOCKUP_PX, Math.round(frameW * LOCKUP_FRACTION));
  const buf = await sharp(await lockupPng())
    .resize({ width })
    .png()
    .toBuffer();
  const meta = await sharp(buf).metadata();
  const margin = Math.round(Math.min(frameW, frameH) * MARGIN_FRACTION);
  return {
    buf,
    top: frameH - (meta.height ?? 0) - margin,
    left: frameW - (meta.width ?? 0) - margin,
  };
}

/**
 * Stamp the mark bottom-right on an image, always encoding JPEG.
 *
 * The encode is explicit, not incidental: sharp's bare `.toBuffer()` echoes the
 * INPUT format, so a PNG source would return PNG bytes that we then store at a
 * .jpg path and serve as image/jpeg. Meta and Ayrshare fetch that URL and are
 * entitled to reject the mismatch.
 */
export async function watermarkImageBuffer(input: Buffer): Promise<Buffer> {
  const img = sharp(input);
  const meta = await img.metadata();
  const frameW = meta.width;
  const frameH = meta.height;
  if (!frameW || !frameH) throw new Error("Could not read image dimensions");

  const { buf, top, left } = await lockupFor(frameW, frameH);
  return img
    .composite([{ input: buf, top, left }])
    .jpeg({ quality: 92 })
    .toBuffer();
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stderr = "";
    let stdout = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(stdout)
        : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-600)}`)),
    );
  });
}

async function probeSize(path: string): Promise<{ w: number; h: number }> {
  try {
    const out = await run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      path,
    ]);
    const [w, h] = out.trim().split("x").map(Number);
    if (w > 0 && h > 0) return { w, h };
  } catch {
    // fall through
  }
  return { w: 1080, h: 1920 };
}

async function download(url: string, path: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

export interface WatermarkableAsset {
  id: string;
  url: string;
  type: string;
}

/** Video: overlay the pre-scaled lockup. Audio is copied, not re-encoded. */
async function watermarkVideo(
  srcUrl: string,
  dir: string,
): Promise<{ path: string; contentType: string; ext: string }> {
  const inPath = join(dir, "in.mp4");
  const lockupPath = join(dir, "wm.png");
  const outPath = join(dir, "out.mp4");
  await download(srcUrl, inPath);

  const { w, h } = await probeSize(inPath);
  const { buf, top, left } = await lockupFor(w, h);
  await writeFile(lockupPath, buf);

  // overlay's x/y are in main-frame coords, so the sharp-computed top/left
  // transfer directly — one geometry function for both media types.
  await run("ffmpeg", [
    "-y",
    "-i",
    inPath,
    "-i",
    lockupPath,
    "-filter_complex",
    `[0:v][1:v]overlay=x=${left}:y=${top}:format=auto[outv]`,
    "-map",
    "[outv]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    outPath,
  ]);
  return { path: outPath, contentType: "video/mp4", ext: "mp4" };
}

async function watermarkImage(
  srcUrl: string,
  dir: string,
): Promise<{ path: string; contentType: string; ext: string }> {
  const res = await fetch(srcUrl, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Failed to fetch ${srcUrl}: ${res.status}`);
  const stamped = await watermarkImageBuffer(
    Buffer.from(await res.arrayBuffer()),
  );
  const outPath = join(dir, "out.jpg");
  await writeFile(outPath, stamped);
  return { path: outPath, contentType: "image/jpeg", ext: "jpg" };
}

/** Where a given source asset's stamped twin lives. Deterministic, so it is
 *  both the cache key and a stable CDN URL. */
function derivativePath(
  workspaceId: string,
  assetId: string,
  isVideo: boolean,
): string {
  return `${workspaceId}/watermarked/${assetId}.${isVideo ? "mp4" : "jpg"}`;
}

/**
 * The watermarked twin of `asset` — rendered on first use, reused after.
 *
 * Deliberately writes NO `assets` row. A derivative row would carry the
 * source's `type`, which means it would show up as a duplicate in /gallery and
 * /productions, and publish's "newest composed_video" pick would latch onto it
 * — so an upgraded workspace would keep publishing its old stamped clip
 * forever. Keying the file to the (immutable) source asset id gives us the
 * cache without any of that: nothing to filter out, nothing to forget later.
 *
 * Returns the ORIGINAL asset if stamping fails. A watermark is a business
 * nicety; failing a paying customer's publish over one would be a far worse
 * outcome than a missed impression.
 */
export async function ensureWatermarked(
  asset: WatermarkableAsset,
  workspaceId: string,
  isVideo: boolean,
): Promise<WatermarkableAsset> {
  const admin = createSupabaseAdminClient();
  const path = derivativePath(workspaceId, asset.id, isVideo);
  const { data: pub } = admin.storage.from("assets").getPublicUrl(path);
  const stamped = { ...asset, url: pub.publicUrl };

  const slash = path.lastIndexOf("/");
  const { data: found } = await admin.storage
    .from("assets")
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  if (found && found.length > 0) return stamped;

  const dir = await mkdtemp(join(tmpdir(), "tf-wm-"));
  try {
    const out = isVideo
      ? await watermarkVideo(asset.url, dir)
      : await watermarkImage(asset.url, dir);
    const { error } = await admin.storage
      .from("assets")
      .upload(path, await readFile(out.path), {
        contentType: out.contentType,
        upsert: true,
      });
    if (error) throw new Error(`Watermark upload failed: ${error.message}`);
    return stamped;
  } catch {
    return asset;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
