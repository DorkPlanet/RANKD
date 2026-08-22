import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow phone/tablet testing over the LAN: Next blocks cross-origin dev
  // resources (/_next/*, HMR) by default, which leaves the page rendering the
  // background with no client JS. The private-range hosts below are dev-only.
  allowedDevOrigins: ["192.168.0.97", "192.168.0.*"],

  // ── /@handle, without a folder called `@` ────────────────────────────────
  //
  // The obvious implementation is `src/app/@[handle]/`, and it silently does
  // something else entirely: a folder beginning with `@` is Next's PARALLEL
  // ROUTE SLOT convention. The segment is stripped from the URL, the page never
  // appears at the address you wanted, and nothing errors to tell you so.
  //
  // So the real page lives at `/u/[handle]` and this maps the pretty address
  // onto it. `generateMetadata` sets a canonical of `/@handle`, so `/u/...`
  // never becomes the address anybody sees or a crawler indexes.
  async rewrites() {
    return [{ source: "/@:handle", destination: "/u/:handle" }];
  },
};

export default nextConfig;
