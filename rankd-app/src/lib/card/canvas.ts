"use client";

// The awkward parts of drawing a card, in one place so three designs share them.
//
// ── The taint problem, and why the URLs get a query string ──────────────────
//
// Drawing a remote image to a canvas and then reading the canvas back is only
// allowed if the image was fetched with CORS. Posters come from image.tmdb.org,
// which does send `Access-Control-Allow-Origin: *`, so on paper this is free.
//
// It is not, and the reason is the browser cache. Every poster on a card has
// ALREADY been loaded by the app as a plain `<img>` with no `crossOrigin` — and
// a cached no-CORS response cannot satisfy a later CORS request. The browser
// does not re-fetch; it serves what it has, the CORS check fails, and the image
// errors outright. Measured in the live app: with the poster pre-loaded the
// normal way, `crossOrigin = "anonymous"` gave LOAD FAILED and `fetch(url,
// {mode:"cors"})` gave "Failed to fetch"; the same URL untouched by the app
// loaded clean and drew to a canvas that exported fine.
//
// So each poster is requested under a URL the app has never displayed — same
// image, one extra query parameter, its own cache entry. It costs a re-download
// of the handful of posters on the card and needs no proxy, no server route and
// no change to how the app shows artwork anywhere else.
//
// A poster that still won't load is drawn as a plain block. A card missing one
// image is worth far more than no card at all.

import type { Faces, Palette } from "./types";

/** The same image under a URL the app has never rendered — see the note above. */
const corsUrl = (url: string) => url + (url.includes("?") ? "&" : "?") + "rankd=card";

// One request per URL for the life of the page.
//
// This is what makes three designs cost roughly one design's network. Swiping
// from Classic to Wrapped re-uses the same twenty posters, and without a memo
// each design would re-fetch all of them — which is both slow enough to see and
// enough repeated traffic to get rate-limited.
const loaded = new Map<string, Promise<HTMLImageElement | null>>();

export function loadImage(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const hit = loaded.get(url);
  if (hit) return hit;
  const req = new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // a missing poster is a gap, not a failure
    img.src = corsUrl(url);
  });
  loaded.set(url, req);
  return req;
}

// ── Type ───────────────────────────────────────────────────────────────────
//
// Read off the running app rather than restated, so a card cannot drift from
// the screens. next/font puts the generated family names on <html> as the same
// CSS variables Tailwind's theme uses.

export const FALLBACK_FACES: Faces = {
  display: "Impact, sans-serif",
  serif: "Georgia, serif",
  sans: "system-ui, sans-serif",
};

export function readFaces(): Faces {
  if (typeof window === "undefined") return FALLBACK_FACES;
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, or: string) => css.getPropertyValue(name).trim() || or;
  return {
    display: read("--font-bebas", FALLBACK_FACES.display),
    serif: read("--font-src-serif", FALLBACK_FACES.serif),
    sans: read("--font-inter", FALLBACK_FACES.sans),
  };
}

/**
 * Load exactly the faces a design asks for.
 *
 * The specs come from the renderer rather than being a fixed list here. The
 * first version hard-coded the five sizes the one design used, which works right
 * up until a second design draws bigger type — canvas then falls back silently,
 * and the card ships in Times on whichever machines hadn't already loaded that
 * face for other reasons. A silent, machine-dependent failure is the worst kind,
 * so the list of what to load lives with the code that draws it.
 */
export async function loadFonts(specs: string[]): Promise<void> {
  if (typeof window === "undefined" || !document.fonts) return;
  try {
    await Promise.all(specs.map((s) => document.fonts.load(s)));
    await document.fonts.ready;
  } catch {
    // A font that refuses to load is a fallback, not a failed export.
  }
}

// ── Colour ─────────────────────────────────────────────────────────────────

export function readPalette(): Palette {
  const css = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const read = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
  return {
    bg: read("--bg", "#040c1a"),
    surface: read("--surface", "#0a1424"),
    gold: read("--gold", "#e7b53e"),
    text: read("--text-hi", "#eaf0fa"),
    dim: read("--dim", "#8ca0c0"),
    border: read("--border", "#122036"),
  };
}

/**
 * The winning poster's colour, for the card's one accent.
 *
 * Averaging every pixel gives mud — posters are mostly shadow, and the mean of
 * a whole image trends grey. So pixels are weighted by how colourful they are
 * (max channel minus min), which lets the one saturated thing in a dark poster
 * carry the result: Drive comes back hot pink, Dunkirk comes back steel.
 *
 * The result is then floored for lightness, because the card is dark and a
 * genuinely dark accent on a dark background is not an accent.
 */
/** Below this the poster is too colourless to be anyone's accent. */
const MIN_CHROMA = 28;

export function accentFrom(img: HTMLImageElement | null, fallback: string): string {
  if (!img) return fallback;
  try {
    const n = 32; // enough to characterise a poster, cheap enough to be free
    const c = document.createElement("canvas");
    c.width = n;
    c.height = n;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return fallback;
    ctx.drawImage(img, 0, 0, n, n);
    const { data } = ctx.getImageData(0, 0, n, n);

    let r = 0, g = 0, b = 0, weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [pr, pg, pb] = [data[i], data[i + 1], data[i + 2]];
      const chroma = Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
      const w = chroma * chroma; // squared, so a vivid pixel outvotes ten grey ones
      r += pr * w;
      g += pg * w;
      b += pb * w;
      weight += w;
    }
    if (weight === 0) return fallback; // a genuinely greyscale poster

    const [mr, mg, mb] = [r / weight, g / weight, b / weight];
    // A MINIMUM CHROMA, not merely a non-zero one.
    //
    // The first version only bailed on a *perfectly* grey poster, so a nearly
    // grey one — Inception's concrete and steel, say — returned a nearly grey
    // colour, which `lift` then brightened into off-white. The card came back
    // looking like it had no accent at all, which is worse than having an
    // obviously wrong one. Below this threshold the poster does not get a vote
    // and the brand colour is used instead.
    if (Math.max(mr, mg, mb) - Math.min(mr, mg, mb) < MIN_CHROMA) return fallback;
    return lift(mr, mg, mb);
  } catch {
    return fallback; // a tainted or unreadable image simply doesn't get a say
  }
}

/** Push a colour up to a usable lightness without washing out its hue. */
export function lift(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const scale = max < 170 ? 170 / Math.max(max, 1) : 1;
  const to = (v: number) => Math.round(Math.min(255, v * scale));
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

// ── Text ───────────────────────────────────────────────────────────────────

/** Shrink until it fits. A long director's name must not run off the card. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  max: number,
  font: (px: number) => string,
  from: number,
  floor: number,
): number {
  let px = from;
  while (px > floor) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= max) break;
    px -= 1;
  }
  ctx.font = font(px);
  return px;
}

export function ellipsis(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + "…").width > max) cut = cut.slice(0, -1);
  return cut + "…";
}

/** Break to at most `maxLines`, ellipsising whatever won't fit on the last. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++];
    while (i < words.length && ctx.measureText(`${line} ${words[i]}`).width <= max) {
      line += ` ${words[i++]}`;
    }
    if (lines.length === maxLines - 1 && i < words.length) {
      line = ellipsis(ctx, [line, ...words.slice(i)].join(" "), max);
      i = words.length;
    }
    lines.push(line);
  }
  return lines.length ? lines : [""];
}

// ── Shapes ─────────────────────────────────────────────────────────────────

export const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/**
 * Draw an image filling a box, cropping the overflow — CSS `object-fit: cover`.
 *
 * `drawImage(img, x, y, w, h)` stretches instead, which is invisible for a
 * poster drawn at 2:3 into a 2:3 box and badly wrong for anything else: a TMDb
 * portrait is not the same shape as the circle it goes in, and squashing a face
 * is more noticeable than cropping one.
 */
export function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  // Horizontally centred, but biased to the TOP third vertically — on a portrait
  // the face is above the middle, and a centred crop cuts foreheads off.
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) * 0.35, dw, dh);
}

export function drawCircleImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  cx: number,
  cy: number,
  r: number,
  fallbackFill: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    drawCover(ctx, img, cx - r, cy - r, r * 2, r * 2);
  } else {
    ctx.fillStyle = fallbackFill;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  ctx.restore();
}

export function encode(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the card"))),
      "image/jpeg",
      quality,
    );
  });
}
