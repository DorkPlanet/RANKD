import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4, Bebas_Neue } from "next/font/google";
import "./globals.css";

// Ported from the prototype: Inter (UI), Source Serif 4 (numbers/titles),
// Bebas Neue (the wordmark). Exposed as CSS vars for Tailwind's theme + raw CSS.
//
// ── Every weight declared here must be one the app actually asks for, and
//    every weight the app asks for must be declared here ──────────────────────
//
// These two lists had drifted apart in both directions and the result was
// invisible, which is what makes it worth a comment rather than a commit.
//
// Inter carried `500` that nothing used (there is not one `font-medium` in the
// codebase) and did NOT carry `800`, which 77 class names asked for. A weight
// that is never fetched does not fail — the browser matches the nearest one it
// has — so all 77 `font-extrabold`s rendered at 700, identically to the 55
// `font-bold`s beside them. Every place the code drew a distinction between the
// two was drawing nothing. Those class names are now `font-bold`; do not
// reintroduce `font-extrabold` without adding `800` here first.
//
// Source Serif was the same bug in reverse: it declared only `600`/`700`, so the
// eleven places setting a bio, a tagline or a blurb in bare `font-serif italic`
// asked for 400 and were served 600. The app's quietest voice was being set in
// semibold. `400` is declared now, which is what makes `font-normal` on a serif
// numeral (see `ListScreen`'s shuffled ranks) a real contrast against its
// `font-bold` sibling rather than 700-vs-600.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});
const sourceSerif = Source_Serif_4({
  variable: "--font-src-serif",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  style: ["normal", "italic"],
});
const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Rankd",
  description: "A ranking game for serious film people.",
  // ── Losing the address bar on iOS ────────────────────────────────────────
  //
  // `app/manifest.ts` handles Android and desktop Chrome. iOS reads none of it:
  // Safari decides whether a home-screen launch gets browser chrome from
  // `apple-mobile-web-app-capable` alone, which is what `capable: true` emits.
  // Without this line the manifest is not wrong, it is simply not consulted,
  // and the app opens in a Safari tab with the URL across the top.
  //
  // `black-translucent` pairs with the `viewportFit: "cover"` below. The app
  // already draws into the safe areas — the header and the nav both pad
  // themselves with env(safe-area-inset-*) — so the status bar should sit ON
  // the header's black rather than reserve a strip above it. Any other value
  // gives back the inset the layout has already accounted for and leaves a bar
  // of page background above the header.
  appleWebApp: {
    capable: true,
    title: "Rankd",
    statusBarStyle: "black-translucent",
  },
  // ── Both spellings of the same switch, on purpose ────────────────────────
  //
  // `appleWebApp.capable` above does NOT emit `apple-mobile-web-app-capable` in
  // Next 16. It emits the standardised `mobile-web-app-capable`, which is the
  // right modern name and is what Android reads. Verified against the rendered
  // head rather than assumed — the Apple-prefixed tag was simply absent.
  //
  // Older iOS reads only the prefixed spelling, and that is the one device class
  // this whole feature exists for. A duplicate meta tag costs 54 bytes and is
  // ignored where it is not needed; guessing wrong costs the address bar staying
  // exactly where it is on the phones most likely to be running this.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  // iOS composites a home-screen icon onto white if it carries alpha, so
  // apple-touch-icon.png is opaque. Declared explicitly rather than relying on
  // the file-convention pickup, which only covers `app/`, not `public/`.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Draw under the notch/home indicator so the header and nav can extend into
  // the safe areas — without this env(safe-area-inset-*) is always 0 and the
  // nav stops short, letting the page background show beneath it.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerif.variable} ${bebas.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
