"use client";

// MARQUEE — the poster. Named for the lit sign outside a cinema.
//
// ── What it is for ─────────────────────────────────────────────────────────
//
// One idea, enormously. Classic hands over the evidence; this makes the claim
// and gets out of the way. It is the card you put on a story, and it is designed
// for that surface first — which is the whole reason the rebuild started.
//
// ── The colour is a HEADER, not the whole card ─────────────────────────────
//
// The old version split the frame vertically: a colour block down the left
// third, the ranking to the right. That was a landscape solution to a landscape
// problem — no vertical room, so the boldness had to go sideways.
//
// The first rebuild took the obvious next step and filled the entire 9:16 with
// the colour. It was too much: a full-bleed wall of one hue is not a card, it is
// a swatch, and the posters at the bottom read as an afterthought stuck onto it.
//
// So the colour is a BAND across the top, which is what the name meant all
// along — a marquee is the lit sign above a cinema entrance, not the building.
// It holds the wordmark, the count and the claim; the ranking sits underneath on
// the app's own dark ground, where posters belong. The card is still led by a
// slab of colour and is no longer drowned in one.
//
// ── The colour, which is the one thing carried over ────────────────────────
//
// Still `blockFor(subject)` — one of the five wordmark bars, picked by hashing
// the subject so a director is the same colour forever, on this card and on the
// genre panel of a public profile. Ink flips light or dark by luma, because
// white is illegible on the gold bar and black is illegible on the navy.
//
// Poster-derived colour was tried for the block and is wrong for it: a muted
// poster makes a muted wall, which is fatal to the one design whose entire job
// is to be loud. It stays where it belongs — a hairline on the #1 poster, and
// the stat values — because there it is a whisper of the film.
//
// ── The safe area ──────────────────────────────────────────────────────────
//
// The band runs off the TOP edge, through the bleed, so on a story it reaches
// the top of the screen. Its lower edge is well inside the 4:5, so a feed crop
// still shows the band ending against the dark — which is the whole shape of the
// design and would be lost if the edge sat in the bleed. See frame.ts.

import { BARS } from "../brand";
import { blockFor, inkOn } from "./palette";
import { drawCircleImage, drawCover, ellipsis, fitText, roundRect, wrap } from "./canvas";
import { CONTENT_W, H, LEFT, PAD, RIGHT, SAFE_BOT, SAFE_TOP, SCALE, W } from "./frame";
import type { CardData, Faces, Kit, Renderer } from "./types";
import { lex } from "../lexicon";

// ── The vertical budget ────────────────────────────────────────────────────
//
// Every one of these is measured from the SAFE edges, and the poster height is
// derived rather than chosen — which is the fix for how this first went wrong.
// The podium was pinned to `SAFE_BOT - 210` with a height computed from the
// available WIDTH, so the two numbers had no relationship: the posters came out
// 216 tall against 210 of room, ran 30 units past the safe edge, and the name
// underneath drew straight through them. Both faults were invisible on screen —
// the card looked fine, and only a feed crop would have taken the bottom off the
// podium.
//
// So the podium's box is stated first and the artwork is fitted INTO it.
/** The lit sign. Runs off the top edge; ends well inside the 4:5. */
const BAND_BOT = SAFE_TOP + 296;

const COUNT_Y = SAFE_TOP + 128; // the enormous numeral, baseline
const CLAIM_Y = SAFE_TOP + 196; // the insight, first line — 3 lines of room

const PODIUM_TOP = BAND_BOT + 44; // posters, top edge
const NAME_Y = SAFE_BOT - 26; // the subject, baseline. Eyebrow 16 below.
/** Everything the podium owns: artwork, then its numerals, then clear air. */
const PODIUM_H = NAME_Y - 48 - PODIUM_TOP;

export const marquee: Renderer = {
  size: { w: W, h: H, scale: SCALE, pad: PAD },

  fonts: (f: Faces) => [
    `400 150px ${f.display}`,
    `400 44px ${f.display}`,
    `400 26px ${f.display}`,
    `400 22px ${f.display}`,
    `600 21px ${f.serif}`,
    `700 12px ${f.sans}`,
    `600 11px ${f.sans}`,
    `700 9px ${f.sans}`,
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

    const block = blockFor(d.title + d.eyebrow);
    const INK = inkOn(block);

    // The page, then the sign on top of it.
    ctx.fillStyle = c.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = block;
    ctx.fillRect(0, 0, W, BAND_BOT);

    const tracked = (px: number, weight: number, space: string, alpha = 1) => {
      ctx.font = sans(px, weight);
      ctx.letterSpacing = space;
      ctx.fillStyle = INK;
      ctx.globalAlpha = alpha;
    };
    const untrack = () => {
      ctx.letterSpacing = "0px";
      ctx.globalAlpha = 1;
    };

    // ── Bleed, top: the wordmark and the byline ────────────────────────────
    ctx.fillStyle = INK;
    ctx.font = display(22);
    ctx.letterSpacing = "3px";
    ctx.fillText("RANKD", LEFT, SAFE_TOP - 40);
    untrack();

    if (d.handle) {
      tracked(9, 700, "1.4px", 0.72);
      ctx.textAlign = "right";
      ctx.fillText(`@${d.handle.toUpperCase()}`, RIGHT, SAFE_TOP - 40);
      ctx.textAlign = "left";
      untrack();
    }

    // ── The number, which is the artwork ───────────────────────────────────
    //
    // The Wrapped move: a slide says one thing at a size nothing else uses. A
    // ranking has a better claim on an oversized numeral than a listening stat
    // does, because the answer to "rank these" IS a number.
    ctx.fillStyle = INK;
    ctx.font = display(150);
    ctx.fillText(String(d.stats.films), LEFT, COUNT_Y);

    tracked(12, 700, "2.4px");
    ctx.fillText(`${lex().many.toUpperCase()} RANKED`, LEFT, COUNT_Y + 28);
    untrack();

    // ── The claim ──────────────────────────────────────────────────────────
    //
    // Set as the headline it is, in the serif. Three lines, which is what the
    // band has room for — the ceiling is enforced by `wrap` rather than hoped
    // for, so a long insight ellipsises instead of running out of the colour and
    // onto the dark, where it would change ink colour mid-sentence.
    if (d.insight) {
      ctx.fillStyle = INK;
      ctx.font = serif(21);
      wrap(ctx, d.insight, CONTENT_W, 3).forEach((line, i) =>
        ctx.fillText(line, LEFT, CLAIM_Y + i * 27),
      );
    }

    // ── Below the sign ─────────────────────────────────────────────────────
    //
    // Everything from here is on the app's own ground, so it takes the app's own
    // colours. `INK` is the band's and must not follow anything down here — it
    // is picked for legibility against the block, and against navy it is
    // whatever happens to be left.
    //
    // Three posters and their numerals. Proof rather than content: enough to
    // show what the claim above is a claim ABOUT, and not so much that the card
    // becomes a list.
    ctx.font = sans(9, 700);
    ctx.letterSpacing = "2px";
    ctx.fillStyle = c.dim;
    ctx.fillText("THE TOP THREE", LEFT, PODIUM_TOP - 14);
    ctx.letterSpacing = "0px";

    const top = d.entries.slice(0, 3);
    const gap = 14;
    const LABEL_H = 24; // the numeral and title line under the artwork
    // Fitted to whichever runs out first — the width of three posters across the
    // gutter, or the height the band actually has. Taking the width alone is what
    // pushed the podium through the safe edge.
    const pw = Math.min(
      Math.floor((CONTENT_W - gap * 2) / 3),
      Math.floor((PODIUM_H - LABEL_H) / 1.5),
    );
    const ph = Math.round(pw * 1.5);
    // Centred, so the row stays balanced when the height is what limited it and
    // the three posters no longer span the full gutter.
    const rowW = pw * 3 + gap * 2;
    const rowX = LEFT + Math.round((CONTENT_W - rowW) / 2);

    top.forEach((film, i) => {
      const x = rowX + i * (pw + gap);
      const poster = img(film.poster);
      if (poster) {
        ctx.save();
        roundRect(ctx, x, PODIUM_TOP, pw, ph, 5);
        ctx.clip();
        drawCover(ctx, poster, x, PODIUM_TOP, pw, ph);
        ctx.restore();
      } else {
        ctx.fillStyle = c.surface;
        roundRect(ctx, x, PODIUM_TOP, pw, ph, 5);
        ctx.fill();
      }
      if (i === 0) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.5;
        roundRect(ctx, x - 1.5, PODIUM_TOP - 1.5, pw + 3, ph + 3, 6);
        ctx.stroke();
      }

      // Gold for the winner, dim for the other two — the app's own way of saying
      // "this one is settled", rather than a second opinion about hierarchy.
      ctx.fillStyle = i === 0 ? c.gold : c.dim;
      ctx.font = display(26);
      ctx.fillText(String(i + 1), x, PODIUM_TOP + ph + 22);

      ctx.fillStyle = i === 0 ? c.text : c.dim;
      ctx.font = sans(11, 600);
      ctx.fillText(ellipsis(ctx, film.title, pw - 20), x + 18, PODIUM_TOP + ph + 20);
    });

    // ── Whose ──────────────────────────────────────────────────────────────
    const hasFace = !!d.portrait;
    if (hasFace) drawCircleImage(ctx, img(d.portrait), LEFT + 22, NAME_Y - 12, 22, c.surface);
    const nameX = hasFace ? LEFT + 54 : LEFT;

    fitText(ctx, d.title.toUpperCase(), RIGHT - nameX, display, 44, 20);
    ctx.fillStyle = c.text;
    ctx.fillText(d.title.toUpperCase(), nameX, NAME_Y);

    ctx.font = sans(9, 700);
    ctx.letterSpacing = "1.6px";
    ctx.fillStyle = c.dim;
    ctx.fillText(d.eyebrow.toUpperCase(), nameX, NAME_Y + 16);
    ctx.letterSpacing = "0px";

    // ── Bleed, bottom: the bars and the date ───────────────────────────────
    const barW = 16;
    BARS.forEach((colour, i) => {
      ctx.fillStyle = colour;
      roundRect(ctx, LEFT + i * (barW + 5), SAFE_BOT + 32, barW, 3, 1.5);
      ctx.fill();
    });

    ctx.font = sans(11, 600);
    ctx.fillStyle = c.dim;
    ctx.textAlign = "right";
    ctx.fillText(d.dateLabel, RIGHT, SAFE_BOT + 36);
    ctx.textAlign = "left";
  },
};
