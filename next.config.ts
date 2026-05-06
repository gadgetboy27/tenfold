import type { NextConfig } from "next";

const ALLOWED_ORIGINS = [
  'https://tenfold.nz',
  process.env.REPLIT_ORIGIN, // set on Vercel: your Replit preview URL
].filter(Boolean) as string[];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: ALLOWED_ORIGINS.join(',') },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization,x-workspace-slug' },
        ],
      },
    ];
  },
};

export default nextConfig;
