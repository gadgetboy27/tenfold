import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Concatenate ordered MP4 segments into one video — the server side of the real
 * 30s render (2× Kling v3 15s segments → one clip). Same FFmpeg spawn/download
 * discipline as lib/composition/export.ts. Tries a stream copy first (fast, no
 * quality loss — the segments share a codec since they're the same model), and
 * falls back to a re-encode if the copy fails (mismatched params).
 */

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500)}`)),
    );
  });
}

async function download(url: string, path: string): Promise<void> {
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

export interface ConcatInput {
  /** Segment MP4 URLs, in play order. */
  urls: string[];
  workspaceId: string;
  campaignId: string;
  /** Storage basename (no extension) — e.g. the parent job id. */
  name: string;
}

export async function concatVideos(
  input: ConcatInput,
): Promise<{ url: string; storagePath: string }> {
  if (input.urls.length === 0) throw new Error("No segments to concat");
  const dir = await mkdtemp(join(tmpdir(), "tf-concat-"));
  const outPath = join(dir, "out.mp4");
  try {
    const segPaths: string[] = [];
    for (let i = 0; i < input.urls.length; i++) {
      const p = join(dir, `seg-${i}.mp4`);
      await download(input.urls[i], p);
      segPaths.push(p);
    }

    // concat demuxer + stream copy (fast). listfile references each segment.
    const listPath = join(dir, "list.txt");
    await writeFile(listPath, segPaths.map((p) => `file '${p}'`).join("\n"));
    try {
      await run("ffmpeg", [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-c",
        "copy",
        outPath,
      ]);
    } catch {
      // Re-encode fallback: normalize via the concat filter (handles differing
      // params). Assumes video+audio (Kling v3 has native audio).
      const inputs = segPaths.flatMap((p) => ["-i", p]);
      const n = segPaths.length;
      const streams = segPaths.map((_, i) => `[${i}:v][${i}:a]`).join("");
      await run("ffmpeg", [
        "-y",
        ...inputs,
        "-filter_complex",
        `${streams}concat=n=${n}:v=1:a=1[v][a]`,
        "-map",
        "[v]",
        "-map",
        "[a]",
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
    }

    const buffer = await readFile(outPath);
    const admin = createSupabaseAdminClient();
    const storagePath = `${input.workspaceId}/${input.campaignId}/video-${input.name}.mp4`;
    const { error } = await admin.storage
      .from("assets")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Concat upload failed: ${error.message}`);
    const { data } = admin.storage.from("assets").getPublicUrl(storagePath);
    return { url: data.publicUrl, storagePath };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
