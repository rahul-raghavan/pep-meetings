import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    proxyClientMaxBodySize: '100mb',
  },
  serverExternalPackages: ['ffmpeg-static'],
};

export default nextConfig;
