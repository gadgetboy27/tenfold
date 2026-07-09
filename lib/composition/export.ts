import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ASPECT_DESIGN,
  BLEND_MODES,
  type BlendMode,
  type CompositionDoc,
  type Layer,
} from "@/lib/composition/layers";
import { motionExprs, type MotionExprs } from "@/lib/composition/effects";

/**
 * Headless MP4 export of a layered CompositionDoc via FFmpeg — the server
 * twin of the canvas preview (lib/composition/render.ts). Renders at design
 * resolution with the same cover-fit, centre-anchored transforms and fade
 * envelope, so the export matches what the user scrubbed.
 *
 * Blend modes: FFmpeg's overlay filter has no blend modes and its blend
 * filter has no positioning, so non-normal layers are flattened onto a
 * full-frame NEUTRAL canvas (the identity colour of the blend mode — black
 * for screen/lighten, white for multiply/darken, mid-grey for overlay) and
 * then blended whole-frame. Alpha fades become fades toward the neutral
 * colour, which is exactly the identity, so timing still matches preview.
 */

const FONT_FILES: Record<string, string> = {
  Inter: "Inter.ttf",
  Montserrat: "Montserrat.ttf",
  "Playfair Display": "PlayfairDisplay.ttf",
  Lora: "Lora.ttf",
  Roboto: "Roboto.ttf",
};

const BLEND_NEUTRAL: Record<Exclude<BlendMode, "normal">, string> = {
  screen: "black",
  lighten: "black",
  multiply: "white",
  darken: "white",
  overlay: "0x808080",
};

function ffmpegBlendMode(blend: BlendMode): string {
  return BLEND_MODES.find((b) => b.id === blend)?.ffmpeg ?? "normal";
}

function fontFileFor(font: string): string {
  const file = FONT_FILES[font] ?? FONT_FILES.Inter;
  return join(process.cwd(), "public", "fonts", file);
}

/** Per-layer rgba pre-processing for image layers: scale, rotation (static or
 *  effect-animated), static opacity, and animated alpha (via geq, which
 *  evaluates per-frame with T). Input is a looped still (0..dur timestamps). */
function imageLayerChain(
  layer: Extract<Layer, { kind: "image" }>,
  fx: MotionExprs,
): string {
  const parts = ["format=rgba", `scale=iw*${layer.scale}:ih*${layer.scale}`];

  const staticRad = (layer.rotationDeg * Math.PI) / 180;
  if (fx.rot) {
    // Animated rotation: pad to the diagonal so the frame size stays fixed
    // while the angle changes. geq/overlay downstream see a stable canvas.
    parts.push(
      `rotate=a='${staticRad.toFixed(6)}+(${fx.rot})*PI/180'` +
        `:c=black@0:ow='hypot(iw,ih)':oh='hypot(iw,ih)'`,
    );
  } else if (layer.rotationDeg !== 0) {
    const rad = staticRad.toFixed(6);
    parts.push(`rotate=${rad}:c=black@0:ow=rotw(${rad}):oh=roth(${rad})`);
  }

  if (layer.opacity < 1) parts.push(`colorchannelmixer=aa=${layer.opacity}`);
  if (fx.alpha) {
    // geq uses T (frame time) rather than t.
    const alphaT = fx.alpha.replace(/\bt\b/g, "T");
    parts.push(
      `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*clip(${alphaT},0,1)'`,
    );
  }
  return parts.join(",");
}

/** Overlay x/y for a layer centre, with effect motion when animated. */
function overlayPos(layer: Layer, fx: MotionExprs): string {
  const x = fx.dx
    ? `x='${Math.round(layer.x)}-w/2+(${fx.dx})'`
    : `x=${Math.round(layer.x)}-w/2`;
  const y = fx.dy
    ? `y='${Math.round(layer.y)}-h/2+(${fx.dy})'`
    : `y=${Math.round(layer.y)}-h/2`;
  return `${x}:${y}`;
}

export interface GraphFiles {
  /** ffmpeg input index per image layer id. */
  imageInputIdx: Map<string, number>;
  /** temp textfile path per text layer id (avoids quoting user text). */
  textFile: Map<string, string>;
}

/** Build the full -filter_complex graph. Exported for unit tests. */
export function buildFilterGraph(
  doc: CompositionDoc,
  dur: number,
  files: GraphFiles,
): { graph: string; outLabel: string } {
  const { width, height } = ASPECT_DESIGN[doc.aspect];
  const chains: string[] = [
    // Cover-fit the background into the design space; gbrp keeps the chain in
    // planar RGB so blend maths matches the canvas (yuv blending drifts).
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},fps=30,format=gbrp[m0]`,
  ];

  let step = 0;
  for (const layer of doc.layers) {
    const from = `m${step}`;
    const to = `m${step + 1}`;
    const A = layer.appearAt;
    const E = layer.disappearAt ?? dur;
    const enable = `enable='between(t,${A},${E})'`;
    // Effect motion (entrances/exits/ambient) as expressions in t — sampled
    // from the same curves the canvas preview evaluates.
    const fx = motionExprs(layer, dur, { W: width, H: height });

    if (layer.kind === "image") {
      const idx = files.imageInputIdx.get(layer.id);
      if (idx === undefined) continue;
      const lbl = `l${step}`;
      chains.push(`[${idx}:v]${imageLayerChain(layer, fx)}[${lbl}]`);
      const pos = overlayPos(layer, fx);

      if (layer.blend === "normal") {
        chains.push(
          `[${from}][${lbl}]overlay=${pos}:format=gbrp:${enable}[${to}]`,
        );
      } else {
        const neutral = BLEND_NEUTRAL[layer.blend];
        chains.push(
          `color=c=${neutral}:s=${width}x${height}:r=30:d=${dur},format=gbrp[c${step}]`,
          `[c${step}][${lbl}]overlay=${pos}:format=gbrp[f${step}]`,
          `[${from}][f${step}]blend=all_mode=${ffmpegBlendMode(layer.blend)}:${enable}[${to}]`,
        );
      }
    } else {
      const tf = files.textFile.get(layer.id);
      if (!tf) continue;
      const fontSize = Math.round(layer.sizePx * layer.scale);
      // drawtext can't rotate, so text ignores the rot channel (documented
      // v1 limit); position + alpha effects apply fully.
      const tx = fx.dx
        ? `x='${Math.round(layer.x)}-text_w/2+(${fx.dx})'`
        : `x=${Math.round(layer.x)}-text_w/2`;
      const ty = fx.dy
        ? `y='${Math.round(layer.y)}-text_h/2+(${fx.dy})'`
        : `y=${Math.round(layer.y)}-text_h/2`;
      const alpha = fx.alpha
        ? `clip(${layer.opacity}*(${fx.alpha}),0,1)`
        : `${layer.opacity}`;
      // Multi-line captions: centre-aligned lines with the same 1.25 line
      // height as the canvas (line_spacing is the EXTRA space per line).
      const lineSpacing = Math.round(fontSize * 0.25);
      const draw =
        `drawtext=fontfile=${fontFileFor(layer.font)}:textfile=${tf}` +
        `:fontsize=${fontSize}:fontcolor=${layer.color.replace("#", "0x")}` +
        `:line_spacing=${lineSpacing}:text_align=center` +
        `:${tx}:${ty}:alpha='${alpha}'`;

      if (layer.blend === "normal") {
        chains.push(`[${from}]${draw}:${enable}[${to}]`);
      } else {
        const neutral = BLEND_NEUTRAL[layer.blend];
        chains.push(
          `color=c=${neutral}:s=${width}x${height}:r=30:d=${dur},format=gbrp[c${step}]`,
          `[c${step}]${draw}[f${step}]`,
          `[${from}][f${step}]blend=all_mode=${ffmpegBlendMode(layer.blend)}:${enable}[${to}]`,
        );
      }
    }
    step++;
  }

  return { graph: chains.join(";"), outLabel: `m${step}` };
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
        : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-800)}`)),
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
    return Number.isFinite(d) && d > 0 ? Math.min(d, 600) : 10;
  } catch {
    return 10;
  }
}

async function download(url: string, path: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}

export interface RenderCompositionInput {
  doc: CompositionDoc;
  workspaceId: string;
  /** Storage folder; falls back to a workspace compositor folder. */
  campaignId?: string | null;
  /** Optional music track — replaces the clip's own audio, like the mix. */
  audioUrl?: string | null;
}

export async function renderComposition(
  input: RenderCompositionInput,
): Promise<{ url: string; storagePath: string; durationSec: number }> {
  const { doc } = input;
  const dir = await mkdtemp(join(tmpdir(), "tf-export-"));
  const outPath = join(dir, "out.mp4");

  try {
    // 1. Fetch the background + every image layer; write text layers to files.
    const bgPath = join(
      dir,
      doc.background.kind === "video" ? "bg.mp4" : "bg.img",
    );
    await download(doc.background.src, bgPath);

    const dur =
      doc.background.kind === "video"
        ? await probeDuration(bgPath)
        : (doc.background.durationSec ?? 10);

    const files: GraphFiles = { imageInputIdx: new Map(), textFile: new Map() };
    const imageLayers = doc.layers.filter((l) => l.kind === "image");
    await Promise.all(
      imageLayers.map(async (l, i) => {
        const p = join(dir, `layer-${i}.img`);
        await download(l.src, p);
        files.imageInputIdx.set(l.id, i + 1); // background is input 0
      }),
    );
    await Promise.all(
      doc.layers
        .filter((l) => l.kind === "text")
        .map(async (l, i) => {
          const p = join(dir, `text-${i}.txt`);
          await writeFile(p, l.text);
          files.textFile.set(l.id, p);
        }),
    );

    // 2. Assemble args: still images loop for the clip duration so overlay
    //    enable/fade expressions see real timestamps.
    const args: string[] = ["-y"];
    if (doc.background.kind === "image")
      args.push("-loop", "1", "-t", `${dur}`);
    args.push("-i", bgPath);
    for (let i = 0; i < imageLayers.length; i++) {
      args.push(
        "-loop",
        "1",
        "-t",
        `${dur}`,
        "-i",
        join(dir, `layer-${i}.img`),
      );
    }
    const audioIdx = 1 + imageLayers.length;
    if (input.audioUrl) {
      const audioPath = join(dir, "music.mp3");
      await download(input.audioUrl, audioPath);
      args.push("-i", audioPath);
    }

    const { graph, outLabel } = buildFilterGraph(doc, dur, files);
    args.push("-filter_complex", graph, "-map", `[${outLabel}]`);
    if (input.audioUrl) args.push("-map", `${audioIdx}:a:0`, "-shortest");
    else args.push("-map", "0:a?");
    args.push(
      "-t",
      `${dur}`,
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

    // 3. Store the MP4, named from the composition.
    const buffer = await readFile(outPath);
    const admin = createSupabaseAdminClient();
    const folder = input.campaignId ?? "compositor";
    const storagePath = `${input.workspaceId}/${folder}/composition-${doc.id}.mp4`;
    const { error } = await admin.storage
      .from("assets")
      .upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    const { data } = admin.storage.from("assets").getPublicUrl(storagePath);
    return { url: data.publicUrl, storagePath, durationSec: dur };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
