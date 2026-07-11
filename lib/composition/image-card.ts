import { spawn } from "node:child_process";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Bake a static image onto a video as a title (intro) or end (outro) card — the
 * "connect the image to the start/end of the video" feature. The image becomes
 * a short clip at the video's exact dimensions (letterboxed if it doesn't match)
 * with silent audio, then concatenated with the video into one MP4. Same FFmpeg
 * spawn/download discipline as export.ts / concat.ts.
 */

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

async function download(url: string, path: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

/** Probe the video's pixel dimensions (falls back to 1080×1920). */
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

export interface ImageCardInput {
  videoUrl: string;
  imageUrl: string;
  position: "intro" | "outro";
  /** Card length in seconds (clamped 1–6). */
  durationSec?: number;
  workspaceId: string;
  campaignId: string;
}

export async function renderImageCardVideo(
  input: ImageCardInput,
): Promise<{ url: string; storagePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "tf-card-"));
  const videoPath = join(dir, "video.mp4");
  const imagePath = join(dir, "image.img");
  const outPath = join(dir, "out.mp4");
  try {
    await download(input.videoUrl, videoPath);
    await download(input.imageUrl, imagePath);
    const { w, h } = await probeSize(videoPath);
    const n = Math.min(6, Math.max(1, input.durationSec ?? 3));

    // Image → clip at the video's size (letterboxed), video normalised to match.
    // A silent stereo track (anullsrc, input 2) gives the card audio so concat
    // with the video's audio lines up.
    const scalePad =
      `scale=${w}:${h}:force_original_aspect_ratio=decrease,` +
      `pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p`;
    const order =
      input.position === "outro"
        ? "[vid][vida][img][imga]"
        : "[img][imga][vid][vida]";
    const filter =
      `[0:v]${scalePad}[img];` +
      `[1:v]scale=${w}:${h},setsar=1,fps=30,format=yuv420p[vid];` +
      `[2:a]asetpts=PTS-STARTPTS[imga];` +
      `[1:a]asetpts=PTS-STARTPTS[vida];` +
      `${order}concat=n=2:v=1:a=1[outv][outa]`;

    await run("ffmpeg", [
      "-y",
      "-loop",
      "1",
      "-t",
      `${n}`,
      "-i",
      imagePath,
      "-i",
      videoPath,
      "-f",
      "lavfi",
      "-t",
      `${n}`,
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-filter_complex",
      filter,
      "-map",
      "[outv]",
      "-map",
      "[outa]",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      outPath,
    ]);

    const buffer = await readFile(outPath);
    const admin = createSupabaseAdminClient();
    const stamp = Date.now().toString(36);
    const storagePath = `${input.workspaceId}/${input.campaignId}/card-${input.position}-${stamp}.mp4`;
    const { error } = await admin.storage
      .from("assets")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Card upload failed: ${error.message}`);
    const { data } = admin.storage.from("assets").getPublicUrl(storagePath);
    return { url: data.publicUrl, storagePath };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
