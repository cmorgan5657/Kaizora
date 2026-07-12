import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  experimental: {
    // Default is 10MB. Video uploads exceed this before they reach route handlers.
    proxyClientMaxBodySize: "200mb",
  },
  // Ensure ffmpeg/ffprobe static binaries are traced into server output
  // so video evaluation works after deployment without manual server setup.
  outputFileTracingIncludes: {
    "/api/decision-layer-video/evaluate": [
      "./node_modules/ffmpeg-static/**/*",
      "./node_modules/ffprobe-static/**/*",
      "./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/**/*",
      "./node_modules/.pnpm/ffprobe-static@*/node_modules/ffprobe-static/**/*",
    ],
  },
};

export default nextConfig;
