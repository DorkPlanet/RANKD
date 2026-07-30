import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phone/tablet testing over the LAN: Next blocks cross-origin dev
  // resources (/_next/*, HMR) by default, which leaves the page rendering the
  // background with no client JS. The private-range hosts below are dev-only.
  allowedDevOrigins: ["192.168.0.97", "192.168.0.*"],
};

export default nextConfig;
