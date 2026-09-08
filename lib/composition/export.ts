import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  alignOf,
  anchorAxes,
  ASPECT_DESIGN,
  ASPECT_TO_FORMAT,
  BLEND_MODES,
  effectiveLayer,
  type BlendMode,
  type CompositionAspect,
  type CompositionDoc,
  type Layer,
  type LayerPosition,
  weightOf,
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

/**
 * family → weight → file.
 *
 * drawtext has no weight parameter; it renders whatever the file contains. So
 * "bold" here is a different FILE, not a flag, and every weight the UI offers
 * must appear in this table or the export silently falls back to Regular while
 * the canvas shows Bold. See public/fonts/README.md.
 */
const FONT_FILES: Record<string, Record<400 | 700, string>> = {
  Inter: { 400: "Inter.ttf", 700: "Inter-Bold.ttf" },
  Montserrat: { 400: "Montserrat.ttf", 700: "Montserrat-Bold.ttf" },
  "Playfair Display": {
    400: "PlayfairDisplay.ttf",
    700: "PlayfairDisplay-Bold.ttf",
  },
  Lora: { 400: "Lora.ttf", 700: "Lora-Bold.ttf" },
  Roboto: { 400: "Roboto.ttf", 700: "Roboto-Bold.ttf" },
  // Display faces ship one cut only; `weightOf` clamps to 400 for these, and
  // fontFileFor's fallback covers a stored 700 that predates that clamp.
  Anton: { 400: "Anton-Regular.ttf", 700: "Anton-Regular.ttf" },
  "Bebas Neue": {
    400: "BebasNeue-Regular.ttf",
    700: "BebasNeue-Regular.ttf",
  },
  "Alfa Slab One": {
    400: "AlfaSlabOne-Regular.ttf",
    700: "AlfaSlabOne-Regular.ttf",
  },
  Bungee: { 400: "Bungee-Regular.ttf", 700: "Bungee-Regular.ttf" },
  Rye: { 400: "Rye-Regular.ttf", 700: "Rye-Regular.ttf" },
  "Special Elite": {
    400: "SpecialElite-Regular.ttf",
    700: "SpecialElite-Regular.ttf",
  },
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

function fontFileFor(font: string, weight: 400 | 700 = 400): string {
  const family = FONT_FILES[font] ?? FONT_FILES.Inter;
  // Falling back to the family's Regular rather than to Inter-Bold: a missing
  // weight should cost you the weight, not the typeface.
  const file = family[weight] ?? family[400];
  return join(process.cwd(), "public", "fonts", file);
}

/** Per-layer rgba pre-processing for image layers: scale, rotation (static or
 *  effect-animated), static opacity, and animated alpha (via geq, which
 *  evaluates per-frame with T). Input is a looped still (0..dur timestamps). */
function imageLayerChain(
  layer: Extract<Layer, { kind: "image" }>,
  fx: MotionExprs,
  canvasScale = 1,
): string {
  // `iw` is the LAYER's own width, not the canvas — so an image at scale 1
  // renders at its native pixel size whatever the output resolution is.
  // Doubling the canvas without doubling this would render every mark and
  // cutout at half its intended size on the page. The trap only shows up at
  // scale > 1, which is exactly where nobody looks.
  const s = layer.scale * canvasScale;
  const parts = ["format=rgba", `scale=iw*${s}:ih*${s}`];

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

/**
 * Top-left position EXPRESSIONS for a layer's pos in the WxH design space —
 * the FFmpeg twin of resolveCenter() (render.ts). wVar/hVar name the overlaid
 * element's own size in the target filter (`w`/`h` for overlay, `text_w`/
 * `text_h` for drawtext). Fraction mode is a constant centre; anchor mode pins
 * to an edge using the runtime size vars so it stays inside its margin.
 */
function basePos(
  pos: LayerPosition,
  W: number,
  H: number,
  wVar: string,
  hVar: string,
): { x: string; y: string } {
  if (pos.mode === "fraction") {
    return {
      x: `${Math.round(pos.nx * W)}-${wVar}/2`,
      y: `${Math.round(pos.ny * H)}-${hVar}/2`,
    };
  }
  const m = Math.min(W, H);
  const Mx = Math.round(pos.mx * m);
  const My = Math.round(pos.my * m);
  const { h, v } = anchorAxes(pos.anchor);
  const x =
    h === "left"
      ? `${Mx}`
      : h === "right"
        ? `${W - Mx}-${wVar}`
        : `(${W}-${wVar})/2`;
  const y =
    v === "top"
      ? `${My}`
      : v === "bottom"
        ? `${H - My}-${hVar}`
        : `(${H}-${hVar})/2`;
  return { x, y };
}

/** Overlay x/y for a layer, with effect motion when animated. */
function overlayPos(
  layer: Layer,
  fx: MotionExprs,
  W: number,
  H: number,
): string {
  const b = basePos(layer.pos, W, H, "w", "h");
  const x = fx.dx ? `x='${b.x}+(${fx.dx})'` : `x=${b.x}`;
  const y = fx.dy ? `y='${b.y}+(${fx.dy})'` : `y=${b.y}`;
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
  /**
   * Output resolution multiplier. 1 = the design space (1080-class).
   *
   * Everything positional is already a fraction of the canvas, so those scale
   * for free. Everything measured in PIXELS does not, and there are exactly
   * three: an image layer's own scale, a text layer's font size, and the
   * scrim's border width. Miss one and the render is subtly wrong in a way
   * that only appears above 1×.
   *
   * The honest ceiling: this resamples the design space, it does not add
   * detail. Text and vector marks genuinely resharpen because they are drawn
   * at the output size; a background photo cannot exceed its source and will
   * simply be a larger copy of the same pixels.
   */
  scale = 1,
): { graph: string; outLabel: string } {
  const base = ASPECT_DESIGN[doc.aspect];
  const width = Math.round(base.width * scale);
  const height = Math.round(base.height * scale);
  const chains: string[] = [
    // Cover-fit the background into the design space; gbrp keeps the chain in
    // planar RGB so blend maths matches the canvas (yuv blending drifts).
    `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},fps=30,format=gbrp[m0]`,
  ];

  let step = 0;
  for (const master of doc.layers) {
    // Render this aspect's per-format nudges (position/size/rotation).
    const layer = effectiveLayer(master, doc.aspect, doc.overrides);
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
      chains.push(`[${idx}:v]${imageLayerChain(layer, fx, scale)}[${lbl}]`);
      const pos = overlayPos(layer, fx, width, height);

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
      const fontSize = Math.round(layer.sizePx * layer.scale * scale);
      // drawtext can't rotate, so text ignores the rot channel (documented
      // v1 limit); position + alpha effects apply fully.
      const base = basePos(layer.pos, width, height, "text_w", "text_h");
      const tx = fx.dx ? `x='${base.x}+(${fx.dx})'` : `x=${base.x}`;
      const ty = fx.dy ? `y='${base.y}+(${fx.dy})'` : `y=${base.y}`;
      const alpha = fx.alpha
        ? `clip(${layer.opacity}*(${fx.alpha}),0,1)`
        : `${layer.opacity}`;
      // Multi-line captions: same 1.25 line height as the canvas
      // (line_spacing is the EXTRA space per line).
      const lineSpacing = Math.round(fontSize * 0.25);
      // Scrim: drawtext's own box, whose boxborderw is the canvas's padPx —
      // both grow the text block equally on all four sides, so the preview and
      // the MP4 land the same rectangle. padPx is multiplied by scale because
      // this filter bakes scale into fontSize rather than scaling the layer,
      // while the canvas applies ctx.scale() and gets it for free.
      //
      // box + an alpha expression is exactly the pairing the shipped `fade`
      // caption preset already uses (lib/composition/video.ts), so the
      // interaction between the two is known-good rather than assumed.
      const box = layer.bg
        ? `:box=1:boxcolor=${layer.bg.color.replace("#", "0x")}@${layer.bg.opacity}` +
          `:boxborderw=${Math.round(layer.bg.padPx * layer.scale * scale)}`
        : "";
      const draw =
        `drawtext=fontfile=${fontFileFor(layer.font, weightOf(layer))}:textfile=${tf}` +
        `:fontsize=${fontSize}:fontcolor=${layer.color.replace("#", "0x")}` +
        `:line_spacing=${lineSpacing}:text_align=${alignOf(layer)}${box}` +
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
  /** Output resolution multiplier — see buildFilterGraph. Defaults to 1. */
  scale?: number;
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
      // Loop the track so a SHORT upload fills the whole clip; `-t dur` below
      // trims it to the exact video length. Marries any-length music to the
      // video (never truncates the video, unlike the old `-shortest`).
      args.push("-stream_loop", "-1", "-i", audioPath);
    }

    const { graph, outLabel } = buildFilterGraph(
      doc,
      dur,
      files,
      input.scale ?? 1,
    );
    args.push("-filter_complex", graph, "-map", `[${outLabel}]`);
    // `-t dur` (below) caps the output at the VIDEO length — the video is always
    // the master; the looped music is snipped to match. No `-shortest` (it would
    // let a short track cut the video short).
    if (input.audioUrl) args.push("-map", `${audioIdx}:a:0`);
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

    // 3. Store the MP4 at a UNIQUE path per export. A stable path + upsert meant
    //    getPublicUrl returned the same URL every time, so after an edit the
    //    browser/CDN served the CACHED old video — the render was fresh but the
    //    preview looked unchanged. The build stamp makes each export a new URL.
    const buffer = await readFile(outPath);
    const admin = createSupabaseAdminClient();
    const folder = input.campaignId ?? "compositor";
    const stamp = Date.now().toString(36);
    const storagePath = `${input.workspaceId}/${folder}/composition-${doc.id}-${ASPECT_TO_FORMAT[doc.aspect]}-${stamp}.mp4`;
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

export interface FanOutResult {
  aspect: CompositionAspect;
  url: string;
  storagePath: string;
  durationSec: number;
}

/**
 * Render the same master composition once per aspect — "build every format
 * together" (docs/multiformat-manifesto.md Phase 5). Each render reflows the
 * layers and applies that aspect's per-format overrides (via effectiveLayer in
 * buildFilterGraph), and lands at its own storage path. Sequential to keep
 * FFmpeg memory bounded; ≤3 aspects in practice.
 *
 * Each render uploads its MP4 immediately, but the caller writes asset rows only
 * after all renders finish — so if one aspect fails partway, the already-uploaded
 * MP4s would be orphaned in Storage. On failure we delete them before rethrowing.
 */
export async function renderFanOut(
  input: RenderCompositionInput,
  aspects: CompositionAspect[],
): Promise<FanOutResult[]> {
  const out: FanOutResult[] = [];
  try {
    for (const aspect of aspects) {
      const r = await renderComposition({
        ...input,
        doc: { ...input.doc, aspect },
      });
      out.push({ aspect, ...r });
    }
    return out;
  } catch (err) {
    if (out.length > 0) {
      // Best-effort cleanup of orphaned uploads (no asset rows point to them).
      await createSupabaseAdminClient()
        .storage.from("assets")
        .remove(out.map((o) => o.storagePath))
        .catch(() => {});
    }
    throw err;
  }
}
