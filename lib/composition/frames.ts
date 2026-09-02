import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Sample still frames from a finished video so a model can look at the ad.
 *
 * Claude reads images, not video. Everything the watcher knows about a clip
 * arrives through this file, which makes the sampling strategy a real design
 * decision rather than plumbing.
 *
 * The clip is DOWNLOADED to a temp file before FFmpeg touches it, matching
 * lib/composition/video.ts. Two reasons, and the first one is fatal:
 *
 *  1. The Alpine ffmpeg build in the container has no HTTPS input support, so
 *     handing it a `https://` URL yields nothing at all. This is why
 *     composeVideo has always downloaded first — the existing code knew.
 *  2. Six frames means six seeks. Against a remote URL that is six range
 *     requests over the network; against a local file it is six cheap seeks
 *     into a file already in page cache.
 */

/** One sampled frame, ready to hand to the vision API. */
export interface VideoFrame {
  /** Seconds into the clip. The model needs this to reason about ORDER. */
  atSec: number;
  /** JPEG bytes, base64, no data: prefix. */
  base64: string;
}

function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    const out: Buffer[] = [];
    let stderr = "";
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(out))
        : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`)),
    );
  });
}

/** Clip length in seconds, or null when ffprobe can't tell us. */
export async function probeDurationSec(path: string): Promise<number | null> {
  try {
    const out = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ]);
    const n = Number(out.toString().trim());
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/**
 * Where to sample.
 *
 * NOT evenly spaced. An ad is front-loaded — the hook, the first brand moment
 * and the thing that decides whether anyone keeps watching all happen in the
 * opening seconds, and that is also where platform UI chrome does the most
 * damage. So the sampler weights the start and still takes a late frame to
 * catch the end card.
 *
 * The first sample is at 0.4s rather than 0: frame zero of a fade-in is often
 * black, and a model shown a black frame will faithfully report that the ad
 * opens on nothing.
 */
export function sampleTimestamps(durationSec: number, count: number): number[] {
  const d = Math.max(durationSec, 1);
  if (count <= 1) return [Math.min(0.4, d / 2)];
  // Weighted toward the opening: t^1.6 over the clip, clamped inside the ends.
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const p = i / (count - 1);
    const t = Math.pow(p, 1.6) * d;
    out.push(Math.min(Math.max(t, 0.4), Math.max(d - 0.2, 0.4)));
  }
  // Dedupe: a very short clip can collapse several samples onto one instant,
  // and paying to show the model the same frame twice teaches it nothing.
  return [...new Set(out.map((t) => Number(t.toFixed(2))))];
}

/**
 * Pull one frame at a timestamp, scaled down.
 *
 * 768px wide is deliberate. Vision cost scales with pixels, and the judgements
 * this feature makes — is the hook legible, does the logo collide with the
 * platform's UI, is there dead air — are all readable at that size. Sending
 * full-resolution frames would multiply the bill for detail nobody uses.
 */
async function grabFrame(path: string, atSec: number): Promise<VideoFrame> {
  const bytes = await run("ffmpeg", [
    // -ss BEFORE -i seeks by keyframe without decoding everything up to it.
    "-ss",
    String(atSec),
    "-i",
    path,
    "-frames:v",
    "1",
    "-vf",
    "scale=768:-2",
    "-q:v",
    "4",
    "-f",
    "image2",
    "-c:v",
    "mjpeg",
    "pipe:1",
  ]);
  if (bytes.length === 0) throw new Error(`No frame at ${atSec}s`);
  return { atSec, base64: bytes.toString("base64") };
}

/**
 * Sample a video into frames for the watcher.
 *
 * Frames are fetched in parallel — each is an independent seek, and doing them
 * in series makes a six-frame sample six round trips deep on a remote URL.
 *
 * A frame that fails is DROPPED rather than failing the batch: a critique of
 * five frames is worth having, and one bad seek near the end of a clip should
 * not lose the whole analysis. Returning an empty array is the caller's signal
 * that the video could not be read at all.
 */
export async function sampleVideoFrames(
  videoUrl: string,
  count = 6,
): Promise<{ frames: VideoFrame[]; durationSec: number | null }> {
  const dir = await mkdtemp(join(tmpdir(), "tf-frames-"));
  const path = join(dir, "clip.mp4");
  try {
    const res = await fetch(videoUrl);
    if (!res.ok) throw new Error(`Could not fetch the video (${res.status})`);
    await writeFile(path, Buffer.from(await res.arrayBuffer()));

    const durationSec = await probeDurationSec(path);
    const stamps = sampleTimestamps(durationSec ?? 10, count);
    const results = await Promise.allSettled(
      stamps.map((t) => grabFrame(path, t)),
    );
    const frames = results
      .filter(
        (r): r is PromiseFulfilledResult<VideoFrame> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value)
      .sort((a, b) => a.atSec - b.atSec);
    return { frames, durationSec };
  } finally {
    // Always, even on a thrown fetch: a failed review must not leave the
    // container's temp space filling up with half-written clips.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
