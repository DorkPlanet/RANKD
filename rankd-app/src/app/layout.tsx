import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4, Bebas_Neue } from "next/font/google";
import "./globals.css";

// Ported from the prototype: Inter (UI), Source Serif 4 (numbers/titles),
// Bebas Neue (the wordmark). Exposed as CSS vars for Tailwind's theme + raw CSS.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const sourceSerif = Source_Serif_4({
  variable: "--font-src-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
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
