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
// ── Two POPULATIONS, one order — and why it used to be the other way ───────
//
// This drew two orderings over one population: your order by score, and Rankd's
// by rating-then-belief. The premise was that those are two different answers to
// "where does this film belong".
//
// **They are the same answer, and it is provable rather than arguable.** A soft
// lock's `score` is written by `respreadTier`, which spreads a tier IN BELIEF
// ORDER. Tier bands never overlap, so sorting by score IS sorting by rating then
// belief. The two orders can only diverge on a HARD lock, whose score the user
// pinned and the model may not touch.
//
// So on a library placed almost entirely by Fast Shuffle the chart drew one line
// twice. Reported from a phone — "they overlap the exact same" — with one locked
// film against 234 shuffled, and confirmed by a test over 60 placed films: the
// two orders came back byte-identical.
//
// What is drawn now is the comparison that was actually wanted: **the films you
// LOCKED against the films Rankd SHUFFLED.** Two populations, one ordering, and
// a real question — do the films you cared enough to settle sit differently from
// the ones the model placed for you?
//
// The old warning about comparing populations is not forgotten, it is answered:
// both shapes use the SAME standings, taken from the whole placed list, so a
// genre's height means the same thing on both lines. Only the membership
// differs, which is the entire point.
//
// Tier-scoping still matters wherever beliefs are turned into a position.
// `PRIOR_SPREAD` is deliberately wide, so a much-duelled film can out-mean a
// whole tier above it while `shuffle.ts` never lets a band be escaped. Sorting
// by raw belief mean produces a position Rankd would never act on — it shipped
// on the film card for one afternoon and printed a 1.5-star film at #391.

import type { Belief } from "./bayes";
import { seedOf } from "./beliefs";
import { genresIn } from "./genres";
import { isHard, isPlaced } from "./lock";
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

/** Your shape over everything placed — the profile's gold line by default. */
export function tasteShape(films: readonly Film[], axes: readonly string[]): TasteShape {
  return shapeFrom(films, yourOrder(films), axes);
}

/**
 * Below this, a "locked" shape is noise rather than a shape.
 *
 * Three films can put a genre on an axis (`MIN_FOR_AXIS`) but they cannot
 * describe a taste, and a spike drawn from two locked horror films would invite
 * a reading the data cannot support. Ten is where it starts being a claim.
 */
export const MIN_FOR_LOCKED = 10;

/**
 * The films you LOCKED, shaped against the same standings as everything else.
 *
 * Both this and `shuffledShape` take their standings from the whole placed list
 * — `shapeFrom` is given the full order — so a genre sitting high means the same
 * thing on both lines and only the MEMBERSHIP differs. That is what makes the
 * two comparable at all; two separately-normalised shapes would be two charts
 * sharing a dial.
 *
 * Returns null below `MIN_FOR_LOCKED`, so the caller can leave the line off and
 * say why rather than drawing a shape nobody should read.
 */
export function lockedShape(films: readonly Film[], axes: readonly string[]): TasteShape | null {
  const locked = films.filter(isHard);
  if (locked.length < MIN_FOR_LOCKED) return null;
  return membershipShape(locked, yourOrder(films), axes);
}

/** The films Rankd placed for you — everything with a position you did not lock. */
export function shuffledShape(films: readonly Film[], axes: readonly string[]): TasteShape {
  return membershipShape(
    films.filter((f) => isPlaced(f) && !isHard(f)),
    yourOrder(films),
    axes,
  );
}

/**
 * A shape over a SUBSET, where an empty axis means zero rather than no data.
 *
 * `shapeFrom` omits a genre below `MIN_FOR_AXIS`, which is right when both
 * lines cover the same films: a gap there means "not enough to say", and
 * closing a polygon across it would invent a value.
 *
 * It is wrong here, and the difference is the whole point of these two shapes.
 * When the population is "the films you locked", a genre with none of them in it
 * is not missing data — it is the answer. You have locked no comedies. Omitting
 * that axis made the polygon refuse to draw at all, which is how a lock set
 * concentrated in one genre — the interesting case, and the one the user
 * predicted would "point mostly one direction" — ended up invisible.
 *
 * So every axis gets a value and an absent genre gets 0. That is what produces
 * the spike.
 */
function membershipShape(
  subset: readonly Film[],
  order: readonly Film[],
  axes: readonly string[],
): TasteShape {
  const standing = standingsFrom(order);
  const shape: TasteShape = {};
  for (const genre of axes) {
    const mine = subset.filter((f) => f.genres?.includes(genre) && standing.has(f.id));
    shape[genre] = mine.length
      ? mine.reduce((sum, f) => sum + standing.get(f.id)!, 0) / mine.length
      : 0;
  }
  return shape;
}

/**
 * Rankd's shape over the same films, drawn alongside yours.
 *
 * Takes beliefs rather than fitting them, and that is not a style choice.
 * `beliefsFor` carries a warning on the function itself — expensive, and callers
 * on an interaction path want `beliefsWhenIdle` or the cached `lastBeliefs`
 * instead. The first version of this ignored it and fitted the whole log inline,
 * from a profile effect keyed on the library array. The credits sweep rewrites
 * that array every few minutes, so every sweep pass triggered a fresh
 * several-hundred-millisecond fit on the main thread.
 *
 * The caller does the fitting, which is what lets it be the cached, idle one.
 */
export function rankdShape(
  films: readonly Film[],
  beliefs: Map<string, Belief>,
  axes: readonly string[],
): TasteShape {
  return shapeFrom(films, rankdOrder(films, beliefs), axes);
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
