"use client";

// A finished ranking, as a picture you can send someone.
//
// ── The taint problem, and why the URLs get a query string ──────────────────
//
// Drawing a remote image to a canvas and then reading the canvas back is only
// allowed if the image was fetched with CORS. Posters come from image.tmdb.org,
// which does send `Access-Control-Allow-Origin: *`, so on paper this is free.
//
// It is not, and the reason is the browser cache. Every poster on this card has
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
//
// ── Why it looks like this ─────────────────────────────────────────────────
//
// Rebuilt against what makes Spotify Wrapped shareable, minus what would fight
// this app:
//
//  · A CARD, NOT A POSTER. 1080x1350 — 4:5, the tallest thing Instagram's feed
//    will show uncropped, and a shape Twitter renders whole rather than reducing
//    to a letterboxed strip. This started at 9:16 by copying Wrapped's slides
//    literally, which was the wrong lesson: Wrapped is a full-screen STORY you
//    swipe, so 9:16 is right for it. This is one image posted to a feed, and a
//    9:16 feed post is a long thin sliver nobody reads. The principle worth
//    taking from Wrapped is "shaped for exactly where it gets posted" — and that
//    is a different shape here.
//    The consequence is deliberate: a short card holds fewer films, so it shows
//    the top handful and says how many it left out.
//  · THE NUMERAL IS THE PICTURE. Wrapped 2024 built its whole system on
//    oversized numbers. A ranking has an even better claim on that than a
//    listening stat does: the answer to "rank these" is a #1, so #1 gets the
//    hero and everything else is the supporting cast.
//  · COLOUR COMES FROM THE ARTWORK. Spotify computes its backgrounds from album
//    art, which is what stops every card looking like the same template. Here it
//    is pulled from the winning poster and spent on two hairlines and the hero's
//    ring — an accent, not a wash. No gradients: this app is dark, gold and
//    serif, closer to Wrapped 2025's restraint than 2024's maximalism, and a
//    vibrant gradient era would look borrowed.
//  · THE APP'S OWN TYPE. Bebas, Source Serif and Inter, read off the same CSS
//    variables the screens use, so the card is recognisably from here.

import { BARS } from "./brand";
import { starsFor } from "./tiers";
import type { Film } from "./types";

/** The same image under a URL the app has never rendered — see the note above. */
const corsUrl = (url: string) => url + (url.includes("?") ? "&" : "?") + "rankd=card";

function loadPoster(url: string | undefined): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // a missing poster is a gap, not a failure
    img.src = corsUrl(url);
  });
}

export interface CardOptions {
  title: string;
  /** "Director", say. The film count is added here, not by the caller. */
  subtitle?: string;
  films: readonly Film[];
}

// 1080x1350 — 4:5, drawn at 2x from a 540x675 layout so every number below
// reads as points on a phone rather than device pixels.
const S = 2;
const W = 540;
const H = 675;
const PAD = 36;

// ── Type ───────────────────────────────────────────────────────────────────
//
// Read off the running app rather than restated, so the card cannot drift from
// the screens. next/font puts the generated family names on <html> as the same
// CSS variables Tailwind's theme uses.
//
// Canvas does not trigger font loading the way laying out text does: an unloaded
// family silently falls back and the card ships in Times. So every face is
// explicitly loaded before a single character is drawn.
interface Faces {
  display: string;
  serif: string;
  sans: string;
}

async function faces(): Promise<Faces> {
  const fallback: Faces = {
    display: "Impact, sans-serif",
    serif: "Georgia, serif",
    sans: "system-ui, sans-serif",
  };
  if (typeof window === "undefined") return fallback;
  const css = getComputedStyle(document.documentElement);
  const read = (name: string, or: string) => css.getPropertyValue(name).trim() || or;
  const f: Faces = {
    display: read("--font-bebas", fallback.display),
    serif: read("--font-src-serif", fallback.serif),
    sans: read("--font-inter", fallback.sans),
  };
  try {
    await Promise.all([
      document.fonts.load(`400 54px ${f.display}`),
      document.fonts.load(`700 96px ${f.serif}`),
      document.fonts.load(`600 22px ${f.serif}`),
      document.fonts.load(`600 15px ${f.sans}`),
      document.fonts.load(`700 11px ${f.sans}`),
    ]);
    await document.fonts.ready;
  } catch {
    // A font that refuses to load is a fallback, not a failed export.
  }
  return f;
}

// ── Colour ─────────────────────────────────────────────────────────────────

function palette() {
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
function accentFrom(img: HTMLImageElement | null, fallback: string): string {
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
    return lift(r / weight, g / weight, b / weight);
  } catch {
    return fallback; // a tainted or unreadable image simply doesn't get a say
  }
}

/** Push a colour up to a usable lightness without washing out its hue. */
function lift(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b);
  const scale = max < 170 ? 170 / Math.max(max, 1) : 1;
  const to = (v: number) => Math.round(Math.min(255, v * scale));
  return `rgb(${to(r)}, ${to(g)}, ${to(b)})`;
}

// ── Text helpers ───────────────────────────────────────────────────────────

/** Shrink until it fits. A long director's name must not run off the card. */
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, font: (px: number) => string, from: number, floor: number): number {
  let px = from;
  while (px > floor) {
    ctx.font = font(px);
    if (ctx.measureText(text).width <= max) break;
    px -= 1;
  }
  ctx.font = font(px);
  return px;
}

function ellipsis(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + "…").width > max) cut = cut.slice(0, -1);
  return cut + "…";
}

/** Break to at most `maxLines`, ellipsising whatever won't fit on the last. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number, maxLines: number): string[] {
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

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/** What a row says under its title. Guests earn their own line — the fact that
 *  you ranked films you haven't seen is the most interesting thing on the card. */
const noteFor = (f: Film) => (f.guest ? `${f.year ?? ""}${f.year ? " · " : ""}NOT SEEN` : [f.year, starsFor(f.rating)].filter(Boolean).join(" · "));

// ── The card ───────────────────────────────────────────────────────────────

export async function renderCard({ title, subtitle, films }: CardOptions): Promise<Blob> {
  if (films.length === 0) throw new Error("Nothing to draw");

  const f = await faces();
  const c = palette();

  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  ctx.scale(S, S); // draw in layout units; everything lands at 2x
  ctx.textBaseline = "alphabetic";

  const display = (px: number) => `400 ${px}px ${f.display}`;
  const serif = (px: number, w = 700) => `${w} ${px}px ${f.serif}`;
  const sans = (px: number, w = 500) => `${w} ${px}px ${f.sans}`;

  // The hero is fetched first and alone: its colour decides the card's accent,
  // and every rule below is drawn in it.
  const hero = films[0];
  const heroImg = await loadPoster(hero.poster);
  const accent = accentFrom(heroImg, c.gold);

  ctx.fillStyle = c.bg;
  ctx.fillRect(0, 0, W, H);

  // ── Header: the wordmark and its five bars ───────────────────────────────
  ctx.fillStyle = c.gold;
  ctx.font = display(24);
  ctx.letterSpacing = "3px";
  ctx.fillText("RANKD", PAD, 54);
  ctx.letterSpacing = "0px";
  BARS.forEach((colour, i) => {
    ctx.fillStyle = colour;
    roundRect(ctx, PAD + i * 21, 62, 17, 3, 1.5);
    ctx.fill();
  });

  // ── Who this is about ────────────────────────────────────────────────────
  const nameMax = W - PAD * 2;
  fitText(ctx, title.toUpperCase(), nameMax, display, 52, 26);
  ctx.fillStyle = c.text;
  ctx.fillText(title.toUpperCase(), PAD, 112);

  ctx.font = sans(10, 700);
  ctx.letterSpacing = "1.5px";
  ctx.fillStyle = c.dim;
  ctx.fillText(
    [subtitle?.toUpperCase(), `${films.length} FILMS RANKED`].filter(Boolean).join("  ·  "),
    PAD,
    132,
  );
  ctx.letterSpacing = "0px";

  // ── The hero: #1, at the size a #1 deserves ──────────────────────────────
  const heroTop = 152;
  const heroW = 132;
  const heroH = Math.round(heroW * 1.5);
  if (heroImg) {
    ctx.save();
    roundRect(ctx, PAD, heroTop, heroW, heroH, 6);
    ctx.clip();
    ctx.drawImage(heroImg, PAD, heroTop, heroW, heroH);
    ctx.restore();
  } else {
    ctx.fillStyle = c.surface;
    roundRect(ctx, PAD, heroTop, heroW, heroH, 6);
    ctx.fill();
  }
  // The poster's own colour, returned to it as a ring.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  roundRect(ctx, PAD - 1, heroTop - 1, heroW + 2, heroH + 2, 7);
  ctx.stroke();

  const colX = PAD + heroW + 22;
  const colW = W - colX - PAD;

  // The numeral, oversized — the one Wrapped move that a ranking has more claim
  // to than a listening stat does.
  //
  // In the DISPLAY face, not the serif one. Source Serif's "1" is a bracketed,
  // small-flagged Times-ish shape: fine at 19px in a list row, genuinely ugly
  // blown up to 100px, where the base serif reads as a stray horizontal bar.
  // Bebas is a condensed display face — it is what the wordmark is set in, and
  // it is drawn to be enormous.
  ctx.fillStyle = c.gold;
  ctx.font = display(116);
  ctx.fillText("1", colX, heroTop + 92);

  // Wrapped rather than shrunk: a long title should stay the size of a #1 and
  // take two lines, not shrink until it reads like row four.
  ctx.fillStyle = c.text;
  ctx.font = serif(20, 600);
  const heroLines = wrap(ctx, hero.title, colW, 2);
  heroLines.forEach((line, i) => ctx.fillText(line, colX, heroTop + 126 + i * 24));

  ctx.font = sans(10.5, 600);
  ctx.fillStyle = c.dim;
  ctx.letterSpacing = "0.8px";
  ctx.fillText(noteFor(hero), colX, heroTop + 132 + heroLines.length * 24);
  ctx.letterSpacing = "0px";

  // ── The rest, tighter ────────────────────────────────────────────────────
  const listTop = heroTop + heroH + 34;
  const footerTop = H - 72;
  const rest = films.slice(1);

  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, listTop - 20);
  ctx.lineTo(W - PAD, listTop - 20);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Rows breathe when there are few of them and tighten when there are many, so
  // a three-film ranking doesn't leave a third of the card empty and a twenty-
  // film one still fits. The cap is what a row can be before it looks like a
  // second hero.
  const ROW_MIN = 38;
  const ROW_MAX = 56;
  const TAIL = 22; // the "+ n more" line, when there is one
  // Reserved BEFORE the rows are measured, not after. Taking it out afterwards
  // let the last row run under the tail — nine rows filled the space exactly and
  // "+ 9 more" was drawn straight through Insomnia.
  const full = footerTop - listTop;
  const fitsUncapped = Math.max(1, Math.floor(full / ROW_MIN));
  const overflows = rest.length > fitsUncapped;
  const room = full - (overflows ? TAIL : 0);
  const fits = Math.max(1, Math.floor(room / ROW_MIN));
  const shown = rest.slice(0, Math.min(rest.length, fits));
  const rowH = shown.length ? Math.min(ROW_MAX, room / shown.length) : ROW_MIN;
  const listBottom = listTop + shown.length * rowH;

  const posters = await Promise.all(shown.map((film) => loadPoster(film.poster)));

  shown.forEach((film, i) => {
    const y = listTop + i * rowH;
    const ph = Math.min(rowH - 8, 34);
    const pw = Math.round(ph / 1.5);
    const mid = y + rowH / 2 - 5;

    ctx.fillStyle = c.dim;
    ctx.font = serif(19, 600);
    ctx.textAlign = "right";
    ctx.fillText(String(i + 2), PAD + 20, mid + 6);
    ctx.textAlign = "left";

    const px = PAD + 32;
    const img = posters[i];
    if (img) {
      ctx.save();
      roundRect(ctx, px, y + (rowH - ph) / 2 - 5, pw, ph, 3);
      ctx.clip();
      ctx.drawImage(img, px, y + (rowH - ph) / 2 - 5, pw, ph);
      ctx.restore();
    } else {
      ctx.fillStyle = c.surface;
      roundRect(ctx, px, y + (rowH - ph) / 2 - 5, pw, ph, 3);
      ctx.fill();
    }

    const tx = px + pw + 14;
    const tw = W - tx - PAD;
    ctx.fillStyle = c.text;
    ctx.font = sans(15, 600);
    ctx.fillText(ellipsis(ctx, film.title, tw), tx, mid + 1);

    ctx.fillStyle = c.dim;
    ctx.font = sans(10.5, 500);
    ctx.fillText(ellipsis(ctx, noteFor(film), tw), tx, mid + 16);
  });

  const missed = rest.length - shown.length;
  if (missed > 0) {
    ctx.fillStyle = c.dim;
    ctx.font = sans(11, 600);
    ctx.fillText(`+ ${missed} more`, PAD + 32, listBottom + 12);
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.45;
  ctx.beginPath();
  ctx.moveTo(PAD, footerTop);
  ctx.lineTo(W - PAD, footerTop);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = c.text;
  ctx.font = sans(11.5, 700);
  ctx.fillText("Ranked head-to-head on Rankd", PAD, footerTop + 24);

  ctx.fillStyle = c.dim;
  ctx.font = sans(10.5, 500);
  ctx.fillText(
    new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }),
    PAD,
    footerTop + 42,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the card"))),
      "image/jpeg",
      0.92,
    );
  });
}

/**
 * Hand the card to the user.
 *
 * The share sheet first, when the platform has one: on a phone this is the
 * difference between "the picture is now in your camera roll somewhere" and
 * "the picture is in the message you were about to send". Falls back to a
 * download everywhere else.
 */
export async function shareCard(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/jpeg" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch {
      // Dismissing the share sheet lands here, and so does a platform that
      // claimed it could share and then would not. Falling through to the
      // download would drop a file on someone who just cancelled, so: nothing.
      return "shared";
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoked on the next tick rather than immediately — Safari has not started
  // reading the blob by the time click() returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}

/** A filename that says what it is: `rankd-michael-mann.jpg`. */
export const cardFilename = (title: string): string =>
  `rankd-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ranking"}.jpg`;
