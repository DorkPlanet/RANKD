"use client";

// Everything a card needs done before a design can draw, done once.
//
// The split earns its keep here. Three designs each need CORS-safe posters, the
// app's real fonts loaded at the sizes they use, a colour pulled from the
// winning poster, a canvas at the right scale, and a JPEG at the end — and every
// one of those is either awkward, order-dependent, or both. Doing them here
// means a design is a pure `draw` that cannot get any of it wrong.
//
// The ORDER is the part worth stating: the accent colour is read from the #1
// poster, so that image has to be in hand before the first rule is drawn. That
// is why `images()` is contractually "#1 first" and why `draw` is synchronous —
// a design that could await would be a design that could draw a rule before
// knowing what colour it is.

import { accentFrom, encode, loadFonts, loadImage, readFaces, readPalette } from "./canvas";
import { classic } from "./classic";
import { collector } from "./collector";
import { wrapped } from "./wrapped";
import type { CardData, CardDesign, Renderer } from "./types";

const RENDERERS: Record<CardDesign, Renderer> = { classic, wrapped, collector };

export const designs: readonly CardDesign[] = ["classic", "wrapped", "collector"];

export const designName: Record<CardDesign, string> = {
  classic: "Classic",
  wrapped: "Wrapped",
  collector: "Collector",
};

export async function renderCard(design: CardDesign, data: CardData): Promise<Blob> {
  if (data.entries.length === 0) throw new Error("Nothing to draw");
  const renderer = RENDERERS[design];
  const { w, h, scale, pad } = renderer.size;

  const faces = readFaces();
  const palette = readPalette();

  // Fonts and pictures together — they are independent, and a card waits for the
  // slower of the two rather than the sum.
  //
  // The raw list is kept before de-duping because position 0 is the #1 poster by
  // contract, and it may legitimately be `undefined`. Filtering first and then
  // taking `[0]` would silently promote row two's poster to "the winner", so a
  // #1 with no artwork would take its accent from a different film instead of
  // falling back to gold.
  const wanted = renderer.images(data);
  const heroUrl = wanted[0];
  const urls = [...new Set(wanted.filter((u): u is string => !!u))];
  const [, ...images] = await Promise.all([
    loadFonts(renderer.fonts(faces)),
    ...urls.map((u) => loadImage(u)),
  ]);

  const byUrl = new Map<string, HTMLImageElement | null>();
  urls.forEach((u, i) => byUrl.set(u, images[i] as HTMLImageElement | null));

  const canvas = document.createElement("canvas");
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.scale(scale, scale); // designs draw in layout units; everything lands at scale
  ctx.textBaseline = "alphabetic";

  renderer.draw(ctx, data, {
    faces,
    palette,
    // The #1 poster is `images()[0]` by contract, so this is the winner's colour.
    accent: accentFrom((heroUrl ? byUrl.get(heroUrl) : null) ?? null, palette.gold),
    images: byUrl,
    w,
    h,
    pad,
  });

  return encode(canvas);
}
