// Turning a position in the canon into a film Rankd can hold.
//
// ── Why the tier comes from the RANK, not from TMDb's score ────────────────
//
// The obvious move is to map a 0-10 vote average onto the half-star scale. It
// does not work, for a reason that is structural rather than aesthetic: every
// `TIER_RANGE` band in lib/tiers.ts is exactly 1000 wide, so a tier can hold at
// most 1000 distinct integer scores. TMDb's ratings cluster hard between 7 and
// 8.7, so a straight mapping drops most of a thousand-film canon into one or two
// bands and runs the band out of room.
//
// Position does not cluster. Rank 1 to 1000 spreads by construction, so the
// ladder below always fits and the shape of it is a decision somebody made
// rather than an artefact of how TMDb's voters behave.

import { TIER_RANGE, type Rating } from "../tiers";

/**
 * Where each slice of the canon sits on the half-star scale.
 *
 * ── Fractions, not fixed ranks, and that was a bug ─────────────────────────
 *
 * These were absolute cut points tuned for a thousand films: top 50 five-star,
 * top 200 four and a half, and so on. Applied to the 250-film canon that is
 * actually being built, it put eighty per cent of the list at 4.5 or better and
 * left the bottom two tiers completely empty. The profile would have read as
 * though every film in it were a masterpiece, and the star rating would have
 * carried no information at all.
 *
 * As fractions it looks like a library at any size the canon is ever set to.
 * Deliberately still top-heavy, because a canon IS a list of good films and the
 * interesting question is which of them are great, not how far down the merely
 * good go.
 *
 * This changes only the DISPLAYED rating. Bands do not overlap and
 * `scoreWithinTier` spreads within them, so the published order is identical
 * either way.
 */
const LADDER: ReadonlyArray<{ share: number; rating: Rating }> = [
  { share: 0.1, rating: 5 },
  { share: 0.3, rating: 4.5 },
  { share: 0.6, rating: 4 },
  { share: 1, rating: 3.5 },
];

/**
 * The star rating for a 1-based position in a canon of `size` films.
 *
 * `size` is required rather than defaulted, on purpose. A default would let a
 * caller silently get the wrong ladder for their canon, which is exactly the
 * mistake the fractions above were introduced to fix.
 */
export function tierForRank(rank: number, size: number): Rating {
  if (size <= 0) return LADDER[0].rating;
  // Clamped, so a rank past the end of the canon still lands in the last tier
  // rather than falling through to a default nobody chose.
  const position = Math.min(Math.max(rank, 1), size) / size;
  return (LADDER.find((step) => position <= step.share) ?? LADDER[LADDER.length - 1]).rating;
}

/**
 * Spread the films inside one tier across that tier's band.
 *
 * ── Copied from `respreadTier`, not called ─────────────────────────────────
 *
 * `shuffle.ts` has this formula and its comment explains what it is for: a
 * shuffled tier and a climbed tier come out numerically indistinguishable. The
 * house account's tiers should be indistinguishable from both, so it uses the
 * same arithmetic.
 *
 * It is copied rather than imported because `respreadTier`'s signature is
 * `(films, tier, beliefs, movePlaced)` and it sorts by belief mean, which the
 * canon does not have. Eight lines of agreement beats contorting a function that
 * is doing a different job.
 *
 * `index` is 0-based WITHIN the tier, best first, and `total` is how many films
 * are in it. A tier of one sits at the top of its band rather than dividing by
 * zero.
 */
export function scoreWithinTier(rating: Rating, index: number, total: number): number {
  const [min, max] = TIER_RANGE[rating];
  if (total <= 1) return max;
  return Math.round(max - (index / (total - 1)) * (max - min));
}

export interface Placed {
  rating: Rating;
  score: number;
}

/**
 * Place a whole ordered canon.
 *
 * Takes the order and returns one placement per position, so the caller never
 * has to know how tiers are counted or how a band is divided. Both of those are
 * easy to get subtly wrong once and never notice.
 */
export function placeCanon(size: number): Placed[] {
  const ratings = Array.from({ length: size }, (_, i) => tierForRank(i + 1, size));

  // How many films landed in each tier, so the spread knows its denominator.
  const totals = new Map<Rating, number>();
  for (const r of ratings) totals.set(r, (totals.get(r) ?? 0) + 1);

  const seen = new Map<Rating, number>();
  return ratings.map((rating) => {
    const index = seen.get(rating) ?? 0;
    seen.set(rating, index + 1);
    return { rating, score: scoreWithinTier(rating, index, totals.get(rating)!) };
  });
}
