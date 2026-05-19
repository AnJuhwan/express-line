import type { NextConfig } from "next";

const requestedTrafficFiles = ["./data/csv/*.json"];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/five-minute": requestedTrafficFiles,
    "/api/requested-traffic/five-minute": requestedTrafficFiles
  }
};

export default nextConfig;
