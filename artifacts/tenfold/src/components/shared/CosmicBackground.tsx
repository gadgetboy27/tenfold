import { useEffect, useRef } from 'react';

const isMobile = () => /Mobi|Android/i.test(navigator.userAgent);

interface Cube {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  rotX: number; rotY: number;
  vrX: number; vrY: number;
  alpha: number;
}

// Project 3D point to 2D canvas (simple perspective)
function project(
  px: number, py: number, pz: number,
  cx: number, cy: number, fov: number
): [number, number, number] {
  const scale = fov / (fov + pz + 60);
  return [cx + px * scale, cy + py * scale, scale];
}

function rotatePt(
  px: number, py: number, pz: number,
  rx: number, ry: number
): [number, number, number] {
  // rotate Y
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const x1 = px * cy + pz * sy;
  const z1 = -px * sy + pz * cy;
  // rotate X
  const cx2 = Math.cos(rx), sx = Math.sin(rx);
  const y1 = py * cx2 - z1 * sx;
  const z2 = py * sx + z1 * cx2;
  return [x1, y1, z2];
}

function drawCube(ctx: CanvasRenderingContext2D, cube: Cube, cx: number, cy: number, fov: number) {
  const s = cube.size / 2;
  const rawCorners: [number, number, number][] = [
    [-s,-s,-s],[s,-s,-s],[s,s,-s],[-s,s,-s],
    [-s,-s, s],[s,-s, s],[s,s, s],[-s,s, s],
  ];

  const pts = rawCorners.map(([px, py, pz]) => {
    const [rx, ry, rz] = rotatePt(px, py, pz, cube.rotX, cube.rotY);
    return project(cube.x + rx, cube.y + ry, cube.z + rz, cx, cy, fov);
  });

  const faces: [number,number,number,number][] = [
    [0,1,2,3],[4,5,6,7],[0,1,5,4],[2,3,7,6],[0,3,7,4],[1,2,6,5],
  ];

  const a = cube.alpha;
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = `rgba(124,92,252,${a * 0.55})`;

  // Sort faces by average Z (painter's algorithm)
  const sortedFaces = faces.map(f => ({
    face: f,
    avgZ: f.reduce((sum, i) => sum + pts[i][2], 0) / 4,
  })).sort((a, b) => a.avgZ - b.avgZ);

  sortedFaces.forEach(({ face }) => {
    ctx.beginPath();
    ctx.moveTo(pts[face[0]][0], pts[face[0]][1]);
    for (let i = 1; i < face.length; i++) ctx.lineTo(pts[face[i]][0], pts[face[i]][1]);
    ctx.closePath();
    ctx.fillStyle = `rgba(124,92,252,${a * 0.05})`;
    ctx.fill();
    ctx.stroke();
  });
}

function drawTenfold(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number,
  W: number, H: number,
  time: number,
  mobile: boolean
) {
  const fontSize = Math.min(W * 0.115, H * 0.2, 110);
  // Slow fold: oscillate between 0 and ~22 degrees
  const foldAngle = Math.sin(time * 0.00028) * 0.38;
  const foldScaleX = Math.cos(foldAngle);

  // Text y offset so it sits slightly above centre
  const textY = cy - fontSize * 0.08;

  const LAYERS = mobile ? 3 : 7;

  ctx.save();
  ctx.translate(cx, textY);
  ctx.scale(foldScaleX, 1);
  ctx.font = `800 ${fontSize}px 'Syne', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Back depth layers — extruded 3D look
  for (let d = LAYERS; d >= 1; d--) {
    const dAlpha = 0.22 - d * 0.026;
    const shiftX = d * 2.2 * Math.sin(foldAngle + 0.3);
    const shiftY = d * 1.4;
    ctx.fillStyle = `rgba(60,30,160,${Math.max(dAlpha, 0.02)})`;
    ctx.fillText('TENFOLD', shiftX, shiftY);
  }

  // Front face glow
  ctx.shadowColor = 'rgba(124,92,252,0.55)';
  ctx.shadowBlur = 28;
  ctx.fillStyle = 'rgba(124,92,252,0.18)';
  ctx.fillText('TENFOLD', 0, 0);

  // Slightly brighter stroke outline on front face
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(157,132,253,0.22)';
  ctx.lineWidth = 0.6;
  ctx.strokeText('TENFOLD', 0, 0);

  ctx.restore();
}

export default function CosmicBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mobile = isMobile();
    const CUBE_COUNT = mobile ? 9 : 20;
    const STAR_COUNT = mobile ? 100 : 280;
    const FPS = mobile ? 24 : 50;
    const frameDuration = 1000 / FPS;

    let W = canvas.parentElement!.clientWidth || 800;
    let H = canvas.parentElement!.clientHeight || 600;
    canvas.width = W;
    canvas.height = H;

    const fov = () => Math.min(W, H) * 1.3;

    // ── Stars ──────────────────────────────────────────────
    const stars = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.1 + 0.1,
      a: Math.random() * 0.35 + 0.05,
    }));

    // ── Cubes ──────────────────────────────────────────────
    // Spread them around the edges so they don't start inside the text
    const spread = (i: number, total: number): [number, number] => {
      const angle = (i / total) * Math.PI * 2;
      const r = Math.min(W, H) * 0.38 + Math.random() * 60;
      return [Math.cos(angle) * r, Math.sin(angle) * r];
    };

    const cubes: Cube[] = Array.from({ length: CUBE_COUNT }, (_, i) => {
      const [sx, sy] = spread(i, CUBE_COUNT);
      return {
        x: sx, y: sy,
        z: (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.16,
        vz: (Math.random() - 0.5) * 0.07,
        size: mobile ? 20 + Math.random() * 36 : 22 + Math.random() * 52,
        rotX: Math.random() * Math.PI * 2,
        rotY: Math.random() * Math.PI * 2,
        vrX: (Math.random() - 0.5) * 0.005,
        vrY: (Math.random() - 0.5) * 0.005,
        alpha: 0.35 + Math.random() * 0.55,
      };
    });

    // ── Physics helpers ────────────────────────────────────

    // Elastic collision between two cubes (sphere approximation)
    const collidePair = (a: Cube, b: Cube) => {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const distSq = dx*dx + dy*dy + dz*dz;
      const minDist = (a.size + b.size) * 0.52;
      if (distSq >= minDist * minDist || distSq === 0) return;

      const dist = Math.sqrt(distSq);
      const nx = dx/dist, ny = dy/dist, nz = dz/dist;

      // Relative velocity along normal
      const dvx = b.vx - a.vx, dvy = b.vy - a.vy, dvz = b.vz - a.vz;
      const dot = dvx*nx + dvy*ny + dvz*nz;
      if (dot >= 0) return; // already separating

      // Impulse (equal mass, coefficient of restitution ≈ 0.85)
      const impulse = dot * 0.85;
      a.vx += impulse * nx; a.vy += impulse * ny; a.vz += impulse * nz;
      b.vx -= impulse * nx; b.vy -= impulse * ny; b.vz -= impulse * nz;

      // Positional correction — push apart so they don't overlap
      const overlap = (minDist - dist) * 0.5;
      a.x -= nx * overlap; a.y -= ny * overlap; a.z -= nz * overlap;
      b.x += nx * overlap; b.y += ny * overlap; b.z += nz * overlap;
    };

    // Repel cube away from the TENFOLD text zone (ellipse at canvas centre)
    const repelFromText = (cube: Cube) => {
      // Text zone in 3D: roughly an ellipse at z≈0, centred at origin
      const f = fov();
      const scale = f / (f + cube.z + 60);
      // Approximate projected text half-width / half-height
      const textFontSize = Math.min(W * 0.115, H * 0.2, 110);
      const tw = textFontSize * 3.8 * scale; // half-width in px
      const th = textFontSize * 0.7 * scale; // half-height in px
      const ex = cube.x * scale / tw;
      const ey = cube.y * scale / th;
      const ellipseD = Math.sqrt(ex*ex + ey*ey);

      if (ellipseD < 1.05) {
        // Push out
        const nx = ex / (ellipseD || 1);
        const ny = ey / (ellipseD || 1);
        const push = (1.05 - ellipseD) * 0.4;
        cube.vx += nx * push;
        cube.vy += ny * push;
        // Slightly spin up on collision
        cube.vrY += 0.003;
      }
    };

    // Hard wall bounce in 3D world space
    const wallBounce = (cube: Cube) => {
      const bx = W * 0.52, by = H * 0.52, bz = 110;
      const R = cube.size * 0.5;
      if (cube.x - R < -bx) { cube.x = -bx + R; cube.vx = Math.abs(cube.vx) * 0.9; }
      if (cube.x + R >  bx) { cube.x =  bx - R; cube.vx = -Math.abs(cube.vx) * 0.9; }
      if (cube.y - R < -by) { cube.y = -by + R; cube.vy = Math.abs(cube.vy) * 0.9; }
      if (cube.y + R >  by) { cube.y =  by - R; cube.vy = -Math.abs(cube.vy) * 0.9; }
      if (cube.z - R < -bz) { cube.z = -bz + R; cube.vz = Math.abs(cube.vz) * 0.9; }
      if (cube.z + R >  bz) { cube.z =  bz - R; cube.vz = -Math.abs(cube.vz) * 0.9; }
    };

    // ── Render loop ────────────────────────────────────────
    let animId: number;
    let last = 0;

    const draw = (time: number) => {
      animId = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (time - last < frameDuration) return;
      last = time;

      const cx = W / 2, cy = H / 2;
      const f = fov();

      ctx.clearRect(0, 0, W, H);

      // Stars
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a})`;
        ctx.fill();
      }

      // TENFOLD folding text (drawn before cubes so cubes appear in front)
      drawTenfold(ctx, cx, cy, W, H, time, mobile);

      // Physics step
      for (let i = 0; i < cubes.length; i++) {
        const c = cubes[i];
        c.x += c.vx; c.y += c.vy; c.z += c.vz;
        c.rotX += c.vrX; c.rotY += c.vrY;
        repelFromText(c);
        wallBounce(c);
      }

      // Cube-to-cube collisions (O(n²), fine for n≤20)
      for (let i = 0; i < cubes.length - 1; i++) {
        for (let j = i + 1; j < cubes.length; j++) {
          collidePair(cubes[i], cubes[j]);
        }
      }

      // Draw cubes (sorted by Z so closer ones draw on top)
      const sorted = [...cubes].sort((a, b) => b.z - a.z);
      for (const cube of sorted) {
        drawCube(ctx, cube, cx, cy, f);
      }
    };

    animId = requestAnimationFrame(draw);

    const onResize = () => {
      if (!canvas.parentElement) return;
      W = canvas.parentElement.clientWidth || W;
      H = canvas.parentElement.clientHeight || H;
      canvas.width = W;
      canvas.height = H;
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0, width: '100%', height: '100%' }}
    />
  );
}
