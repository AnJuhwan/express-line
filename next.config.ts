import type { NextConfig } from "next";

const realtimeDataFiles = ["./data/realtime-traffic-*.ndjson"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/": realtimeDataFiles,
    "/data": realtimeDataFiles,
    "/api/**/*": realtimeDataFiles
  }
};

export default nextConfig;
