import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The Next image optimizer 400s on Railway (it isn't provisioned the way
    // Vercel does it), which made every <Image> fall back to its alt text — so
    // anchor images rendered as the prompt string. Serve images unoptimized so
    // the browser loads the (already public, already reasonably sized) storage
    // URLs directly. remotePatterns kept for any optimized usage / future move.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.fal.media' },
      { protocol: 'https', hostname: 'fal.media' },
      { protocol: 'https', hostname: '**.fal.ai' },
    ],
  },
  async redirects() {
    return [
      // Canonical host: redirect www.tenfold.nz → apex so OAuth redirect URIs and
      // the app's base URL only ever need to match one host (https://tenfold.nz).
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.tenfold.nz" }],
        destination: "https://tenfold.nz/:path*",
        permanent: true,
      },
    ];
  },
  // CORS headers are handled by lib/auth/middleware.ts (more flexible, dynamic origin matching)
  // next.config headers() cannot send comma-separated origins — only single origin or *
};

export default nextConfig;
