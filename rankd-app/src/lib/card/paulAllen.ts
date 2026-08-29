"use client";

// PAUL ALLEN — the business card. Named for the card in American Psycho.
//
// ── The joke, and why it is now in bone rather than navy ───────────────────
//
// The scene is four men comparing objects that carry almost no information and
// losing their minds over the thickness of the stock and the tint of the paper.
// The old version made that joke in the app's navy, which meant it read as a
// quiet Rankd card rather than as a business card — the reference was in the
// crop marks and the restraint, and nowhere in the thing anybody actually
// notices first, which is the colour.
//
// So: BONE STOCK, DARK INK. Off-white ground, near-black serif, a hairline rule,
// and type set the way a name is set on a card rather than the way a heading is
// set on a screen. It is the only surface in Rankd that is not dark, and that is
// the point — it should look like an object that came from somewhere else.
//
// ── What restraint is for ──────────────────────────────────────────────────
//
// Classic hands over the evidence. Marquee makes the claim. This one ASSERTS:
// that a ranking exists, whose it is, what three films are at the top of it, and
// four numbers. Then it stops. Nothing is explained.
//
// The discipline is in what is refused, and every refusal was tempting: no
// insight line, no footer sentence, no "+ 12 more", no poster on any row, no
// chart. Each would make this a worse Classic, and there is already a Classic.
//
// ── The safe area does the design's work here ──────────────────────────────
//
// The other two treat the bleed as somewhere to put atmosphere. Here the CARD
// OBJECT is the safe area: a bone rectangle floating on the app's dark ground,
// which fills the strips above and below. On a story it reads as a card lying on
// a surface; cropped to 4:5 the surface disappears and it reads as the card
// itself. Both are correct, which is the whole trick. See frame.ts.

import { axisLabel } from "../taste";
import { drawCover, ellipsis, fitText, roundRect } from "./canvas";
import { H, PAD, SAFE_BOT, SAFE_TOP, SCALE, W } from "./frame";
import type { CardData, Faces, Kit, Renderer } from "./types";
import { lex } from "../lexicon";

// ── The stock ──────────────────────────────────────────────────────────────
//
// Not from the palette, and deliberately not affected by the brightness slider.
// Every other surface in the app is navy and moves with that control; this is
// paper, and paper does not get dimmer because you turned the app down. Warm
// rather than pure white — a business card is never #FFFFFF, and the warmth is
// what stops it reading as a blown-out screenshot.
const STOCK = "#f4f0e6";
const INK = "#14100c";
const INK_SOFT = "#6f675c";
const RULE = "#cdc5b4";

// The card object, inset inside the safe area so the stock has an edge on all
// four sides even after a 4:5 crop.
const CARD_X = 26;
const CARD_W = W - CARD_X * 2;
const CARD_Y = SAFE_TOP + 10;
const CARD_H = SAFE_BOT - SAFE_TOP - 20;

const GUT = 34; // the margin inside the stock
const IN_L = CARD_X + GUT;
const IN_R = CARD_X + CARD_W - GUT;
const IN_W = IN_R - IN_L;

export const paulAllen: Renderer = {
  size: { w: W, h: H, scale: SCALE, pad: PAD },

  fonts: (f: Faces) => [
    `400 46px ${f.display}`,
    `400 24px ${f.display}`,
    `400 16px ${f.display}`,
    `600 15px ${f.serif}`,
    `600 13px ${f.serif}`,
    `700 9px ${f.sans}`,
    `500 10px ${f.sans}`,
  ],

  images: (d: CardData) => [d.entries[0]?.poster],

  draw(ctx, d, kit: Kit) {
    const c = kit.palette;
    const f = kit.faces;
    const accent = kit.accent;
    const img = (url: string | undefined) => (url ? kit.images.get(url) ?? null : null);

    const display = (px: number) => `400 ${px}px ${f.display}`;
    const serif = (px: number, w = 600) => `${w} ${px}px ${f.serif}`;
    const sans = (px: number, w = 500) => `${w} ${px}px ${f.sans}`;

    const smallCaps = (px: number, space: string, fill: string) => {
      ctx.font = sans(px, 700);
      ctx.letterSpacing = space;
      ctx.fillStyle = fill;
    };
    const untrack = () => (ctx.letterSpacing = "0px");

    // The surface the card is lying on. Fills the bleed and only the bleed.
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);

    // ── The stock ──────────────────────────────────────────────────────────
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = STOCK;
    roundRect(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 4);
    ctx.fill();
    ctx.restore();

    // Corner ticks, the way a printed card carries crop marks. Four short
    // strokes; they cost nothing and they are most of the "object" feeling.
    // Drawn in the film's own colour — the only thing that varies between two of
    // these side by side, which is exactly what makes a set feel collected.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    const tick = 14;
    const inset = 14;
    (
      [
        [CARD_X + inset, CARD_Y + inset, 1, 1],
        [CARD_X + CARD_W - inset, CARD_Y + inset, -1, 1],
        [CARD_X + inset, CARD_Y + CARD_H - inset, 1, -1],
        [CARD_X + CARD_W - inset, CARD_Y + CARD_H - inset, -1, -1],
      ] as const
    ).forEach(([x, y, dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * tick, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * tick);
      ctx.stroke();
    });

    // ── The name, set as a name is set on a card ───────────────────────────
    //
    // Centred, which nothing else in this app is. Left alignment is the app's
    // voice and a centred name is the card's, and the difference is most of why
    // this does not read as a Rankd screen printed out.
    ctx.textAlign = "center";
    const mid = CARD_X + CARD_W / 2;

    smallCaps(9, "2.6px", INK_SOFT);
    ctx.fillText(d.eyebrow.toUpperCase(), mid, CARD_Y + 96);
    untrack();

    fitText(ctx, d.title.toUpperCase(), IN_W, display, 46, 22);
    ctx.fillStyle = INK;
    ctx.fillText(d.title.toUpperCase(), mid, CARD_Y + 140);

    // The hairline under the name, short and centred — the rule on a card sits
    // under the name, not across the whole stock.
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mid - 40, CARD_Y + 162);
    ctx.lineTo(mid + 40, CARD_Y + 162);
    ctx.stroke();

    // ── The artwork ────────────────────────────────────────────────────────
    //
    // One poster, centred, small. It is provenance rather than the subject: this
    // card is about the ranking existing, and the picture is the seal on it.
    const pw = 148;
    const ph = Math.round(pw * 1.5);
    const px = mid - pw / 2;
    const py = CARD_Y + 190;
    const heroImg = img(d.entries[0]?.poster);
    if (heroImg) {
      ctx.save();
      roundRect(ctx, px, py, pw, ph, 3);
      ctx.clip();
      drawCover(ctx, heroImg, px, py, pw, ph);
      ctx.restore();
    } else {
      ctx.fillStyle = RULE;
      roundRect(ctx, px, py, pw, ph, 3);
      ctx.fill();
    }
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1;
    roundRect(ctx, px - 0.5, py - 0.5, pw + 1, ph + 1, 3.5);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ── Three titles, as credentials ───────────────────────────────────────
    //
    // No posters, no years, no stars. A rank and a name, in the serif, spaced
    // like the three lines of qualifications under somebody's name on a card.
    const listY = py + ph + 44;
    d.entries.slice(0, 3).forEach((film, i) => {
      const y = listY + i * 28;
      ctx.textAlign = "center";
      ctx.font = serif(i === 0 ? 15 : 13);
      ctx.fillStyle = i === 0 ? INK : INK_SOFT;
      const numeral = `${i + 1}`;
      ctx.font = display(16);
      const nw = ctx.measureText(numeral).width;
      ctx.font = serif(i === 0 ? 15 : 13);
      const title = ellipsis(ctx, film.title, IN_W - nw - 20);
      const tw = ctx.measureText(title).width;
      const startX = mid - (nw + 10 + tw) / 2;

      ctx.textAlign = "left";
      ctx.fillStyle = i === 0 ? accent : RULE;
      ctx.font = display(16);
      ctx.fillText(numeral, startX, y);

      ctx.fillStyle = i === 0 ? INK : INK_SOFT;
      ctx.font = serif(i === 0 ? 15 : 13);
      ctx.fillText(title, startX + nw + 10, y);
    });

    // ── Four numbers, as contact details ───────────────────────────────────
    //
    // The row along the foot of a business card: small, evenly spaced, and read
    // only by somebody who has already decided to care.
    const stats: [string, string][] = [[lex().many.toUpperCase(), String(d.stats.films)]];
    if (d.stats.avgRating !== undefined) stats.push(["AVG", `${d.stats.avgRating.toFixed(1)}★`]);
    // `axisLabel`, so "Science Fiction" becomes "Sci-Fi" rather than being
    // ellipsised to "SCIENCE FICTI…" — a truncated genre in a four-column strip
    // is the one stat that reliably fails to say what it is. Same map the taste
    // radar uses, so a card cannot name a genre two ways.
    if (d.stats.topGenre) stats.push(["GENRE", axisLabel(d.stats.topGenre)]);
    if (d.stats.topDecade) stats.push(["DECADE", d.stats.topDecade]);

    const statY = CARD_Y + CARD_H - 74;
    ctx.strokeStyle = RULE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(IN_L, statY - 24);
    ctx.lineTo(IN_R, statY - 24);
    ctx.stroke();

    const colW = IN_W / stats.length;
    ctx.textAlign = "center";
    stats.forEach(([label, value], i) => {
      const x = IN_L + i * colW + colW / 2;
      smallCaps(8, "1.6px", INK_SOFT);
      ctx.fillText(label, x, statY);
      untrack();
      ctx.fillStyle = INK;
      ctx.font = display(24);
      ctx.fillText(ellipsis(ctx, value, colW - 8), x, statY + 26);
    });

    // ── The maker's mark ───────────────────────────────────────────────────
    //
    // The company name at the foot of the card. In ink rather than gold: gold on
    // bone is a wedding invitation, and this is a business card.
    ctx.fillStyle = INK;
    ctx.font = display(16);
    ctx.letterSpacing = "3.4px";
    ctx.fillText("RANKD", mid, CARD_Y + CARD_H - 26);
    untrack();

    // ── Below the stock, on the surface it lies on ─────────────────────────
    //
    // The date and the byline sit on the DARK ground in the bleed, not on the
    // card. A business card does not print the date it was handed to you, and
    // keeping them off the stock is what lets the stock stay silent.
    ctx.fillStyle = c.dim;
    ctx.font = sans(10, 500);
    ctx.textAlign = "center";
    ctx.fillText(
      [d.handle ? `@${d.handle}` : null, d.dateLabel].filter(Boolean).join("   ·   "),
      W / 2,
      SAFE_BOT + 40,
    );
    ctx.textAlign = "left";
  },
};
