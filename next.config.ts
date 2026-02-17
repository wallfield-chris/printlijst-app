import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 's3.eu-central-1.amazonaws.com',
        pathname: '/goedgepickt/**',
      },
      {
        protocol: 'https',
        hostname: 'account.goedgepickt.nl',
        pathname: '/images/**',
      },
    ],
  },
};

export default nextConfig;
