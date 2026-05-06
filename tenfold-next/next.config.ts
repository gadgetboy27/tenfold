import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    process.env.REPLIT_DEV_DOMAIN ?? '',
    '*.replit.dev',
    '*.sisko.replit.dev',
    '*.repl.co',
  ].filter(Boolean),
};

export default nextConfig;
