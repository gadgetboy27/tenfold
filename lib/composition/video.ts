import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const FONT = "/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf";

/**
 * Cinematic caption presets the user can mix over a campaign video. Higher
 * tiers unlock the more elaborate motion styles (a Business/Agency upsell).
 */
export type CaptionStyle = "none" | "fade" | "lower_third" | "crawl";

export interface CaptionPreset {
  id: CaptionStyle;
  label: string;
  blurb: string;
  proOnly: boolean;
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "none",
    label: "No caption",
    blurb: "Video + music only.",
    proOnly: false,
  },
  {
    id: "fade",
    label: "Fade",
    blurb: "Caption fades in and out, centred lower.",
    proOnly: false,
  },
  {
    id: "lower_third",
    label: "Lower third",
    blurb: "Broadcast-style caption bar.",
    proOnly: true,
  },
  {
    id: "crawl",
    label: "Cinematic crawl",
    blurb: "Epic text scrolling up the frame, cinema-title style.",
    proOnly: true,
  },
];

// drawtext filter for each style. `dur` is the clip length in seconds; commas
// inside expressions are wrapped in single quotes so the filtergraph parser
// doesn't treat them as filter separators.
function captionFilter(
  style: CaptionStyle,
  dur: number,
  capFile: string,
): string | null {
  const base = `drawtext=fontfile=${FONT}:textfile=${capFile}:fontcolor=white`;
  switch (style) {
    case "none":
      return null;
    case "fade":
      return (
        `${base}:fontsize=h/18:box=1:boxcolor=black@0.45:boxborderw=20` +
        `:x=(w-text_w)/2:y=h-th-h/12` +
        `:alpha='if(lt(t,0.8),t/0.8,if(lt(t,${dur}-0.8),1,(${dur}-t)/0.8))'`
      );
    case "lower_third":
      return (
        `${base}:fontsize=h/20:box=1:boxcolor=black@0.55:boxborderw=16` +
        `:x=h/20:y=h-th-h/14`
      );
    case "crawl":
      // Scroll the text from the bottom edge up past the top over the clip.
      // 0x (not #) colour — # can be misread in a filtergraph string.
      return (
        `drawtext=fontfile=${FONT}:textfile=${capFile}:fontcolor=0xFFE81F` +
        `:fontsize=h/15:x=(w-text_w)/2:y=h-(h+th)*t/${dur}`
      );
    default:
      return null;
  }
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
        : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

async function probeDuration(path: string): Promise<number> {
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
    const d = parseFloat(out.trim());
    return Number.isFinite(d) && d > 0 ? d : 10;
  } catch {
    return 10; // sensible default for a standard clip
  }
}

async function download(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

export interface ComposeVideoInput {
  videoUrl: string;
  audioUrl?: string | null;
  caption?: string | null;
  captionStyle: CaptionStyle;
  durationSec?: number;
  workspaceId: string;
  campaignId: string;
}

/**
 * Combine a campaign video, an optional music track, and an optional animated
 * caption into a single MP4 via FFmpeg, then store it and return the public URL.
 * This is the heart of the cinema composition phase. Requires ffmpeg in the
 * runtime (installed in the Dockerfile).
 */
export async function composeVideo(
  input: ComposeVideoInput,
): Promise<{ url: string; storagePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), "tf-compose-"));
  const videoPath = join(dir, "in.mp4");
  const audioPath = join(dir, "music.mp3");
  const capPath = join(dir, "caption.txt");
  const outPath = join(dir, "out.mp4");

  try {
    await download(input.videoUrl, videoPath);
    if (input.audioUrl) await download(input.audioUrl, audioPath);

    const dur = input.durationSec ?? (await probeDuration(videoPath));

    const args: string[] = ["-y", "-i", videoPath];
    if (input.audioUrl) args.push("-i", audioPath);

    const hasCaption = input.captionStyle !== "none" && !!input.caption?.trim();
    if (hasCaption) {
      await writeFile(capPath, input.caption!.trim());
    }
    const vf = hasCaption
      ? captionFilter(input.captionStyle, dur, capPath)
      : null;

    // Map carefully: a simple -vf is dropped if we also -map the raw video, so
    // when there's BOTH a caption and music we must filter via filter_complex
    // and map the labelled output.
    if (vf && input.audioUrl) {
      args.push(
        "-filter_complex",
        `[0:v]${vf}[v]`,
        "-map",
        "[v]",
        "-map",
        "1:a:0",
        "-shortest",
      );
    } else if (vf) {
      args.push("-vf", vf); // caption only — keeps the clip's own audio
    } else if (input.audioUrl) {
      args.push("-map", "0:v:0", "-map", "1:a:0", "-shortest"); // music only
    }
    args.push(
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      outPath,
    );

    await run("ffmpeg", args);

    const buffer = await readFile(outPath);
    const admin = createSupabaseAdminClient();
    const storagePath = `${input.workspaceId}/${input.campaignId}/composed-${Date.now()}.mp4`;
    await admin.storage
      .from("assets")
      .upload(storagePath, buffer, { contentType: "video/mp4" });
    const { data } = admin.storage.from("assets").getPublicUrl(storagePath);
    return { url: data.publicUrl, storagePath };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
