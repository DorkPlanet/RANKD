"use client";

// CLASSIC — the dossier. The one you post when the RANKING is the point.
//
// ── What it is for ─────────────────────────────────────────────────────────
//
// Of the three, this is the card that answers "what did you actually do". It is
// the only one that shows the ranking as a list, the only one that plots
// anything, and the only one that carries a byline, a date and a copyright mark.
// Marquee makes a claim about you; Paul Allen asserts that a ranking exists;
// this one hands over the evidence.
//
// The three are separated by INFORMATION DENSITY rather than by decoration, and
// that is what makes them a set rather than three skins. If this card ever loses
// its charts it becomes a taller Paul Allen and there is no reason for both.
//
// ── The charts, which are the reason it was rebuilt ────────────────────────
//
// The old landscape card had room for a ranking and nothing else. Nine-sixteen
// is 3.5x the vertical space at the same width, and the honest use of that is
// not a longer list — a top twenty is not more interesting than a top eight — it
// is a second KIND of information. So: a taste radar, genre bars and a decade
// ring, sitting between the hero and the list.
//
// Each one withholds itself when the data cannot support it (see `chartsFor` in
// data.ts), and the grid closes up around whatever is missing. A filmography
// card genuinely has no taste radar, because nineteen films by one director
// share two genres and a radar over that is a flat circle pretending to be an
// insight.
//
// ── The safe area ──────────────────────────────────────────────────────────
//
// Everything above lives inside the centred 4:5 region. The bleed carries the
// brand bars at the top and the footer line at the bottom, so a feed crop takes
// decoration and leaves every chart, every row and the byline. See frame.ts.

import { BARS } from "../brand";
import { axisLabel } from "../taste";
import { starsFor } from "../tiers";
import { bars, donut, radar } from "./charts";
import { drawCircleImage, drawCover, ellipsis, fitText, roundRect, wrap } from "./canvas";
import { CONTENT_W, H, LEFT, PAD, RIGHT, SAFE_BOT, SAFE_TOP, SCALE, W } from "./frame";
import type { CardData, CardEntry, Faces, Kit, Renderer } from "./types";

const PORTRAIT_R = 26;

// ── The vertical budget ────────────────────────────────────────────────────
//
// Stated once, because six blocks compete for the 675 units of safe area and the
// failure mode is silent: a block that grows simply draws through the one below
// it. Anything that needs more room takes it from something named here.
const MAST_Y = SAFE_TOP + 24; // the wordmark / byline line
const NAME_Y = SAFE_TOP + 78; // the subject, baseline
const EYEBROW_Y = NAME_Y + 20;

const HERO_TOP = SAFE_TOP + 108;
const HERO_W = 104;
const HERO_H = Math.round(HERO_W * 1.5); // 156

const CHART_TOP = HERO_TOP + HERO_H + 34; // 440
const CHART_H = 116;

const LIST_TOP = CHART_TOP + CHART_H + 30; // 586
const ROW_H = 26;
const MAX_ROWS = 6;

const STAT_Y = SAFE_BOT - 34; // labels; values sit 26 below

const rowsOf = (rest: readonly CardEntry[]) => rest.slice(0, MAX_ROWS);

/** What a row says under its title. A guest earns its own line — that you ranked
 *  films you have not seen is the most interesting thing on the card. */
const noteFor = (f: CardEntry) =>
  f.guest
    ? `${f.year ?? ""}${f.year ? " · " : ""}NOT SEEN`
    : [f.year, f.rating === undefined ? "" : starsFor(f.rating)].filter(Boolean).join(" · ");

export const classic: Renderer = {
  size: { w: W, h: H, scale: SCALE, pad: PAD },

  fonts: (f: Faces) => [
    `400 62px ${f.display}`,
    `400 40px ${f.display}`,
    `400 22px ${f.display}`,
    `400 18px ${f.display}`,
    `400 15px ${f.display}`,
    `600 17px ${f.serif}`,
    `600 14px ${f.serif}`,
    `600 12px ${f.sans}`,
    `500 10px ${f.sans}`,
    `700 9px ${f.sans}`,
    `700 8px ${f.sans}`,
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

    const tracked = (px: number, weight: number, space: string, fill: string) => {
      ctx.font = sans(px, weight);
      ctx.letterSpacing = space;
      ctx.fillStyle = fill;
    };
    const untrack = () => (ctx.letterSpacing = "0px");

    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    // ── Bleed, top ─────────────────────────────────────────────────────────
    //
    // The brand bars, wide and thin, sitting in the strip a feed crop discards.
    // They are the most disposable thing on the card and the most atmospheric,
    // which is exactly what the bleed is for.
    const barW = Math.round(CONTENT_W / BARS.length) - 6;
    BARS.forEach((colour, i) => {
      ctx.fillStyle = colour;
      roundRect(ctx, LEFT + i * (barW + 6), SAFE_TOP - 40, barW, 3, 1.5);
      ctx.fill();
    });

    // ── Masthead ───────────────────────────────────────────────────────────
    ctx.fillStyle = c.gold;
    ctx.font = display(22);
    ctx.letterSpacing = "3px";
    ctx.fillText("RANKD", LEFT, MAST_Y);
    untrack();

    // The byline. Absent for a reader who has not claimed a handle, and then the
    // masthead is simply the wordmark rather than a wordmark with a gap.
    if (d.handle) {
      tracked(9, 700, "1.4px", c.dim);
      ctx.textAlign = "right";
      ctx.fillText(`@${d.handle.toUpperCase()}`, RIGHT, MAST_Y);
      ctx.textAlign = "left";
      untrack();
    }

    // ── Who this is about ──────────────────────────────────────────────────
    const hasFace = !!d.portrait;
    const nameX = hasFace ? LEFT + PORTRAIT_R * 2 + 12 : LEFT;
    if (hasFace) {
      drawCircleImage(ctx, img(d.portrait), LEFT + PORTRAIT_R, NAME_Y - 12, PORTRAIT_R, c.surface);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(LEFT + PORTRAIT_R, NAME_Y - 12, PORTRAIT_R, 0, Math.PI * 2);
      ctx.stroke();
    }

    fitText(ctx, d.title.toUpperCase(), RIGHT - nameX, display, 40, 20);
    ctx.fillStyle = c.text;
    ctx.fillText(d.title.toUpperCase(), nameX, NAME_Y);

    tracked(9, 700, "1.5px", c.dim);
    ctx.fillText(
      [d.eyebrow.toUpperCase(), `${d.entries.length} FILMS RANKED`].join("  ·  "),
      nameX,
      EYEBROW_Y,
    );
    untrack();

    // ── The hero, and its numeral ──────────────────────────────────────────
    //
    // Smaller than the landscape card's, and that is the trade the charts are
    // paid for with. It shares its band rather than owning a column: poster on
    // the left, the numeral and the title beside it, the insight underneath.
    const hero = d.entries[0];
    const heroImg = img(hero?.poster);
    if (heroImg) {
      ctx.save();
      roundRect(ctx, LEFT, HERO_TOP, HERO_W, HERO_H, 6);
      ctx.clip();
      drawCover(ctx, heroImg, LEFT, HERO_TOP, HERO_W, HERO_H);
      ctx.restore();
    } else {
      ctx.fillStyle = c.surface;
      roundRect(ctx, LEFT, HERO_TOP, HERO_W, HERO_H, 6);
      ctx.fill();
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    roundRect(ctx, LEFT - 1, HERO_TOP - 1, HERO_W + 2, HERO_H + 2, 7);
    ctx.stroke();

    const heroX = LEFT + HERO_W + 18;
    const heroW = RIGHT - heroX;

    // In the DISPLAY face, never the serif. Source Serif's "1" is a bracketed,
    // small-flagged shape: fine at 14px in a list row, ugly at 62 where its base
    // serif reads as a stray horizontal bar.
    //
    // Optically aligned rather than merely positioned. Bebas's "1" carries a wide
    // left side bearing, so drawn from the same origin as the title below it the
    // visible stroke lands well to the right and the block looks indented.
    // `actualBoundingBoxLeft` is origin-to-ink, so subtracting it puts the STROKE
    // on the margin.
    ctx.fillStyle = c.gold;
    ctx.font = display(62);
    ctx.fillText("1", heroX + ctx.measureText("1").actualBoundingBoxLeft, HERO_TOP + 50);

    ctx.fillStyle = c.text;
    ctx.font = serif(17);
    const heroLines = hero ? wrap(ctx, hero.title, heroW, 2) : [];
    heroLines.forEach((line, i) => ctx.fillText(line, heroX, HERO_TOP + 76 + i * 20));

    if (hero) {
      tracked(9, 600, "0.8px", c.dim);
      ctx.fillText(noteFor(hero), heroX, HERO_TOP + 84 + heroLines.length * 20);
      untrack();
    }

    if (d.insight) {
      ctx.fillStyle = c.text;
      ctx.font = serif(14);
      // Two lines is the ceiling; a third reaches the chart band.
      wrap(ctx, d.insight, heroW, 2).forEach((line, i) =>
        ctx.fillText(line, heroX, HERO_TOP + 122 + i * 18),
      );
    }

    // ── The charts ─────────────────────────────────────────────────────────
    //
    // Laid out as equal columns over whatever exists, so the row is balanced
    // whether it holds three charts or one. Nothing reserves space for a chart
    // that is not there — a gap where a radar would have been is worse than a
    // wider pair of bars.
    const charts = d.charts;
    const panels: ((x: number, w: number) => void)[] = [];

    if (charts?.taste && charts.taste.length >= 3) {
      panels.push((x, w) => {
        heading(ctx, "TASTE", x, CHART_TOP);
        radar(ctx, {
          cx: x + w / 2,
          cy: CHART_TOP + 62,
          r: 34,
          values: charts.taste!.map((t) => t.value),
          labels: charts.taste!.map((t) => t.label.toUpperCase()),
          grid: c.border,
          tone: c.gold,
          label: c.dim,
          labelFont: sans(7, 700),
        });
      });
    }

    if (charts?.genres && charts.genres.length >= 2) {
      panels.push((x, w) => {
        heading(ctx, "GENRES", x, CHART_TOP);
        bars(ctx, {
          x,
          y: CHART_TOP + 22,
          w,
          rows: charts.genres!.slice(0, 4),
          rowH: 20,
          tone: accent,
          track: c.border,
          label: c.dim,
          value: c.text,
          labelFont: sans(8, 700),
        });
      });
    }

    if (charts?.decades && charts.decades.length >= 2) {
      panels.push((x, w) => {
        heading(ctx, "DECADES", x, CHART_TOP);
        donut(ctx, {
          cx: x + w / 2,
          cy: CHART_TOP + 60,
          r: 30,
          thickness: 9,
          slices: charts.decades!,
          // The brand bars again, so a decade ring and a Marquee card drawn from
          // the same library are visibly the same product.
          tones: BARS,
          centre: {
            value: charts.decades![0].label,
            label: "MOST",
            valueFont: display(18),
            labelFont: sans(7, 700),
          },
          centreTone: c.text,
          centreLabel: c.dim,
        });
      });
    }

    if (panels.length) {
      const gap = 16;
      const colW = (CONTENT_W - gap * (panels.length - 1)) / panels.length;
      panels.forEach((drawPanel, i) => drawPanel(LEFT + i * (colW + gap), colW));
    }

    function heading(g: CanvasRenderingContext2D, text: string, x: number, y: number) {
      g.font = sans(8, 700);
      g.letterSpacing = "1.6px";
      g.fillStyle = c.dim;
      g.fillText(text, x, y);
      g.letterSpacing = "0px";
    }

    // ── The rest of the ranking ────────────────────────────────────────────
    const rows = rowsOf(d.entries.slice(1));
    if (rows.length) {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.3;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LEFT, LIST_TOP - 14);
      ctx.lineTo(RIGHT, LIST_TOP - 14);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    rows.forEach((film, i) => {
      const mid = LIST_TOP + i * ROW_H + ROW_H / 2;
      const ph = 22;
      const pw = 15;

      ctx.fillStyle = c.dim;
      ctx.font = serif(14);
      ctx.textAlign = "right";
      ctx.fillText(String(i + 2), LEFT + 14, mid + 4);
      ctx.textAlign = "left";

      const px = LEFT + 24;
      const rowImg = img(film.poster);
      if (rowImg) {
        ctx.save();
        roundRect(ctx, px, mid - ph / 2, pw, ph, 2);
        ctx.clip();
        drawCover(ctx, rowImg, px, mid - ph / 2, pw, ph);
        ctx.restore();
      } else {
        ctx.fillStyle = c.surface;
        roundRect(ctx, px, mid - ph / 2, pw, ph, 2);
        ctx.fill();
      }

      const tx = px + pw + 10;
      // The note is right-aligned and the title takes what is left, so a long
      // title shortens rather than colliding with the year.
      ctx.font = sans(9, 500);
      const note = noteFor(film);
      const noteW = note ? ctx.measureText(note).width : 0;

      ctx.fillStyle = c.text;
      ctx.font = sans(12, 600);
      ctx.fillText(ellipsis(ctx, film.title, RIGHT - tx - noteW - 12), tx, mid + 4);

      if (note) {
        ctx.fillStyle = c.dim;
        ctx.font = sans(9, 500);
        ctx.textAlign = "right";
        ctx.fillText(note, RIGHT, mid + 4);
        ctx.textAlign = "left";
      }
    });

    // ── The stat strip ─────────────────────────────────────────────────────
    const stats: [string, string][] = [["FILMS", String(d.stats.films)]];
    if (d.stats.avgRating !== undefined) stats.push(["AVG", `${d.stats.avgRating.toFixed(1)}★`]);
    // `axisLabel`, so "Science Fiction" becomes "Sci-Fi" rather than being
    // ellipsised to "SCIENCE FICTI…" — a truncated genre in a four-column strip
    // is the one stat that reliably fails to say what it is. Same map the taste
    // radar uses, so a card cannot name a genre two ways.
    if (d.stats.topGenre) stats.push(["GENRE", axisLabel(d.stats.topGenre)]);
    if (d.stats.topDecade) stats.push(["DECADE", d.stats.topDecade]);

    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LEFT, STAT_Y - 22);
    ctx.lineTo(RIGHT, STAT_Y - 22);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const statW = CONTENT_W / stats.length;
    stats.forEach(([label, value], i) => {
      const x = LEFT + i * statW;
      tracked(8, 700, "1.6px", c.dim);
      ctx.fillText(label, x, STAT_Y);
      untrack();
      ctx.fillStyle = c.text;
      ctx.font = display(22);
      ctx.fillText(ellipsis(ctx, value, statW - 10), x, STAT_Y + 26);
    });

    // ── Bleed, bottom ──────────────────────────────────────────────────────
    //
    // The provenance line, the date and the copyright mark, all below the safe
    // edge. A feed crop loses them and loses nothing a reader needed; a story
    // keeps them and the card is properly signed.
    ctx.fillStyle = c.text;
    ctx.font = sans(10, 700);
    ctx.fillText("Ranked head-to-head on Rankd", LEFT, SAFE_BOT + 34);

    ctx.fillStyle = c.dim;
    ctx.font = sans(10, 500);
    ctx.textAlign = "right";
    ctx.fillText(d.dateLabel, RIGHT, SAFE_BOT + 34);
    ctx.textAlign = "left";

    tracked(8, 500, "0.6px", c.dim);
    ctx.globalAlpha = 0.7;
    ctx.fillText("© Jarrad Bishop", LEFT, SAFE_BOT + 54);
    ctx.globalAlpha = 1;
    untrack();
  },
};
