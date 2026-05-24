import type { NextConfig } from "next";

const requestedTrafficFiles = [
  "./data/csv-20260513-20260515/*.json",
  "./data/csv-20260520/*.json"
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/2026-05-20/five-minute": requestedTrafficFiles,
    "/2026-05-20/hourly": requestedTrafficFiles,
    "/2026-05-20/maps": requestedTrafficFiles,
    "/five-minute": requestedTrafficFiles,
    "/hourly": requestedTrafficFiles,
    "/api/requested-traffic/five-minute": requestedTrafficFiles,
    "/api/requested-traffic/hourly": requestedTrafficFiles
  }
};

export default nextConfig;
