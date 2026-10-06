import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  ASPECT_DESIGN,
  effectiveLayer,
  resolveCenter,
  rotatedHalfExtents,
  type CompositionDoc,
  type Layer,
} from "@/lib/composition/layers";
import { renderFxFrames, type FxFrames } from "./frames";
import { resolveFxWindow, staticIntervals } from "./timing";

/**
 * Turns a doc whose stickers carry pixel effects into one the FFmpeg graph can
 * draw with nothing new in it: each such sticker becomes TWO ordinary image
 * layers —
 *
 *   the still   — the sticker as it always was, shown only while the effect is
 *                 NOT playing (`showIntervals`),
 *   the effect  — the rendered frames, an image-sequence input shown only
 *                 during the effect, carrying the same position, scale,
 *                 rotation, opacity, blend and layer animations.
 *
 * so every transform the export already does applies to both unchanged.
 * Server only (sharp, temp files).
 */

/** Layer fields the planner adds; read by buildFilterGraph. */
export interface ExportLayerExtras {
  /** Half-open [from, to) stretches the layer is drawn in, besides its own
   *  appear/disappear window. Absent = the whole window. */
  showIntervals?: Array<[number, number]>;
}

export interface FxSequence {
  /** printf-style input pattern for FFmpeg's image2 demuxer. */
  pattern: string;
  fps: number;
  /** Master-clock time of the first frame. */
  startSec: number;
}

export interface PixelFxPlan {
  doc: CompositionDoc;
  /** Layer id → its frame sequence. Those layers have no still file. */
  sequences: Map<string, FxSequence>;
}

export const FX_SUFFIX = "#fx";

// A fan-out renders the same sticker once per aspect; the frames don't depend
// on the aspect, so make them once.
const frameCache = new Map<string, FxFrames>();
const FRAME_CACHE_MAX = 6;

async function framesFor(
  bytes: Buffer,
  fx: Parameters<typeof renderFxFrames>[0]["fx"],
  text: string,
): Promise<FxFrames> {
  const key = createHash("sha1")
    .update(bytes)
    .update(JSON.stringify(fx))
    .update(text)
    .digest("hex");
  const hit = frameCache.get(key);
  if (hit) return hit;
  const made = await renderFxFrames({ src: bytes, fx, text });
  frameCache.set(key, made);
  while (frameCache.size > FRAME_CACHE_MAX) {
    const oldest = frameCache.keys().next().value;
    if (oldest === undefined) break;
    frameCache.delete(oldest);
  }
  return made;
}

export function hasPixelFx(doc: CompositionDoc): boolean {
  return doc.layers.some((l) => l.kind === "image" && !!l.sticker?.fx);
}

export async function planPixelFx(
  doc: CompositionDoc,
  dur: number,
  dir: string,
  readSrc: (src: string) => Promise<Buffer>,
): Promise<PixelFxPlan> {
  const sequences = new Map<string, FxSequence>();
  if (!hasPixelFx(doc)) return { doc, sequences };

  const design = ASPECT_DESIGN[doc.aspect];
  const layers: Layer[] = [];
  let n = 0;

  for (const layer of doc.layers) {
    const fx = layer.kind === "image" ? layer.sticker?.fx : undefined;
    if (layer.kind !== "image" || !fx) {
      layers.push(layer);
      continue;
    }
    const bytes = await readSrc(layer.src);
    const meta = await sharp(bytes).metadata();
    const frames = await framesFor(bytes, fx, layer.sticker?.text ?? "");

    const win = resolveFxWindow(fx, dur);
    const from = layer.appearAt;
    const to = layer.disappearAt ?? dur;

    const still: Layer & ExportLayerExtras = {
      ...layer,
      showIntervals: staticIntervals(fx, win, from, to),
    };
    layers.push(still);

    const playFrom = Math.max(win.start, from);
    const playTo = Math.min(win.end, to);
    if (playTo <= playFrom) continue;

    const folder = join(dir, `fx-${n++}`);
    await mkdir(folder, { recursive: true });
    await Promise.all(
      frames.frames.map((buf, k) =>
        writeFile(join(folder, `f${String(k + 1).padStart(5, "0")}.png`), buf),
      ),
    );

    // The frame is bigger than the still (it carries the effect's margin), so
    // an edge-anchored position would shift. Pin the effect to the still's
    // own centre instead.
    const eff = effectiveLayer(layer, doc.aspect, doc.overrides);
    const half = rotatedHalfExtents(
      ((meta.width ?? 0) * eff.scale) / 2,
      ((meta.height ?? 0) * eff.scale) / 2,
      eff.rotationDeg,
    );
    const c = resolveCenter(eff.pos, doc.aspect, half.halfW, half.halfH);
    const id = `${layer.id}${FX_SUFFIX}`;
    const play: Layer & ExportLayerExtras = {
      ...eff,
      id,
      sticker: undefined,
      pos: {
        mode: "fraction",
        nx: c.x / design.width,
        ny: c.y / design.height,
      },
      showIntervals: [[playFrom, playTo]],
    } as Layer & ExportLayerExtras;
    layers.push(play);
    sequences.set(id, {
      pattern: join(folder, "f%05d.png"),
      fps: frames.fps,
      startSec: win.start,
    });
  }
  return { doc: { ...doc, layers }, sequences };
}
