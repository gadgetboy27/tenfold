"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  z: number; // depth 0..1 — drives size, brightness, drift speed
  tw: number; // twinkle phase
}

/**
 * Lightweight canvas starfield — the "cosmic" signature of the dark landing.
 * Stars drift slowly upward and twinkle; depth (z) gives parallax-ish layering.
 * Pauses when off-screen / reduced-motion to stay cheap.
 */
export function Starfield({ density = 0.00014 }: { density?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let stars: Star[] = [];
    let raf = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      const count = Math.floor(window.innerWidth * window.innerHeight * density);
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random(),
        tw: Math.random() * Math.PI * 2,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.y -= (0.05 + s.z * 0.25) * dpr;
        if (s.y < 0) s.y = canvas.height;
        s.tw += 0.02 + s.z * 0.02;
        const alpha = 0.25 + (Math.sin(s.tw) * 0.5 + 0.5) * (0.3 + s.z * 0.5);
        const r = (s.z * 1.4 + 0.3) * dpr;
        // violet-tinted stars for the brand glow
        ctx.fillStyle = `rgba(${190 + s.z * 40}, ${180 + s.z * 30}, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    resize();
    if (reduced) {
      draw(); // single static frame
      cancelAnimationFrame(raf);
    } else {
      raf = requestAnimationFrame(draw);
    }
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [density]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-70"
    />
  );
}
