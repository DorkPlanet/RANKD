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
};

export const viewport: Viewport = {
  themeColor: "#150F24",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
