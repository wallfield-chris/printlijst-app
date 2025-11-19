import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/prisma-studio',
        destination: 'http://localhost:5555',
      },
      {
        source: '/prisma-studio/:path*',
        destination: 'http://localhost:5555/:path*',
      },
    ]
  },
  async headers() {
    return [
      {
        source: '/prisma-studio/:path*',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
        ],
      },
    ]
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:5555'],
    },
  },
};

export default nextConfig;
