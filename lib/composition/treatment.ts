import type { BackdropTreatment, Camera, Look } from "./layers";

/**
 * Backdrop treatment — the maths for a colour look, grain, vignette, camera
 * move and pulse, written once for both renderers. The canvas preview calls
 * `backdropMotion` and uses the CSS-filter strings; the FFmpeg export builds
 * the same motion as expressions (`zoomExpr` / `panExpr`) and uses the ffmpeg
 * filter strings. Colour looks are APPROXIMATE across the two (CSS filters are
 * not ffmpeg's eq/colorbalance) — the motion is exact.
 */

export const LOOK_LABEL: Record<Look, string> = {
  none: "Natural",
  warm: "Warm golden",
  teal: "Teal & orange",
  noir: "Noir",
  vivid: "Vivid pop",
  film: "Film fade",
};

export const CAMERA_LABEL: Record<Camera, string> = {
  none: "Still",
  "zoom-in": "Slow zoom in",
  "zoom-out": "Slow zoom out",
  "drift-left": "Drift left",
  "drift-right": "Drift right",
  punch: "Punch-in",
};

/** Canvas `ctx.filter` for each look (preview). */
export const LOOK_CANVAS_FILTER: Record<Look, string> = {
  none: "none",
  warm: "sepia(0.25) saturate(1.2) contrast(1.05)",
  teal: "hue-rotate(-12deg) saturate(1.25) contrast(1.08)",
  noir: "grayscale(1) contrast(1.25) brightness(0.97)",
  vivid: "saturate(1.5) contrast(1.1)",
  film: "sepia(0.3) contrast(0.95) saturate(0.85)",
};

/** ffmpeg filter segments for each look (export). Verified on ffmpeg in gbrp. */
const LOOK_FFMPEG: Record<Look, string> = {
  none: "",
  warm: "eq=saturation=1.15:contrast=1.05,colorbalance=rs=0.06:bs=-0.08:rm=0.05:bm=-0.06",
  teal: "colorbalance=rs=-0.08:bs=0.1:rh=0.1:bh=-0.08,eq=saturation=1.2:contrast=1.08",
  noir: "hue=s=0,eq=contrast=1.25:brightness=-0.03",
  vivid: "eq=saturation=1.5:contrast=1.1",
  film: "curves=preset=vintage",
};

export const NEUTRAL_TREATMENT: BackdropTreatment = {
  look: "none",
  grain: 0,
  vignette: 0,
  camera: "none",
  cameraAmount: 0.15,
};

/** True when the treatment would change nothing — callers skip all work. */
export function isNeutral(t: BackdropTreatment | undefined): boolean {
  return (
    !t ||
    (t.look === "none" &&
      t.grain === 0 &&
      t.vignette === 0 &&
      t.camera === "none" &&
      !t.pulse)
  );
}

const PUNCH_SEC = 0.5;
const num = (n: number) => `${Math.round(n * 10000) / 10000}`;

/** The pulse's shape: a sharp rise on each beat that decays before the next. */
function pulseFactor(t: BackdropTreatment, time: number): number {
  if (!t.pulse) return 1;
  const phase = ((time * t.pulse.bpm) / 60) % 1;
  return 1 + t.pulse.strength * Math.pow(1 - phase, 3);
}

/**
 * Camera + pulse at `time` seconds into a clip of `dur` seconds.
 * `zoom` ≥ 1 scales the backdrop about its centre; `panX` ∈ [-1, 1] slides it
 * across the spare room that zoom creates (0 = centred).
 */
export function backdropMotion(
  t: BackdropTreatment | undefined,
  time: number,
  dur: number,
): { zoom: number; panX: number } {
  if (!t) return { zoom: 1, panX: 0 };
  const a = t.cameraAmount;
  const p = dur > 0 ? Math.min(1, Math.max(0, time / dur)) : 0;
  let zoom = 1;
  let panX = 0;
  switch (t.camera) {
    case "zoom-in":
      zoom = 1 + a * p;
      break;
    case "zoom-out":
      zoom = 1 + a * (1 - p);
      break;
    case "drift-right":
      zoom = 1 + a;
      panX = 2 * p - 1;
      break;
    case "drift-left":
      zoom = 1 + a;
      panX = 1 - 2 * p;
      break;
    case "punch": {
      const u = Math.min(1, time / PUNCH_SEC);
      zoom = 1 + a * (1 - (1 - u) * (1 - u));
      break;
    }
    default:
      break;
  }
  return { zoom: zoom * pulseFactor(t, time), panX };
}

// ── FFmpeg expressions (time variable is `t`) ───────────────────────────────

/** The zoom factor as an ffmpeg expression — the twin of backdropMotion().zoom. */
export function zoomExpr(t: BackdropTreatment, dur: number): string {
  const a = t.cameraAmount;
  let z = "1";
  switch (t.camera) {
    case "zoom-in":
      z = `(1+${num(a)}*t/${num(dur)})`;
      break;
    case "zoom-out":
      z = `(1+${num(a)}*(1-t/${num(dur)}))`;
      break;
    case "drift-left":
    case "drift-right":
      z = `${num(1 + a)}`;
      break;
    case "punch":
      z = `(1+${num(a)}*(1-pow(1-min(1,t/${PUNCH_SEC}),2)))`;
      break;
    default:
      break;
  }
  if (t.pulse) {
    z = `(${z})*(1+${num(t.pulse.strength)}*pow(1-mod(t*${num(t.pulse.bpm)}/60,1),3))`;
  }
  return z;
}

/** Pan as an ffmpeg expression in [-1, 1] — the twin of backdropMotion().panX. */
export function panExpr(t: BackdropTreatment, dur: number): string {
  if (t.camera === "drift-right") return `(2*t/${num(dur)}-1)`;
  if (t.camera === "drift-left") return `(1-2*t/${num(dur)})`;
  return "0";
}

/** Strength 0..1 → ffmpeg vignette lens angle (smaller angle = darker edges). */
export function vignetteAngle(v: number): number {
  const wide = Math.PI / 2.5;
  const tight = Math.PI / 8;
  return wide - v * (wide - tight);
}

/**
 * The filter segments to splice after the backdrop has been cover-fitted to
 * `width`x`height` (and is in planar RGB). Empty string when nothing applies.
 * Order matters and mirrors the preview: camera → look → grain → vignette.
 */
export function backdropFilterChain(
  t: BackdropTreatment | undefined,
  dur: number,
  width: number,
  height: number,
): string {
  if (isNeutral(t) || !t) return "";
  const parts: string[] = [];
  const moves = t.camera !== "none" || !!t.pulse;
  if (moves) {
    const z = zoomExpr(t, dur);
    const pan = panExpr(t, dur);
    parts.push(
      `scale=w='iw*(${z})':h='ih*(${z})':eval=frame`,
      `crop=${width}:${height}:x='(iw-${width})/2*(1+${pan})':y='(ih-${height})/2'`,
    );
  }
  if (LOOK_FFMPEG[t.look]) parts.push(LOOK_FFMPEG[t.look]);
  if (t.grain > 0)
    parts.push(`noise=alls=${Math.round(t.grain * 30)}:allf=t+u`);
  if (t.vignette > 0)
    parts.push(`vignette=a=${num(vignetteAngle(t.vignette))}`);
  return parts.join(",");
}
