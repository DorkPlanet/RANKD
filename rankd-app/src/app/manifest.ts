import type { MetadataRoute } from "next";

// What turns the tab into an app.
//
// Rankd was always shaped like one — client-rendered, phone-sized, its own
// splash, its own nav, its own header — and then wore a browser address bar
// across the top of all of it. `display: standalone` is the line that removes
// it: Add to Home Screen from there launches into a bare window with no URL,
// no browser chrome and Rankd's own icon.
//
// Two things are deliberate here.
//
// `background_color` is --bg (#040c1a) rather than black. It paints the launch
// window for the instant before React mounts, so it must match what `Splash`
// sits on — black would be a visible flash of a colour the app never uses as a
// page ground.
//
// `theme_color` IS black, because it colours the system bars that sit against
// the app's own header, and the header is --header-bg (#000000). The two
// colours differ on purpose; they are describing two different edges.
//
// iOS ignores almost all of this — it reads `apple-mobile-web-app-capable` and
// `apple-touch-icon` instead, both declared in layout.tsx. Android and desktop
// Chrome read this file.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rankd",
    short_name: "Rankd",
    description: "A ranking game for serious film people.",
    start_url: "/",
    // Not `fullscreen`: that hides the status bar too, so the clock and the
    // battery go with the URL. The app is something you play in ten-minute
    // sittings, not something you disappear into.
    display: "standalone",
    orientation: "portrait",
    background_color: "#040c1a",
    theme_color: "#000000",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops an icon to whatever shape the launcher uses. A `maskable`
      // entry is the app saying "clip this one" — without it the system pads the
      // `any` icon into a white rounded square and the mark ends up small on a
      // background Rankd does not own.
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
