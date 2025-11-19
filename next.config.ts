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
};

export default nextConfig;
