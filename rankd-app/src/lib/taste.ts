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
// ── Two orders, one population ─────────────────────────────────────────────
//
// There are two answers to "where does this film belong": the one you committed
// to, and the one the evidence implies. Both are drawn, over the SAME set of
// placed films and the same denominator, so the only difference between the two
// shapes is the ordering. Anything else would be comparing two populations and
// calling the difference taste.
//
// Rankd's order is tier-scoped, and that is not a detail. `PRIOR_SPREAD` is
// deliberately wide, so a much-duelled film can out-mean a whole tier above it,
// while `shuffle.ts` re-spreads within a band and never lets one be escaped.
// Sorting the library by raw belief mean produces a position Rankd would never
// act on — it shipped on the film card for one afternoon and printed a 1.5-star
// film at #391. Rating first, belief second, is the order Rankd would actually
// apply.

import { beliefsFor } from "./beliefs";
import type { Belief } from "./bayes";
import { seedOf } from "./beliefs";
import { genresIn } from "./genres";
import { isPlaced } from "./lock";
import type { Judgement } from "./log";
import type { Film } from "./types";

/** Below this a genre has nothing to say and is left off the chart entirely. */
export const MIN_FOR_AXIS = 3;

/** How many axes a radar can carry before it stops being readable. */
export const MAX_AXES = 8;

/**
 * Display names for the genres TMDb spells out at length.
 *
 * "Science Fiction" is fifteen characters and it ran off the right edge of the
 * chart the first time this shipped — caught on a phone, and missed here because
 * the geometry was checked against invented names rather than the real ones.
 * Shortening beats shrinking the type or widening the dial, and "Sci-Fi" is what
 * everybody calls it anyway.
 */
const SHORT: Record<string, string> = {
  "Science Fiction": "Sci-Fi",
  Documentary: "Docs",
  "TV Movie": "TV",
};

export const axisLabel = (genre: string): string => SHORT[genre] ?? genre;

/** A genre, and how high its films sit in an order. */
export interface TasteAxis {
  genre: string;
  /** 0 at the bottom of the order, 1 at the top. */
  standing: number;
  /** Placed films behind this number. Never below `MIN_FOR_AXIS`. */
  count: number;
}

/** A whole shape, keyed by genre so two of them can be compared axis by axis. */
export type TasteShape = Record<string, number>;

/** Only films something has placed. Both orders run over exactly this set. */
const placedOf = (films: readonly Film[]): Film[] => films.filter(isPlaced);

/** An order turned into 0-to-1 standings, 1 being the top. */
function standingsFrom(order: readonly Film[]): Map<string, number> {
  // One film cannot be high or low relative to anything, so it sits at the top
  // rather than dividing by zero.
  const span = Math.max(1, order.length - 1);
  const out = new Map<string, number>();
  order.forEach((f, i) => out.set(f.id, 1 - i / span));
  return out;
}

/** Your order: the scores you committed to, best first. */
export function yourOrder(films: readonly Film[]): Film[] {
  return placedOf(films).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}

/**
 * Rankd's order: your star rating first, then what the duels imply inside it.
 *
 * Rating leads because a tier band is never escaped. See the header.
 */
export function rankdOrder(films: readonly Film[], beliefs: Map<string, Belief>): Film[] {
  const meanOf = (f: Film) => beliefs.get(f.id)?.mean ?? seedOf(f);
  return placedOf(films).sort(
    (a, b) => b.rating - a.rating || meanOf(b) - meanOf(a) || a.title.localeCompare(b.title),
  );
}

/**
 * The genres worth drawing, commonest first.
 *
 * Fixed from the library rather than from whatever happens to be placed, so the
 * chart keeps the same axes as you rank more and a shape taken an hour ago is
 * still comparable with one taken now.
 */
export function tasteAxes(films: readonly Film[]): string[] {
  const placed = new Set(placedOf(films).map((f) => f.id));
  return genresIn(films)
    .filter(
      (g) => films.filter((f) => f.genres?.includes(g.name) && placed.has(f.id)).length >= MIN_FOR_AXIS,
    )
    .slice(0, MAX_AXES)
    .map((g) => g.name);
}

/**
 * Each genre's mean standing within a given order.
 *
 * A genre above 0.5 is one whose films sit above the middle. That is a claim
 * about an order, which somebody made, rather than about how much of the genre
 * you own, which is what every competitor's version plots and what a Letterboxd
 * export alone can answer.
 */
export function shapeFrom(
  films: readonly Film[],
  order: readonly Film[],
  axes: readonly string[],
): TasteShape {
  const standing = standingsFrom(order);
  const shape: TasteShape = {};
  for (const genre of axes) {
    const mine = films.filter((f) => f.genres?.includes(genre) && standing.has(f.id));
    if (mine.length < MIN_FOR_AXIS) continue;
    shape[genre] = mine.reduce((sum, f) => sum + standing.get(f.id)!, 0) / mine.length;
  }
  return shape;
}

/** Your shape, which is what the profile draws in gold. */
export function tasteShape(films: readonly Film[], axes: readonly string[]): TasteShape {
  return shapeFrom(films, yourOrder(films), axes);
}

/** Rankd's shape over the same films, drawn alongside yours. */
export function rankdShape(
  films: readonly Film[],
  log: readonly Judgement[],
  axes: readonly string[],
): TasteShape {
  return shapeFrom(films, rankdOrder(films, beliefsFor(films, log)), axes);
}

/** Axes and values together, for a caller that wants to draw one shape. */
export function tasteFor(films: readonly Film[]): TasteAxis[] {
  const axes = tasteAxes(films);
  const shape = tasteShape(films, axes);
  const placed = new Set(placedOf(films).map((f) => f.id));
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

/** The genre you and Rankd disagree about most, for the caption under the chart. */
export function biggestDisagreement(
  yours: TasteShape,
  theirs: TasteShape,
): { genre: string; gap: number; youHigher: boolean } | null {
  let best: { genre: string; gap: number; youHigher: boolean } | null = null;
  for (const genre of Object.keys(yours)) {
    const other = theirs[genre];
    if (other === undefined) continue;
    const gap = Math.abs(yours[genre] - other);
    if (gap < MOVED) continue;
    if (!best || gap > best.gap) best = { genre, gap, youHigher: yours[genre] > other };
  }
  return best;
}
