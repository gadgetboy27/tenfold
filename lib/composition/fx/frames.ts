import sharp from "sharp";
import { isPulse } from "./catalog";
import { fxCycles } from "./timing";
import { fxMargin, fxSceneFor } from "./effects";
import type { FxPiece, FxScene, PixelFx } from "./types";

/**
 * The server's way of carrying out an effect scene (canvas.ts is the
 * browser's): turns a still picture and an effect into a numbered run of PNG
 * frames the export overlays. Server only — it imports sharp.
 *
 * The frame is the picture plus the effect's margin on every side, so the
 * picture stays dead centre and the layer's position, scale and rotation —
 * applied to the frame exactly as they are to the still — put it in the same
 * place.
 */

/** A budget, not a goal: a sticker's frames are PNGs in a temp dir. */
export const MAX_FX_FRAMES = 120;
/** Pulses flicker fast and want the full rate; a transition is smooth motion
 *  and costs a pipeline per moving tile per frame, so it gets fewer frames. */
const MAX_FPS_PULSE = 30;
const MAX_FPS_TRANSITION = 24;
const MIN_FPS = 8;
const CONCURRENCY = 12;

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}
const rawOf = (r: Raw) => ({
  raw: { width: r.width, height: r.height, channels: 4 as const },
});

export function fxFrameRate(fx: PixelFx): number {
  const total = fx.lengthSec * fxCycles(fx);
  const cap = isPulse(fx.kind) ? MAX_FPS_PULSE : MAX_FPS_TRANSITION;
  return Math.max(
    MIN_FPS,
    Math.min(cap, Math.floor(MAX_FX_FRAMES / Math.max(total, 0.1))),
  );
}

export interface FxFrames {
  frames: Buffer[];
  fps: number;
  width: number;
  height: number;
}

export async function renderFxFrames(opts: {
  /** The still picture (PNG). */
  src: Buffer;
  fx: PixelFx;
  /** Seeds the randomness — the sticker's own words. */
  text: string;
}): Promise<FxFrames> {
  const { fx, text } = opts;
  const { data, info } = await sharp(opts.src)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const source: Raw = { data, width: info.width, height: info.height };
  const margin = fxMargin(fx.kind, source.width, source.height);
  const frameW = source.width + margin.x * 2;
  const frameH = source.height + margin.y * 2;

  const total = fx.lengthSec * fxCycles(fx);
  const fps = fxFrameRate(fx);
  const count = Math.max(1, Math.round(total * fps));
  const tiles = new Map<string, Promise<Raw | null>>();

  const frames: Buffer[] = [];
  for (let k = 0; k < count; k++) {
    const local = k / fps;
    const cycle = Math.min(fxCycles(fx) - 1, Math.floor(local / fx.lengthSec));
    const p = (local - cycle * fx.lengthSec) / fx.lengthSec;
    const scene = fxSceneFor(
      fx,
      { w: source.width, h: source.height },
      text,
      p,
    );
    frames.push(
      await renderSceneFrame(source, scene, margin, frameW, frameH, tiles),
    );
  }
  return { frames, fps, width: frameW, height: frameH };
}

const pieceKey = (p: FxPiece) =>
  [p.sx, p.sy, p.sw, p.sh, p.colorize ?? "", p.clip?.join(";") ?? ""].join("|");

/** The piece's rectangle cut from the source, masked and colourised — the
 *  part of the work that doesn't change frame to frame, done once. */
function tileFor(
  source: Raw,
  p: FxPiece,
  cache: Map<string, Promise<Raw | null>>,
): Promise<Raw | null> {
  const key = pieceKey(p);
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      let img = sharp(source.data, rawOf(source)).extract({
        left: p.sx,
        top: p.sy,
        width: p.sw,
        height: p.sh,
      });
      if (p.clip) {
        const poly = p.clip.map(([x, y]) => `${x},${y}`).join(" ");
        const mask = Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${p.sw}" height="${p.sh}">` +
            `<polygon points="${poly}" fill="#fff"/></svg>`,
        );
        const cut = await img
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        img = sharp(cut.data, {
          raw: { width: cut.info.width, height: cut.info.height, channels: 4 },
        }).composite([{ input: mask, blend: "dest-in" }]);
      }
      if (p.colorize) {
        const n = parseInt(p.colorize.slice(1), 16);
        img = img
          .ensureAlpha()
          .linear([0, 0, 0, 1], [(n >> 16) & 255, (n >> 8) & 255, n & 255, 0]);
      }
      const out = await img
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      // A tile with nothing in it is not worth compositing 30 times.
      let any = false;
      for (let i = 3; i < out.data.length; i += 4) {
        if (out.data[i] > 0) {
          any = true;
          break;
        }
      }
      return any
        ? { data: out.data, width: out.info.width, height: out.info.height }
        : null;
    })();
    cache.set(key, hit);
  }
  return hit;
}

interface Placed {
  input: Buffer;
  raw: { width: number; height: number; channels: 4 };
  left: number;
  top: number;
  blend: "over" | "add";
}

async function place(
  source: Raw,
  p: FxPiece,
  margin: { x: number; y: number },
  frameW: number,
  frameH: number,
  tiles: Map<string, Promise<Raw | null>>,
): Promise<Placed | null> {
  if (p.alpha <= 0.004) return null;
  const tile = await tileFor(source, p, tiles);
  if (!tile) return null;

  // A piece that hasn't moved is the tile itself — no pipeline needed.
  const still = p.scale === 1 && Math.abs(p.rot) <= 1e-4 && p.alpha >= 0.999;
  let out: { data: Buffer; info: { width: number; height: number } };
  if (still) {
    out = { data: tile.data, info: { width: tile.width, height: tile.height } };
  } else {
    let img = sharp(tile.data, rawOf(tile));
    const ow = Math.max(1, Math.round(tile.width * p.scale));
    const oh = Math.max(1, Math.round(tile.height * p.scale));
    if (ow !== tile.width || oh !== tile.height)
      img = img.resize(ow, oh, { fit: "fill" });
    if (Math.abs(p.rot) > 1e-4)
      img = img.rotate((p.rot * 180) / Math.PI, { background: CLEAR });
    if (p.alpha < 0.999) img = img.linear([1, 1, 1, p.alpha], [0, 0, 0, 0]);
    out = await img.raw().toBuffer({ resolveWithObject: true });
  }

  const cx = margin.x + p.sx + p.sw / 2 + p.dx;
  const cy = margin.y + p.sy + p.sh / 2 + p.dy;
  let left = Math.round(cx - out.info.width / 2);
  let top = Math.round(cy - out.info.height / 2);
  let { width, height } = out.info;
  let data = out.data;

  // Sharp composites only what lies inside the frame; trim what doesn't.
  const cropL = Math.max(0, -left);
  const cropT = Math.max(0, -top);
  const cropR = Math.max(0, left + width - frameW);
  const cropB = Math.max(0, top + height - frameH);
  if (cropL + cropR >= width || cropT + cropB >= height) return null;
  if (cropL || cropT || cropR || cropB) {
    width -= cropL + cropR;
    height -= cropT + cropB;
    data = await sharp(data, {
      raw: { width: out.info.width, height: out.info.height, channels: 4 },
    })
      .extract({ left: cropL, top: cropT, width, height })
      .raw()
      .toBuffer();
    left += cropL;
    top += cropT;
  }
  return {
    input: data,
    raw: { width, height, channels: 4 },
    left,
    top,
    blend: p.add ? "add" : "over",
  };
}

const svg = (w: number, h: number, body: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`,
  );

async function renderSceneFrame(
  source: Raw,
  scene: FxScene,
  margin: { x: number; y: number },
  frameW: number,
  frameH: number,
  tiles: Map<string, Promise<Raw | null>>,
): Promise<Buffer> {
  // Pieces — in chunks, so a 100-tile scene doesn't open 100 pipelines at once.
  const placed: Array<Placed | null> = [];
  for (let i = 0; i < scene.pieces.length; i += CONCURRENCY) {
    placed.push(
      ...(await Promise.all(
        scene.pieces
          .slice(i, i + CONCURRENCY)
          .map((p) => place(source, p, margin, frameW, frameH, tiles)),
      )),
    );
  }
  let frame = await sharp({
    create: { width: frameW, height: frameH, channels: 4, background: CLEAR },
  })
    .composite(placed.filter((p): p is Placed => p !== null))
    .raw()
    .toBuffer();

  const atop: Buffer[] = [];
  if (scene.wash && scene.wash.alpha > 0.004) {
    atop.push(
      svg(
        frameW,
        frameH,
        `<rect width="${frameW}" height="${frameH}" fill="${scene.wash.color}" fill-opacity="${scene.wash.alpha}"/>`,
      ),
    );
  }
  if (scene.sweep && scene.sweep.alpha > 0.004) {
    const s = scene.sweep;
    const half = s.width / 2;
    const nx = Math.cos(s.angle);
    const ny = -Math.sin(s.angle);
    // The band's centre line leans `angle` from vertical through (cx, h/2).
    const cx = margin.x + s.cx;
    const cy = frameH / 2;
    atop.push(
      svg(
        frameW,
        frameH,
        `<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" ` +
          `x1="${cx - nx * half}" y1="${cy - ny * half}" x2="${cx + nx * half}" y2="${cy + ny * half}">` +
          `<stop offset="0" stop-color="${s.color}" stop-opacity="0"/>` +
          `<stop offset="0.5" stop-color="${s.color}" stop-opacity="${s.alpha}"/>` +
          `<stop offset="1" stop-color="${s.color}" stop-opacity="0"/>` +
          `</linearGradient></defs><rect width="${frameW}" height="${frameH}" fill="url(#g)"/>`,
      ),
    );
  }
  let img = sharp(frame, {
    raw: { width: frameW, height: frameH, channels: 4 },
  });
  if (atop.length) {
    img = sharp(
      await img
        .composite(atop.map((input) => ({ input, blend: "atop" as const })))
        .raw()
        .toBuffer(),
      { raw: { width: frameW, height: frameH, channels: 4 } },
    );
  }
  frame = Buffer.alloc(0);

  if (scene.bolts.length) {
    const lines = scene.bolts
      .map(
        (b) =>
          `<polyline fill="none" stroke="${b.color}" stroke-opacity="${b.alpha}" ` +
          `stroke-width="${b.width}" stroke-linecap="round" stroke-linejoin="round" ` +
          `points="${b.pts.map(([x, y]) => `${(x + margin.x).toFixed(1)},${(y + margin.y).toFixed(1)}`).join(" ")}"/>`,
      )
      .join("");
    img = sharp(
      await img
        .composite([{ input: svg(frameW, frameH, lines) }])
        .raw()
        .toBuffer(),
      { raw: { width: frameW, height: frameH, channels: 4 } },
    );
  }
  return img.png({ compressionLevel: 3 }).toBuffer();
}
