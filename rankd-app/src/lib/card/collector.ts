"use client";

// COLLECTOR — the quiet one. A trading card, and almost no words.
//
// ── What restraint is for here ─────────────────────────────────────────────
//
// The other two designs argue: Classic lays the ranking out, Wrapped shouts a
// finding. This one asserts. It says that the ranking exists, whose it is, and
// four small numbers about it, and then stops. Nothing is explained.
//
// That is the whole design brief, so the discipline is in what is REFUSED: no
// insight line, no "+ 12 more", no footer sentence, no list beyond a top three
// set small enough to read as provenance rather than content. Every one of those
// was tempting and every one would make it a worse version of Classic.
//
// The trading-card feel comes from three things and no more: a hairline frame
// inset from the edge, a lot of unused space, and the artwork centred rather
// than aligned left like everything else in the app. The frame is drawn in the
// poster's own colour, which is the only thing that varies between two of these
// cards side by side — which is exactly what makes a set of them feel collected.

import { drawCircleImage, drawCover, ellipsis, fitText, roundRect } from "./canvas";
import type { CardData, Faces, Kit, Renderer } from "./types";

const W = 960;
const H = 540;
const PAD = 44;

const FRAME = 22; // how far the hairline sits inside the edge

// Sized to nearly fill the frame's height rather than float in the middle of
// it. Restraint is the brief, but the first version confused restraint with
// emptiness: a small poster centred in a wide card left a band of dead space
// above and below it, and the right-hand column bunched its three lines up near
// the title and then stopped. Bigger artwork, and content distributed down the
// same span the artwork occupies, keeps the quiet without the vacancy.
const HERO_W = 208;
const HERO_H = Math.round(HERO_W * 1.5);
const HERO_Y = Math.round((H - HERO_H) / 2);
const STAT_Y = 426; // labels; values sit 30 below

export const collector: Renderer = {
  size: { w: W, h: H, scale: 2, pad: PAD },

  fonts: (f: Faces) => [
    `400 56px ${f.display}`,
    `400 30px ${f.display}`,
    `400 18px ${f.display}`,
    `600 15px ${f.serif}`,
    `700 10px ${f.sans}`,
    `500 12px ${f.sans}`,
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

    // The frame — the one thing that makes this read as a card object rather
    // than a screenshot. Drawn in the film's colour, faintly.
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    roundRect(ctx, FRAME, FRAME, W - FRAME * 2, H - FRAME * 2, 10);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Corner ticks, the way a printed card has crop marks. Four short strokes;
    // they cost nothing and they are most of the "object" feeling.
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2;
    const tick = 16;
    ([
      [FRAME, FRAME, 1, 1],
      [W - FRAME, FRAME, -1, 1],
      [FRAME, H - FRAME, 1, -1],
      [W - FRAME, H - FRAME, -1, -1],
    ] as const).forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * tick, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * tick);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // ── The artwork, centred ───────────────────────────────────────────────
    const heroX = PAD + 46;
    const heroY = HERO_Y;
    const heroImg = img(d.entries[0]?.poster);
    if (heroImg) {
      ctx.save();
      roundRect(ctx, heroX, heroY, HERO_W, HERO_H, 5);
      ctx.clip();
      drawCover(ctx, heroImg, heroX, heroY, HERO_W, HERO_H);
      ctx.restore();
    } else {
      ctx.fillStyle = c.surface;
      roundRect(ctx, heroX, heroY, HERO_W, HERO_H, 5);
      ctx.fill();
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    roundRect(ctx, heroX - 0.5, heroY - 0.5, HERO_W + 1, HERO_H + 1, 5.5);
    ctx.stroke();

    // ── Whose, and of what ─────────────────────────────────────────────────
    const tx = heroX + HERO_W + 54;
    const tw = W - tx - PAD - FRAME;

    if (d.portrait) {
      drawCircleImage(ctx, img(d.portrait), tx + 24, heroY + 16, 24, c.surface);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tx + 24, heroY + 16, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // The eyebrow needs real clearance, not a nominal gap. Bebas at 56px has a
    // cap height of ~41, so a 26px offset put the label inside the name's
    // ascenders and "DIRECTOR" was printed through "CHRISTOPHER NOLAN".
    const titleY = heroY + (d.portrait ? 104 : 74);
    ctx.fillStyle = c.dim;
    ctx.font = sans(10, 700);
    ctx.letterSpacing = "2.4px";
    // …and the portrait needs the same clearance from the eyebrow that the
    // eyebrow needs from the name: a 24px circle centred 24 below the artwork's
    // top reached the label's cap line.
    ctx.fillText(d.eyebrow.toUpperCase(), tx, titleY - 46);
    ctx.letterSpacing = "0px";

    fitText(ctx, d.title.toUpperCase(), tw, display, 56, 26);
    ctx.fillStyle = c.text;
    ctx.fillText(d.title.toUpperCase(), tx, titleY);

    // Provenance, not content: three titles, small, no posters, no numbers
    // beyond their rank. Enough to prove what this is a ranking OF.
    const podium = d.entries.slice(0, 3);
    ctx.font = serif(15);
    podium.forEach((film, i) => {
      // Spread down the poster's span rather than bunched under the name — the
      // right-hand column should read as the same height as the artwork, which
      // is most of what makes it feel like a card face.
      const y = titleY + 56 + i * 40;
      ctx.fillStyle = i === 0 ? accent : c.dim;
      ctx.font = display(18);
      ctx.fillText(String(i + 1), tx, y);
      ctx.fillStyle = i === 0 ? c.text : c.dim;
      ctx.font = serif(15);
      ctx.fillText(ellipsis(ctx, film.title, tw - 26), tx + 22, y);
    });

    // ── Four numbers, and no sentence ──────────────────────────────────────
    const stats: [string, string][] = [["FILMS", String(d.stats.films)]];
    if (d.stats.avgRating !== undefined) stats.push(["AVG", `${d.stats.avgRating.toFixed(1)}★`]);
    if (d.stats.topGenre) stats.push(["GENRE", d.stats.topGenre]);
    if (d.stats.topDecade) stats.push(["DECADE", d.stats.topDecade]);

    const sy = STAT_Y;
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx, sy - 26);
    ctx.lineTo(W - PAD - FRAME + 22, sy - 26);
    ctx.stroke();

    const colW = tw / stats.length;
    stats.forEach(([label, value], i) => {
      const x = tx + i * colW;
      ctx.fillStyle = c.dim;
      ctx.font = sans(10, 700);
      ctx.letterSpacing = "1.6px";
      ctx.fillText(label, x, sy);
      ctx.letterSpacing = "0px";
      ctx.fillStyle = c.text;
      ctx.font = display(30);
      ctx.fillText(ellipsis(ctx, value, colW - 10), x, sy + 30);
    });

    // The wordmark, small, bottom-left — a maker's mark rather than a header.
    ctx.fillStyle = c.gold;
    ctx.font = display(18);
    ctx.letterSpacing = "3px";
    ctx.fillText("RANKD", heroX, H - FRAME - 26);
    ctx.letterSpacing = "0px";
  },
};
