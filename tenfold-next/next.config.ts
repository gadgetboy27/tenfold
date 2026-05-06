import type { NextConfig } from "next";

const API_URL = process.env.VITE_API_URL ?? "https://marketyou-mu.vercel.app";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    process.env.REPLIT_DEV_DOMAIN ?? "",
    "*.replit.dev",
    "*.sisko.replit.dev",
    "*.repl.co",
  ].filter(Boolean),

  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
