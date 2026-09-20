import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.122"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
};

export default nextConfig;