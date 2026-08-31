// Cut points — deciding where a tier begins and ends by hand.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// Everywhere else in the app a star rating is the primary key: `rating` picks a
// non-overlapping score band (lib/tiers.ts), `score` places the film inside it,
// and a plain score sort is therefore already tier-correct (see lib/list.ts).
// The consequence is that a person cannot say where a tier starts — the tiers
// decide where the films go. This inverts that for one deliberate action: one
// continuous order, a count per tier chosen by the user, and the ratings fall
// out of the cuts.
//
// ── Counts, not indices ────────────────────────────────────────────────────
//
// A cut set is "40 films in 5★, then 90 in 4.5★, …", never "the cut is at index
// 40". The library changes size — an import lands, a film is deleted — and an
// index into an order that no longer exists is a cut in the wrong place with no
// way to tell. Counts degrade honestly: `normalise` flows the difference into
// the last tier and everything above it is still where it was put.
//
// ── Why writing ratings back is safe here, when reRate's was not ───────────
//
// Cut points are monotonic in the continuous order, and tier bands are
// monotonic in rating. So `applyCuts` writing BOTH rating and score — the score
// spread inside the new band, best first — leaves the library in a state where
// a plain score sort reproduces the continuous order exactly. Bands stay
// non-overlapping and every score stays inside its own band, so `rankMap`,
// `ratingOfScore` in social/feed.ts, `buildList`, `tierProgress`, the
// achievements and canon/place.ts all keep answering correctly. That property
// is the whole reason this feature is tractable, and `test/cuts.test.ts` exists
// to protect it.

import { keyFor } from "./medium";
import { markDirty } from "./syncState";
import { ORDERED_TIERS, tierMax, tierMin, type Rating } from "./tiers";
import type { Film } from "./types";

/**
 * How many distinct scores a single tier can hold.
 *
 * Every `TIER_RANGE` band is exactly 1000 integers wide, so a group larger than
 * this cannot be spread without two films landing on the same score — and two
 * films on the same score is a tie the list breaks by title, which reads as the
 * cut being ignored. See the same constant's reasoning in lib/canon/place.ts.
 */
export const MAX_PER_TIER = 1000;

/**
 * The tiers a cut set may use, for the medium it will be exported to.
 *
 * Letterboxd rates in half stars and Rankd's scale is the same one, so a film
 * library gets all ten. Goodreads rates 1–5 in WHOLE stars only and refuses
 * everything else — `parseGoodreadsCsv` validates against that list, so a book
 * cut set that emitted halves would produce a CSV whose every row is silently
 * dropped on re-upload. Five tiers is not a simplification here; it is the
 * shape of the destination.
 */
export const BOOK_TIERS: Rating[] = [5, 4, 3, 2, 1];

export const tiersFor = (medium: string): Rating[] =>
  medium === "book" ? BOOK_TIERS : ORDERED_TIERS;

// Per medium — a cut set names a count for each tier of ONE library. See
// lib/medium.ts, and the note there about why this is a function and not a
// module-level const.
const KEY = () => keyFor("rankd-cuts-v1");

/**
 * Make a cut set sum to the library it describes.
 *
 * Total by construction rather than by validation at the call sites. A count can
 * arrive negative (a typed minus), fractional (a paste), longer or shorter than
 * the tier list (a stored set from before the medium changed), or simply not add
 * up because the library grew since it was saved. Every one of those has the
 * same right answer: keep what can be kept, in order, and let the last tier
 * carry the difference.
 *
 * The last tier is the one that absorbs it because it is the only one with
 * nothing below it to displace — flowing the remainder into a middle tier would
 * silently move every cut beneath it.
 */
export function normalise(counts: readonly number[], total: number, tiers: number): number[] {
  const out: number[] = [];
  let left = Math.max(0, Math.floor(total));
  for (let i = 0; i < tiers; i++) {
    const raw = counts[i];
    const want = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
    // Never promise more films than are left, and never leave the last tier
    // holding a count it cannot fill.
    const take = i === tiers - 1 ? left : Math.min(want, left);
    out.push(take);
    left -= take;
  }
  return out;
}

/** An even split, used as the starting cut set when there is nothing stored. */
export function evenCuts(total: number, tiers: number): number[] {
  if (tiers <= 0) return [];
  const base = Math.floor(total / tiers);
  const counts = Array.from({ length: tiers }, () => base);
  return normalise(counts, total, tiers);
}

/**
 * The index in the continuous order at which each tier starts.
 *
 * `starts[i]` is the position of the first film of tier `i`, so a tier is
 * `order.slice(starts[i], starts[i] + counts[i])`. Drawn as the cut markers.
 */
export function boundaries(counts: readonly number[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const n of counts) {
    starts.push(at);
    at += n;
  }
  return starts;
}

/**
 * "The tier starts at this film" — the long-press.
 *
 * Moving one boundary is a claim about two tiers and nothing else: the tier
 * above gains or loses the films between the old boundary and the new one, and
 * the tier below loses or gains exactly the same films. Every other count is
 * left alone, so a person adjusting the 4★ line does not find 2★ has changed
 * size underneath them.
 *
 * `tier` is an index into the cut set, not a Rating — the caller knows which
 * scale it is on. Index 0 has no boundary to move (the list starts where it
 * starts), so that is a no-op rather than an error.
 */
export function cutAt(
  counts: readonly number[],
  index: number,
  tier: number,
  total: number,
): number[] {
  const next = [...counts];
  if (tier <= 0 || tier >= next.length) return normalise(next, total, next.length);

  const starts = boundaries(next);
  const delta = index - starts[tier];
  // Take from the tier below and give to the one above, or the reverse. Clamped
  // so neither can be driven negative by a boundary dragged past its neighbour.
  const move = Math.max(-next[tier - 1], Math.min(delta, next[tier]));
  next[tier - 1] += move;
  next[tier] -= move;
  return normalise(next, total, next.length);
}

/** Which tier each position in the order falls into, as a flat lookup. */
export function tierOfIndex(counts: readonly number[], tiers: readonly Rating[]): Rating[] {
  const out: Rating[] = [];
  counts.forEach((n, i) => {
    // A cut set longer than the tier list would otherwise write `undefined` as
    // a rating, which type-checks through `Rating[]` and fails much later.
    const rating = tiers[Math.min(i, tiers.length - 1)];
    for (let k = 0; k < n; k++) out.push(rating);
  });
  return out;
}

/** A group too big to spread without two films colliding on one score. */
export interface CutOverflow {
  tier: Rating;
  count: number;
}

/** What the cuts would do, worked out before anything is written. */
export interface CutPlan {
  /** The library after the cuts, ready to hand to `onFilms`. */
  films: Film[];
  /** How many films come out with a different rating than they went in with. */
  moved: number;
  /** Groups that exceed `MAX_PER_TIER`. Non-empty means `films` is unsafe. */
  overflow: CutOverflow[];
}

/**
 * Write the cuts: every film gets the rating of the group it landed in, and a
 * score spread evenly inside that rating's band.
 *
 * ── Why the score is written too, and why that is the whole trick ──────────
 *
 * Writing only the rating would leave every film sitting at whatever score it
 * had before, inside a band it may no longer belong to — and the next respread
 * anywhere in the app would scatter the cut. Writing both, with the spread
 * following the continuous order, makes the master list AGREE with the cut:
 * `rankMap` sorts by score, bands do not overlap, and the groups were taken in
 * order, so the score sort reproduces the order the cuts were placed on. That
 * is what lets this write to the library at all.
 *
 * The spacing is deliberately identical to `writeScores` in lib/ladder.ts and
 * `respreadTier` in lib/shuffle.ts, so a tier that has been cut and one that has
 * been climbed are numerically indistinguishable.
 *
 * ── What it does NOT touch ─────────────────────────────────────────────────
 *
 * `lock`, `duels`, tags, notes, everything else. A cut is a statement about
 * position, not a per-film commitment: hard-locking 861 films because somebody
 * typed a count would put the whole library beyond the reach of every mode that
 * respects a lock, on the strength of one action.
 */
export function applyCuts(
  order: readonly Film[],
  counts: readonly number[],
  tiers: readonly Rating[],
): CutPlan {
  const normalised = normalise(counts, order.length, tiers.length);

  const overflow: CutOverflow[] = [];
  normalised.forEach((n, i) => {
    if (n > MAX_PER_TIER) overflow.push({ tier: tiers[Math.min(i, tiers.length - 1)], count: n });
  });

  const films: Film[] = [];
  let moved = 0;
  let at = 0;
  normalised.forEach((n, i) => {
    if (n === 0) return;
    const rating = tiers[Math.min(i, tiers.length - 1)];
    const mn = tierMin(rating);
    const mx = tierMax(rating);
    for (let k = 0; k < n; k++) {
      const film = order[at + k];
      if (!film) continue;
      if (film.rating !== rating) moved++;
      films.push({
        ...film,
        rating,
        score: n === 1 ? Math.round((mn + mx) / 2) : Math.round(mx - (k / (n - 1)) * (mx - mn)),
      });
    }
    at += n;
  });

  return { films, moved, overflow };
}

/** Read a stored cut set. Total, like `loadPrefs` — junk falls back to even. */
export function loadCuts(total: number, tiers: number): number[] {
  if (typeof window === "undefined") return evenCuts(total, tiers);
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return evenCuts(total, tiers);
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return evenCuts(total, tiers);
    // A stored set from a different medium has the wrong length; `normalise`
    // pads or truncates it rather than refusing, so switching to books and back
    // does not throw the film cuts away.
    return normalise(parsed as number[], total, tiers);
  } catch {
    return evenCuts(total, tiers);
  }
}

export function saveCuts(counts: readonly number[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY(), JSON.stringify(counts));
    // Same rule as `savePrefs`: if it is stored, the sync layer is told.
    markDirty();
  } catch {
    // Storage full or disabled. The cut set holds for this session, which is
    // long enough to apply it — and applying is what actually persists.
  }
}
