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

interface Star {
  x: number; y: number;
  size: number;
  alpha: number;
}

// Project a 3D point (rotated around Y then X) to 2D canvas coords
function project(
  px: number, py: number, pz: number,
  rotX: number, rotY: number,
  cx: number, cy: number,
  fov: number
): [number, number] {
  // Rotate around Y
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const x1 = px * cosY + pz * sinY;
  const z1 = -px * sinY + pz * cosY;
  // Rotate around X
  const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
  const y1 = py * cosX - z1 * sinX;
  const z2 = py * sinX + z1 * cosX;
  // Perspective divide
  const dist = fov / (fov + z2 + 80);
  return [cx + x1 * dist, cy + y1 * dist];
}

function drawCube(
  ctx: CanvasRenderingContext2D,
  cube: Cube,
  cx: number,
  cy: number,
  fov: number
) {
  const s = cube.size / 2;
  const corners: [number, number, number][] = [
    [-s, -s, -s], [s, -s, -s], [s, s, -s], [-s, s, -s],
    [-s, -s,  s], [s, -s,  s], [s, s,  s], [-s, s,  s],
  ];

  const pts = corners.map(([px, py, pz]) =>
    project(px + cube.x, py + cube.y, pz + cube.z, cube.rotX, cube.rotY, cx, cy, fov)
  );

  const faces = [
    [0, 1, 2, 3], // back
    [4, 5, 6, 7], // front
    [0, 1, 5, 4], // bottom
    [2, 3, 7, 6], // top
    [0, 3, 7, 4], // left
    [1, 2, 6, 5], // right
  ];

  const purple = `rgba(124,92,252,${cube.alpha * 0.06})`;
  const edge = `rgba(124,92,252,${cube.alpha * 0.38})`;

  ctx.lineWidth = 0.8;
  ctx.strokeStyle = edge;

  faces.forEach(face => {
    ctx.beginPath();
    ctx.moveTo(pts[face[0]][0], pts[face[0]][1]);
    for (let i = 1; i < face.length; i++) ctx.lineTo(pts[face[i]][0], pts[face[i]][1]);
    ctx.closePath();
    ctx.fillStyle = purple;
    ctx.fill();
    ctx.stroke();
  });
}

export default function CosmicBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const mobile = isMobile();
    const CUBE_COUNT = mobile ? 8 : 18;
    const STAR_COUNT = mobile ? 120 : 320;
    const FPS = mobile ? 24 : 50;
    const frameDuration = 1000 / FPS;

    let W = canvas.parentElement!.clientWidth;
    let H = canvas.parentElement!.clientHeight;
    canvas.width = W;
    canvas.height = H;
    const fov = Math.min(W, H) * 1.2;

    // Init stars
    const stars: Star[] = Array.from({ length: STAR_COUNT }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() * 1.2,
      alpha: Math.random() * 0.4 + 0.05,
    }));

    // Init cubes
    const cubes: Cube[] = Array.from({ length: CUBE_COUNT }, () => ({
      x: (Math.random() - 0.5) * W * 0.9,
      y: (Math.random() - 0.5) * H * 0.9,
      z: (Math.random() - 0.5) * 120,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.12,
      vz: (Math.random() - 0.5) * 0.06,
      size: 24 + Math.random() * 56,
      rotX: Math.random() * Math.PI * 2,
      rotY: Math.random() * Math.PI * 2,
      vrX: (Math.random() - 0.5) * 0.004,
      vrY: (Math.random() - 0.5) * 0.004,
      alpha: 0.3 + Math.random() * 0.5,
    }));

    let animId: number;
    let last = 0;

    const draw = (time: number) => {
      animId = requestAnimationFrame(draw);
      if (document.hidden) return;
      if (time - last < frameDuration) return;
      last = time;

      ctx.clearRect(0, 0, W, H);

      // Stars
      stars.forEach(s => {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
        ctx.fill();
      });

      // Cubes
      const cx = W / 2, cy = H / 2;
      cubes.forEach(cube => {
        cube.x += cube.vx;
        cube.y += cube.vy;
        cube.z += cube.vz;
        cube.rotX += cube.vrX;
        cube.rotY += cube.vrY;

        // Soft wrap
        const bx = W * 0.55, by = H * 0.55;
        if (Math.abs(cube.x) > bx) cube.vx *= -1;
        if (Math.abs(cube.y) > by) cube.vy *= -1;
        if (Math.abs(cube.z) > 100) cube.vz *= -1;

        drawCube(ctx, cube, cx, cy, fov);
      });
    };

    animId = requestAnimationFrame(draw);

    const onResize = () => {
      W = canvas.parentElement!.clientWidth;
      H = canvas.parentElement!.clientHeight;
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
