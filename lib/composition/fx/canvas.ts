import type { FxScene } from "./types";

/**
 * The browser's way of carrying out an effect scene (frames.ts is the
 * server's). Both execute the same plain description — see effects.ts — so the
 * preview and the exported MP4 show the same thing.
 *
 * Draws centred on the context's current origin, so the caller's layer
 * transform (position, scale, tilt) applies to the effect exactly as it does
 * to the still picture.
 */

let work: HTMLCanvasElement | null = null;
let tint: HTMLCanvasElement | null = null;

function sized(
  canvas: HTMLCanvasElement | null,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = canvas ?? document.createElement("canvas");
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

export function drawFxScene(
  ctx: CanvasRenderingContext2D,
  src: CanvasImageSource,
  size: { w: number; h: number },
  margin: { x: number; y: number },
  scene: FxScene,
): void {
  const fw = size.w + margin.x * 2;
  const fh = size.h + margin.y * 2;
  work = sized(work, fw, fh);
  const o = work.getContext("2d");
  if (!o) return;
  o.setTransform(1, 0, 0, 1, 0, 0);
  o.globalAlpha = 1;
  o.globalCompositeOperation = "source-over";
  o.clearRect(0, 0, fw, fh);

  for (const p of scene.pieces) {
    if (p.alpha <= 0.004) continue;
    o.save();
    o.globalAlpha = p.alpha;
    o.globalCompositeOperation = p.add ? "lighter" : "source-over";
    o.translate(
      margin.x + p.sx + p.sw / 2 + p.dx,
      margin.y + p.sy + p.sh / 2 + p.dy,
    );
    o.rotate(p.rot);
    o.scale(p.scale, p.scale);
    if (p.clip) {
      o.beginPath();
      p.clip.forEach(([x, y], i) => {
        const px = x - p.sw / 2;
        const py = y - p.sh / 2;
        if (i === 0) o.moveTo(px, py);
        else o.lineTo(px, py);
      });
      o.closePath();
      o.clip();
    }
    if (p.colorize) {
      // The piece's shape in one colour, alpha kept.
      tint = sized(tint, p.sw, p.sh);
      const t = tint.getContext("2d");
      if (t) {
        t.globalCompositeOperation = "source-over";
        t.clearRect(0, 0, p.sw, p.sh);
        t.drawImage(src, p.sx, p.sy, p.sw, p.sh, 0, 0, p.sw, p.sh);
        t.globalCompositeOperation = "source-in";
        t.fillStyle = p.colorize;
        t.fillRect(0, 0, p.sw, p.sh);
        o.drawImage(tint, -p.sw / 2, -p.sh / 2);
      }
    } else {
      o.drawImage(
        src,
        p.sx,
        p.sy,
        p.sw,
        p.sh,
        -p.sw / 2,
        -p.sh / 2,
        p.sw,
        p.sh,
      );
    }
    o.restore();
  }

  // Wash and glint land only where the picture is.
  o.globalCompositeOperation = "source-atop";
  if (scene.wash && scene.wash.alpha > 0.004) {
    o.globalAlpha = scene.wash.alpha;
    o.fillStyle = scene.wash.color;
    o.fillRect(0, 0, fw, fh);
  }
  if (scene.sweep && scene.sweep.alpha > 0.004) {
    const s = scene.sweep;
    const half = s.width / 2;
    const nx = Math.cos(s.angle);
    const ny = -Math.sin(s.angle);
    const cx = margin.x + s.cx;
    const cy = fh / 2;
    const g = o.createLinearGradient(
      cx - nx * half,
      cy - ny * half,
      cx + nx * half,
      cy + ny * half,
    );
    g.addColorStop(0, withAlpha(s.color, 0));
    g.addColorStop(0.5, withAlpha(s.color, s.alpha));
    g.addColorStop(1, withAlpha(s.color, 0));
    o.globalAlpha = 1;
    o.fillStyle = g;
    o.fillRect(0, 0, fw, fh);
  }

  o.globalCompositeOperation = "source-over";
  o.lineCap = "round";
  o.lineJoin = "round";
  for (const b of scene.bolts) {
    o.globalAlpha = b.alpha;
    o.strokeStyle = b.color;
    o.lineWidth = b.width;
    o.beginPath();
    b.pts.forEach(([x, y], i) => {
      if (i === 0) o.moveTo(x + margin.x, y + margin.y);
      else o.lineTo(x + margin.x, y + margin.y);
    });
    o.stroke();
  }
  o.globalAlpha = 1;

  ctx.drawImage(work, -fw / 2, -fh / 2);
}

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
