"use client";

// CLASSIC — the premium one. Clean, dark, gold, serif. A business card.
//
// ── The layout, and the dead space that drove it ───────────────────────────
//
// The first version was a tall 4:5 card: hero poster top-left, the also-rans
// stacked underneath it. That left a column of empty background to the right of
// the winner and made the whole thing a receipt — one long column you read top
// to bottom.
//
// Turning it landscape fixes both at once. The hero and its numeral own the
// left; the rest of the ranking moves into the space beside it, so the card is
// read across rather than down and nothing is wasted. Underneath the hero,
// where there is now room, goes the one thing that makes a ranking worth
// posting: a claim about the person who made it (see lib/insight.ts).
//
// ── What it takes from Wrapped, and what it refuses ────────────────────────
//
//  · SHAPED FOR WHERE IT IS POSTED. Wrapped's slides are 9:16 because they are
//    a full-screen story you swipe. This is one image in a feed, so it is a
//    rectangle: 1920x1080, which Twitter renders whole and Instagram accepts
//    without cropping.
//  · THE NUMERAL IS THE PICTURE. Wrapped 2024 built its whole system on
//    oversized numbers, and a ranking has a better claim on that than a
//    listening stat: the answer to "rank these" is a #1.
//  · COLOUR COMES FROM THE ARTWORK, but as an accent, not a wash — two
//    hairlines and the hero's ring. No gradients. This app is dark, gold and
//    serif, closer to Wrapped 2025's restraint than 2024's maximalism.
//  · THE PORTRAIT COMPLEMENTS, NEVER COMPETES. A director's face is a small
//    circle beside their name, the size of an artist thumbnail in a streaming
//    app. The big image stays the winning film, because the card is about the
//    ranking. Genre and tier cards simply have no circle.

import { BARS } from "../brand";
import { starsFor } from "../tiers";
import { drawCircleImage, drawCover, ellipsis, fitText, roundRect, wrap } from "./canvas";
import type { CardData, CardEntry, Faces, Kit, Renderer } from "./types";

const W = 960;
const H = 540;
const PAD = 44;

// The vertical budget, stated once because four things compete for 540 units
// and the first attempt let the stat strip draw straight through the list:
//   160  hero + list start (level, so the two columns share a top edge)
//   367  hero bottom
//   396  insight, up to two lines
//   426  hairline above the stats
//   452  stat labels, 482 their values
//   496  footer rule, 520 the footer line
// Anything that grows has to take its room from something named here.
const PORTRAIT_R = 30;
const HERO_X = PAD;
const HERO_TOP = 160;
const HERO_W = 138;
const HERO_H = Math.round(HERO_W * 1.5);

const LEFT_RIGHT = HERO_X + HERO_W + 22; // the numeral / hero title column
const LEFT_END = 420;

// The list is a defined block, not a column of text floating in the space left
// over.
//
// It first ran from above the hero's top to well below its bottom, against a
// left column that stopped two-thirds of the way down — so the two halves
// shared no edges and the card read as two unrelated things side by side. Now
// the rows START level with the hero and the whole block is fenced by a
// vertical hairline, which is what makes the right-hand side look placed rather
// than left over.
const RULE_X = 442;
const COL_X = RULE_X + 30;
const COL_W = W - COL_X - PAD;

const ROW_TOP = HERO_TOP;
const ROW_H = 29;
const MAX_ROWS = 9; // 2..10 — a top ten, which is what a shared list should be

const STAT_TOP = 452; // the strip both other designs earned their keep with
const FOOTER_TOP = 496;

const rowsOf = (rest: readonly CardEntry[]) => rest.slice(0, MAX_ROWS);

/** What a row says under its title. Guests earn their own line — the fact that
 *  you ranked films you haven't seen is the most interesting thing on the card. */
const noteFor = (f: CardEntry) =>
  f.guest
    ? `${f.year ?? ""}${f.year ? " · " : ""}NOT SEEN`
    : [f.year, f.rating === undefined ? "" : starsFor(f.rating)].filter(Boolean).join(" · ");

export const classic: Renderer = {
  size: { w: W, h: H, scale: 2, pad: PAD },

  fonts: (f: Faces) => [
    `400 100px ${f.display}`,
    `400 52px ${f.display}`,
    `400 22px ${f.display}`,
    `600 22px ${f.serif}`,
    `600 19px ${f.serif}`,
    `600 15px ${f.sans}`,
    `500 12px ${f.sans}`,
    `700 11px ${f.sans}`,
  ],

  images: (d: CardData) => [
    d.entries[0]?.poster,
    d.portrait,
    ...rowsOf(d.entries.slice(1)).map((e) => e.poster),
  ],

  draw(ctx, d, kit: Kit) {
    const c = kit.palette;
    const f = kit.faces;
    const accent = kit.accent;
    const img = (url: string | undefined) => (url ? kit.images.get(url) ?? null : null);

    const display = (px: number) => `400 ${px}px ${f.display}`;
    const serif = (px: number, w = 600) => `${w} ${px}px ${f.serif}`;
    const sans = (px: number, w = 500) => `${w} ${px}px ${f.sans}`;

    const hero = d.entries[0];
    const heroImg = img(hero?.poster);

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    // ── Header ─────────────────────────────────────────────────────────────
    ctx.fillStyle = c.gold;
    ctx.font = display(22);
    ctx.letterSpacing = "3px";
    ctx.fillText("RANKD", PAD, 50);
    ctx.letterSpacing = "0px";
    BARS.forEach((colour, i) => {
      ctx.fillStyle = colour;
      roundRect(ctx, PAD + i * 20, 58, 16, 3, 1.5);
      ctx.fill();
    });

    // ── Who this is about ──────────────────────────────────────────────────
    //
    // The portrait sits at the head of the name, at thumbnail size. A genre or
    // tier card has no face, so the name simply starts at the margin — one
    // layout, one optional element, rather than two designs.
    const hasFace = !!d.portrait;
    const nameX = hasFace ? PAD + PORTRAIT_R * 2 + 16 : PAD;
    if (hasFace) {
      drawCircleImage(ctx, img(d.portrait), PAD + PORTRAIT_R, 112, PORTRAIT_R, c.surface);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(PAD + PORTRAIT_R, 112, PORTRAIT_R, 0, Math.PI * 2);
      ctx.stroke();
    }

    fitText(ctx, d.title.toUpperCase(), LEFT_END - nameX + 120, display, 52, 26);
    ctx.fillStyle = c.text;
    ctx.fillText(d.title.toUpperCase(), nameX, 118);

    ctx.font = sans(11, 700);
    ctx.letterSpacing = "1.5px";
    ctx.fillStyle = c.dim;
    ctx.fillText(
      [d.eyebrow.toUpperCase(), `${d.entries.length} FILMS RANKED`].join("  ·  "),
      nameX,
      138,
    );
    ctx.letterSpacing = "0px";

    // ── The hero, and its numeral ──────────────────────────────────────────
    if (heroImg) {
      ctx.save();
      roundRect(ctx, HERO_X, HERO_TOP, HERO_W, HERO_H, 7);
      ctx.clip();
      drawCover(ctx, heroImg, HERO_X, HERO_TOP, HERO_W, HERO_H);
      ctx.restore();
    } else {
      ctx.fillStyle = c.surface;
      roundRect(ctx, HERO_X, HERO_TOP, HERO_W, HERO_H, 7);
      ctx.fill();
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    roundRect(ctx, HERO_X - 1, HERO_TOP - 1, HERO_W + 2, HERO_H + 2, 8);
    ctx.stroke();

    // In the DISPLAY face, never the serif one. Source Serif's "1" is a
    // bracketed, small-flagged shape: fine at 19px in a list row, ugly at 100,
    // where its base serif reads as a stray horizontal bar.
    // Optically aligned, not merely positioned at the same x as the title.
    //
    // Bebas's "1" carries a wide left side bearing: drawn from the same origin
    // as "Inception" below it, its visible stroke landed ~23 units further
    // right, so the numeral read as indented and the whole block looked off.
    // `actualBoundingBoxLeft` is the distance from the origin to the ink, so
    // subtracting it puts the STROKE on the margin rather than the glyph box.
    ctx.fillStyle = c.gold;
    ctx.font = display(100);
    const one = ctx.measureText("1");
    ctx.fillText("1", LEFT_RIGHT + one.actualBoundingBoxLeft, HERO_TOP + 82);

    ctx.fillStyle = c.text;
    ctx.font = serif(22);
    const heroLines = hero ? wrap(ctx, hero.title, LEFT_END - LEFT_RIGHT, 3) : [];
    heroLines.forEach((line, i) => ctx.fillText(line, LEFT_RIGHT, HERO_TOP + 116 + i * 25));

    if (hero) {
      ctx.font = sans(11, 600);
      ctx.fillStyle = c.dim;
      ctx.letterSpacing = "0.8px";
      ctx.fillText(noteFor(hero), LEFT_RIGHT, HERO_TOP + 124 + heroLines.length * 25);
      ctx.letterSpacing = "0px";
    }

    // ── The insight, in the room the landscape shape freed up ──────────────
    if (d.insight) {
      ctx.fillStyle = c.text;
      ctx.font = serif(17, 600);
      // Two lines is the hard ceiling — a third would reach the stat hairline.
      wrap(ctx, d.insight, LEFT_END - PAD, 2).forEach((line, i) =>
        ctx.fillText(line, PAD, HERO_TOP + HERO_H + 29 + i * 21),
      );
    }

    // ── The stat strip ─────────────────────────────────────────────────────
    //
    // Lifted from Wrapped and Collector, where it turned out to be the part
    // worth keeping. It also does a structural job here: it gives the bottom of
    // the card an edge that runs the full width, tying the two columns together
    // instead of leaving the left one to trail off into empty background.
    const stats: [string, string][] = [["FILMS", String(d.stats.films)]];
    if (d.stats.avgRating !== undefined) stats.push(["AVG", `${d.stats.avgRating.toFixed(1)}★`]);
    if (d.stats.topGenre) stats.push(["GENRE", d.stats.topGenre]);
    if (d.stats.topDecade) stats.push(["DECADE", d.stats.topDecade]);

    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, STAT_TOP - 26);
    ctx.lineTo(W - PAD, STAT_TOP - 26);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const statW = (W - PAD * 2) / stats.length;
    stats.forEach(([label, value], i) => {
      const x = PAD + i * statW;
      ctx.fillStyle = c.dim;
      ctx.font = sans(10, 700);
      ctx.letterSpacing = "1.8px";
      ctx.fillText(label, x, STAT_TOP);
      ctx.letterSpacing = "0px";
      ctx.fillStyle = c.text;
      ctx.font = display(30);
      ctx.fillText(ellipsis(ctx, value, statW - 14), x, STAT_TOP + 30);
    });

    // ── The rest of the ranking, beside the hero rather than beneath it ────
    const rows = rowsOf(d.entries.slice(1));

    // The fence. Full height of the list block, so the two columns read as two
    // panels of one card rather than two things that happen to be adjacent.
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(RULE_X, ROW_TOP - 12);
    ctx.lineTo(RULE_X, ROW_TOP + rows.length * ROW_H + 4);
    ctx.stroke();
    ctx.globalAlpha = 1;

    rows.forEach((film, i) => {
      const y = ROW_TOP + i * ROW_H;
      const ph = 27;
      const pw = 18;
      const mid = y + ROW_H / 2;

      ctx.fillStyle = c.dim;
      ctx.font = serif(19);
      ctx.textAlign = "right";
      ctx.fillText(String(i + 2), COL_X + 18, mid + 5);
      ctx.textAlign = "left";

      const px = COL_X + 30;
      const rowImg = img(film.poster);
      if (rowImg) {
        ctx.save();
        roundRect(ctx, px, mid - ph / 2, pw, ph, 3);
        ctx.clip();
        drawCover(ctx, rowImg, px, mid - ph / 2, pw, ph);
        ctx.restore();
      } else {
        ctx.fillStyle = c.surface;
        roundRect(ctx, px, mid - ph / 2, pw, ph, 3);
        ctx.fill();
      }

      const tx = px + pw + 12;
      const tw = COL_X + COL_W - tx;
      ctx.fillStyle = c.text;
      ctx.font = sans(15, 600);
      ctx.fillText(ellipsis(ctx, film.title, tw), tx, mid - 1);

      ctx.fillStyle = c.dim;
      ctx.font = sans(11, 500);
      ctx.fillText(ellipsis(ctx, noteFor(film), tw), tx, mid + 13);
    });

    // No "+ n more" line here, though the earlier 4:5 card had one. The eyebrow
    // already says "19 FILMS RANKED" two inches above, so the tail restated a
    // number the card had made, and a tenth row plus a tail is exactly the
    // height that collided with the footer rule.

    // ── Footer ─────────────────────────────────────────────────────────────
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD, FOOTER_TOP);
    ctx.lineTo(W - PAD, FOOTER_TOP);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = c.text;
    ctx.font = sans(12, 700);
    ctx.fillText("Ranked head-to-head on Rankd", PAD, FOOTER_TOP + 24);

    ctx.fillStyle = c.dim;
    ctx.font = sans(12, 500);
    ctx.textAlign = "right";
    ctx.fillText(d.dateLabel, W - PAD, FOOTER_TOP + 24);
    ctx.textAlign = "left";
  },
};
