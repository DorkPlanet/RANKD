// The shape of your taste, drawn from where films actually ended up.
//
// ── What the axes measure, and why it is not win rate ──────────────────────
//
// The obvious version of this chart plots how often a genre won its duels. It
// is wrong, and the reason is worth keeping: the duel log is not a sample of
// your taste, it is a record of what the matchmaker asked.
//
//  · King of the Hill picks opponents by score proximity. The algorithm chose
//    the pairing; you did not choose to compare those two films.
//  · Volume tracks tier size. A 3-star tier holding 185 films generates far more
//    rows than a small one, so whatever genre is common there swamps any count.
//  · Rough Cut writes no log rows at all, correctly, because no pair was
//    compared. A genre shaped entirely by Rough Cut would contribute nothing.
//  · Fast Shuffle deliberately serves the pair it can least predict, so those
//    duels sit near 50/50 by construction. Most information, least direction.
//
// So the axes are built from SETTLED POSITIONS instead: where a film ended up in
// your order, not how it got there. Every bias above disappears, because a
// position is the product of decisions you actually kept.
//
// ── Why positions rather than beliefs ──────────────────────────────────────
//
// `bayes.ts` holds a mean per film and it is tempting to average those instead.
// It is the same trap the film card hit: `PRIOR_SPREAD` is deliberately wide, so
// a much-duelled film can out-mean a whole tier above it, while `shuffle.ts`
// re-spreads within a band and never lets one be escaped. Cross-tier means are
// not calibrated against each other; nothing ever duels a 1.5-star against a
// 4-star.
//
// A rank is already tier-correct, because tier bands never overlap and a score
// sort is therefore a tier sort. Using positions sidesteps the whole problem.

import { genresIn } from "./genres";
import { rankMap } from "./list";
import type { Film } from "./types";

/** Below this a genre has nothing to say and is left off the chart entirely. */
export const MIN_FOR_AXIS = 3;

/** How many axes a radar can carry before it stops being readable. */
export const MAX_AXES = 8;

/** A genre, and how high its films sit in your order. */
export interface TasteAxis {
  genre: string;
  /** 0 at the bottom of your order, 1 at the top. */
  standing: number;
  /** Placed films behind this number. Never below `MIN_FOR_AXIS`. */
  count: number;
}

/** A whole shape, keyed by genre so two of them can be compared axis by axis. */
export type TasteShape = Record<string, number>;

/**
 * Where a film sits, as 0 to 1, with 1 the top of the list.
 *
 * Ranked against EVERY film, the same scope `buildList` numbers against, so a
 * standing here and a number on the list screen mean the same thing. Only placed
 * films have one.
 */
function standings(films: readonly Film[]): Map<string, number> {
  const ranks = rankMap(films as Film[]);
  const out = new Map<string, number>();
  // One film cannot be high or low relative to anything, so it sits mid.
  const span = Math.max(1, films.length - 1);
  for (const [id, rank] of ranks) out.set(id, 1 - (rank - 1) / span);
  return out;
}

/**
 * The genres worth drawing, commonest first.
 *
 * Fixed from the library rather than from whatever happens to be placed, so the
 * chart keeps the same axes as you rank more and a shape taken an hour ago is
 * still comparable with one taken now. An axis that later falls below
 * `MIN_FOR_AXIS` simply has no value, rather than the chart changing shape
 * underneath the reader.
 */
export function tasteAxes(films: readonly Film[]): string[] {
  const placed = standings(films);
  return genresIn(films)
    .filter((g) => films.filter((f) => f.genres?.includes(g.name) && placed.has(f.id)).length >= MIN_FOR_AXIS)
    .slice(0, MAX_AXES)
    .map((g) => g.name);
}

/**
 * Each genre's mean standing, over the films you have actually placed.
 *
 * A genre sitting above 0.5 is one whose films you tend to rank above the middle
 * of your library. That is a claim about your order, which you made, rather than
 * about how much of the genre you own, which is what every competitor's version
 * of this chart plots and what a Letterboxd export alone can answer.
 */
export function tasteShape(films: readonly Film[], axes: readonly string[]): TasteShape {
  const placed = standings(films);
  const shape: TasteShape = {};
  for (const genre of axes) {
    const mine = films.filter((f) => f.genres?.includes(genre) && placed.has(f.id));
    if (mine.length < MIN_FOR_AXIS) continue;
    shape[genre] = mine.reduce((sum, f) => sum + placed.get(f.id)!, 0) / mine.length;
  }
  return shape;
}

/** Axes and values together, for a caller that wants to draw one shape. */
export function tasteFor(films: readonly Film[]): TasteAxis[] {
  const axes = tasteAxes(films);
  const shape = tasteShape(films, axes);
  const placed = standings(films);
  return axes
    .filter((g) => shape[g] !== undefined)
    .map((genre) => ({
      genre,
      standing: shape[genre],
      count: films.filter((f) => f.genres?.includes(genre) && placed.has(f.id)).length,
    }));
}

/**
 * The genre that moved most between two shapes, if anything moved at all.
 *
 * `null` rather than a zero row: a sitting that changed nothing should say
 * nothing, the same rule `deltaOf` follows in `visit.ts`. The threshold exists
 * because a single placement in a big library nudges every axis by a hair, and
 * "Drama moved 0.2%" is noise wearing a fact's clothes.
 */
export const MOVED = 0.01;

export function biggestMove(
  was: TasteShape,
  now: TasteShape,
): { genre: string; from: number; to: number } | null {
  let best: { genre: string; from: number; to: number } | null = null;
  for (const genre of Object.keys(now)) {
    const from = was[genre];
    if (from === undefined) continue;
    const move = Math.abs(now[genre] - from);
    if (move < MOVED) continue;
    if (!best || move > Math.abs(best.to - best.from)) best = { genre, from, to: now[genre] };
  }
  return best;
}
