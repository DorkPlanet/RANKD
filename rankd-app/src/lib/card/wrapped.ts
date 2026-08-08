"use client";

// WRAPPED — the loud one. Big type, bold colour, the finding first.
//
// ── What it borrows ────────────────────────────────────────────────────────
//
// Spotify Wrapped's actual trick is not the gradients everyone remembers; it is
// that a slide says ONE thing, enormously. The stat is the artwork. Everything
// else on the slide is support.
//
// So this card leads with the insight — the claim about you — set at a size no
// other card in the app uses, and demotes the ranking itself to three posters
// and a row of numbers. Classic answers "what did you rank"; this one answers
// "what does that say about you", which is the question people actually post.
//
// ── Where it departs ───────────────────────────────────────────────────────
//
// No gradient. The 2024 gradient era would look borrowed on a dark, gold, serif
// app, and the user ruled it out explicitly. The boldness comes instead from a
// solid block of the poster's own colour, filling the left third — which makes
// every card visibly different without inventing a palette, because the colour
// is the film's.
//
// Type on that block has to survive whatever colour a poster produces, so it is
// drawn in near-black rather than white: `accentFrom` floors its result at a
// lightness of 170, so the block is always light enough for dark text and never
// reliably dark enough for light text.

import { BARS } from "../brand";
import { drawCircleImage, drawCover, ellipsis, fitText, roundRect, wrap } from "./canvas";
import type { CardData, Faces, Kit, Renderer } from "./types";

const W = 960;
const H = 540;
const PAD = 44;

const BLOCK_W = 396; // the colour panel
const RIGHT_X = BLOCK_W + 46;
const RIGHT_W = W - RIGHT_X - PAD;

const INK = "#14100a"; // near-black, for type on the colour block

export const wrapped: Renderer = {
  size: { w: W, h: H, scale: 2, pad: PAD },

  fonts: (f: Faces) => [
    `400 130px ${f.display}`,
    `400 46px ${f.display}`,
    `400 34px ${f.display}`,
    `400 22px ${f.display}`,
    `600 20px ${f.serif}`,
    `700 13px ${f.sans}`,
    `600 12px ${f.sans}`,
    `500 11px ${f.sans}`,
  ],

  images: (d: CardData) => [
    d.entries[0]?.poster,
    d.portrait,
    d.entries[1]?.poster,
    d.entries[2]?.poster,
  ],

  draw(ctx, d, kit: Kit) {
    const c = kit.palette;
    const f = kit.faces;
    const accent = kit.accent;
    const img = (url: string | undefined) => (url ? kit.images.get(url) ?? null : null);

    const display = (px: number) => `400 ${px}px ${f.display}`;
    const serif = (px: number, w = 600) => `${w} ${px}px ${f.serif}`;
    const sans = (px: number, w = 500) => `${w} ${px}px ${f.sans}`;

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    // ── The colour block: the film's own colour, at full strength ──────────
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, BLOCK_W, H);

    ctx.fillStyle = INK;
    ctx.font = display(22);
    ctx.letterSpacing = "3px";
    ctx.fillText("RANKD", PAD, 52);
    ctx.letterSpacing = "0px";

    // The count, enormous — the Wrapped move, on the one number a ranking has.
    ctx.font = display(130);
    ctx.fillText(String(d.stats.films), PAD, 176);
    ctx.font = sans(13, 700);
    ctx.letterSpacing = "2px";
    ctx.fillText("FILMS RANKED", PAD, 200);
    ctx.letterSpacing = "0px";

    // Who, with the face inline at thumbnail size.
    const hasFace = !!d.portrait;
    if (hasFace) {
      drawCircleImage(ctx, img(d.portrait), PAD + 26, 250, 26, INK);
    }
    const nameX = hasFace ? PAD + 62 : PAD;
    fitText(ctx, d.title.toUpperCase(), BLOCK_W - nameX - 24, display, 46, 22);
    ctx.fillStyle = INK;
    ctx.fillText(d.title.toUpperCase(), nameX, 258);
    ctx.font = sans(11, 700);
    ctx.letterSpacing = "1.6px";
    ctx.globalAlpha = 0.72;
    ctx.fillText(d.eyebrow.toUpperCase(), nameX, 276);
    ctx.globalAlpha = 1;
    ctx.letterSpacing = "0px";

    // The finding, set as the headline it is.
    if (d.insight) {
      ctx.fillStyle = INK;
      ctx.font = serif(20);
      wrap(ctx, d.insight, BLOCK_W - PAD * 2, 4).forEach((line, i) =>
        ctx.fillText(line, PAD, 336 + i * 26),
      );
    }

    BARS.forEach((colour, i) => {
      ctx.fillStyle = colour;
      roundRect(ctx, PAD + i * 20, H - 58, 16, 3, 1.5);
      ctx.fill();
    });
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.62;
    ctx.font = sans(11, 600);
    ctx.fillText(d.dateLabel, PAD, H - 32);
    ctx.globalAlpha = 1;

    // ── The podium: three posters, and nothing else ────────────────────────
    ctx.fillStyle = c.dim;
    ctx.font = sans(11, 700);
    ctx.letterSpacing = "2px";
    ctx.fillText("THE TOP THREE", RIGHT_X, 62);
    ctx.letterSpacing = "0px";

    const top = d.entries.slice(0, 3);
    const gap = 18;
    const pw = Math.floor((RIGHT_W - gap * 2) / 3);
    const ph = Math.round(pw * 1.5);
    const py = 86;

    top.forEach((film, i) => {
      const x = RIGHT_X + i * (pw + gap);
      const poster = img(film.poster);
      if (poster) {
        ctx.save();
        roundRect(ctx, x, py, pw, ph, 6);
        ctx.clip();
        drawCover(ctx, poster, x, py, pw, ph);
        ctx.restore();
      } else {
        ctx.fillStyle = c.surface;
        roundRect(ctx, x, py, pw, ph, 6);
        ctx.fill();
      }
      if (i === 0) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.5;
        roundRect(ctx, x - 1.5, py - 1.5, pw + 3, ph + 3, 7);
        ctx.stroke();
      }

      // The numeral straddles the bottom edge of its poster, the way the
      // CLIMBING pill does on the duel screen — the app's own gesture.
      ctx.fillStyle = i === 0 ? accent : c.dim;
      ctx.font = display(34);
      ctx.fillText(String(i + 1), x, py + ph + 30);

      ctx.fillStyle = c.text;
      ctx.font = sans(12, 600);
      ctx.fillText(ellipsis(ctx, film.title, pw - 24), x + 22, py + ph + 28);
    });

    // ── The stat strip ─────────────────────────────────────────────────────
    const stats: [string, string][] = [];
    if (d.stats.avgRating !== undefined) stats.push(["AVERAGE", `${d.stats.avgRating.toFixed(1)}★`]);
    // "GENRE", not "FAVOURITE": it is computed over the whole ranking, borrowed
    // films included, so it describes the LIST rather than claiming a taste.
    if (d.stats.topGenre) stats.push(["GENRE", d.stats.topGenre]);
    if (d.stats.topDecade) stats.push(["DECADE", d.stats.topDecade]);

    if (stats.length) {
      const sy = H - 96;
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(RIGHT_X, sy - 28);
      ctx.lineTo(W - PAD, sy - 28);
      ctx.stroke();

      const colW = RIGHT_W / stats.length;
      stats.forEach(([label, value], i) => {
        const x = RIGHT_X + i * colW;
        ctx.fillStyle = c.dim;
        ctx.font = sans(11, 700);
        ctx.letterSpacing = "1.4px";
        ctx.fillText(label, x, sy);
        ctx.letterSpacing = "0px";
        ctx.fillStyle = accent;
        ctx.font = display(34);
        ctx.fillText(ellipsis(ctx, value, colW - 12), x, sy + 34);
      });
    }
  },
};
