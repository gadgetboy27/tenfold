import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.supabase.co' },
      { protocol: 'https', hostname: '**.fal.media' },
      { protocol: 'https', hostname: 'fal.media' },
      { protocol: 'https', hostname: '**.fal.ai' },
    ],
  },
  // CORS headers are handled by lib/auth/middleware.ts (more flexible, dynamic origin matching)
  // next.config headers() cannot send comma-separated origins — only single origin or *
};

export default nextConfig;
