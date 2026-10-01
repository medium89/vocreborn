import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.122"],
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  async rewrites() {
    return ["live.mp3", "dj.mp3"].map(name => ({ source: "/radio-stream/" + name, destination: (process.env.RADIO_STREAM_PROXY_URL ?? "http://127.0.0.1:3005") + "/" + name }));
  },
};

export default nextConfig;
