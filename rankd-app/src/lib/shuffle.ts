// Turning what the evidence thinks into where a film actually sits.
//
// Two jobs, both narrow on purpose:
//
//   SCORES — project beliefs into rankd's tier bands.
//   RANKS  — decide when a film has been duelled enough to claim a number.
//
// The projection problem, and why it is not arithmetic. Beliefs live on a 1–10
// scale and can be driven anywhere by enough evidence; rankd's scores live in
// hard, non-overlapping bands (4★ owns 7001–8000). Mapping one onto the other
// with a formula means a clamp, and a clamp is a rule you have to remember to
// apply everywhere. Instead a tier is RE-SPREAD across its own band in belief
// order — the same thing `writeScores` in ladder.ts already does on a confirm.
// Band containment then falls out of the construction: there is no expression
// anywhere in this file that could produce a score outside a film's own band, so
// a 3★ cannot outrank a 4★ no matter what the duels say.
//
// That is the deliberate limit on the model's authority. Cross-tier evidence is
// still recorded and still surfaces — as a promotion suggestion, for the user to
// accept — but it never moves a film across a star boundary on its own.

import { confidenceFromSpread, type Belief } from "./bayes";
import { seedOf } from "./beliefs";
import { isHard, isPlaced, isSoft } from "./lock";
import { tierMax, tierMin } from "./tiers";
import type { Film } from "./types";

/**
 * How settled a film must be before it claims a number in the list.
 *
 * CALIBRATED, not guessed — see test/calibration.test.ts, which simulates real
 * sessions and prints the numbers. What it found:
 *
 *   ~1 duel per film   → nothing placed. Correct: one duel is not an opinion.
 *   ~10 duels per film → everything placed, median confidence 0.73.
 *
 * And the constraint that actually pins this value: confidence SATURATES around
 * 0.72–0.73. It cannot climb further because the matchmaker stops asking about
 * films it has already settled, so they stop tightening. A threshold anywhere
 * near 0.8 would therefore place nothing, ever, no matter how long anyone
 * swiped — which would look exactly like a broken feature rather than a strict
 * one. 0.5 sits clearly below that ceiling and clearly above trivial evidence.
 *
 * Beware the obvious misreading of "confidence": it measures how precisely the
 * evidence LOCATES a film, not how much that evidence agrees with itself.
 * Contradictory duels between close films are informative — they establish the
 * pair as adjacent — so they raise confidence rather than lowering it. That is
 * right, but it means this threshold is not a filter for "the user was
 * consistent about this one".
 */
export const PLACE_CONFIDENCE = 0.5;

const meanOf = (film: Film, beliefs: Map<string, Belief>): number =>
  beliefs.get(film.id)?.mean ?? seedOf(film);

/**
 * Re-spread one tier across its band, in the order the evidence believes.
 *
 * `movePlaced` is the run's tickbox, and it governs HARD locks only. When false —
 * the default — films the user committed to keep their existing ORDER exactly:
 * they are pinned in sequence and everything else is merged in around them by
 * belief. Their scores may still be rewritten (the whole band is re-spread, as it
 * already is on every confirm), but a placement the user made never changes
 * position without being asked. When true, the user opted in and the tier is
 * simply sorted by belief.
 *
 * SOFT locks are never pinned, whatever the tickbox says. Pinning them was the
 * Phase 2 bug: a film crossed the confidence threshold on the model's earliest
 * and weakest estimate, and that estimate then outlived every better one the
 * model formed afterwards. The model must always be free to improve on itself.
 */
export function respreadTier(
  films: readonly Film[],
  tier: number,
  beliefs: Map<string, Belief>,
  movePlaced: boolean,
): Film[] {
  const inTier = films.filter((f) => f.rating === tier);
  if (inTier.length === 0) return [...films];

  const byBelief = (a: Film, b: Film) => meanOf(b, beliefs) - meanOf(a, beliefs) || a.id.localeCompare(b.id);

  let ordered: Film[];
  if (movePlaced) {
    ordered = [...inTier].sort(byBelief);
  } else {
    // Pinned films hold their current sequence; everything else is merged in by
    // belief. A plain sort would have reordered the pinned ones against each
    // other, which is precisely what the tickbox being off promises not to do.
    const pinned = inTier.filter(isHard).sort((a, b) => b.score - a.score);
    const movable = inTier.filter((f) => !isHard(f)).sort(byBelief);
    ordered = [];
    let i = 0;
    let j = 0;
    while (i < pinned.length && j < movable.length) {
      if (meanOf(movable[j], beliefs) > meanOf(pinned[i], beliefs)) ordered.push(movable[j++]);
      else ordered.push(pinned[i++]);
    }
    ordered.push(...pinned.slice(i), ...movable.slice(j));
  }

  // Evenly across the band, best first. Identical to writeScores' spacing, so a
  // tier that has been through a shuffle and one that has been through a climb
  // are numerically indistinguishable — as they should be.
  const mn = tierMin(tier);
  const mx = tierMax(tier);
  const n = ordered.length;
  const scores = new Map<string, number>();
  ordered.forEach((f, i) => {
    scores.set(f.id, n === 1 ? Math.round((mn + mx) / 2) : Math.round(mx - (i / (n - 1)) * (mx - mn)));
  });

  return films.map((f) => (scores.has(f.id) ? { ...f, score: scores.get(f.id)! } : f));
}

/**
 * Re-spread every tier a set of films belongs to. The entry point after a duel:
 * pass the two films that were judged and only their bands are rewritten.
 */
export function respreadFor(
  films: readonly Film[],
  touched: readonly Film[],
  beliefs: Map<string, Belief>,
  movePlaced: boolean,
): Film[] {
  const tiers = new Set(touched.map((f) => f.rating));
  let out = [...films];
  for (const tier of tiers) out = respreadTier(out, tier, beliefs, movePlaced);
  return out;
}

/**
 * Grant a SOFT lock to any film the evidence has settled — a number in the list
 * that says "the model worked this one out", as distinct from one the user
 * committed to.
 *
 * Never touches a film that already has a lock. A hard lock is the user's
 * decision and the model does not get to take it back or restate it; a film
 * already soft-locked simply stays soft-locked, and its POSITION keeps improving
 * through `respreadTier` rather than through this flag.
 *
 * Nothing here ever downgrades or revokes. A soft lock, once granted, is
 * withdrawn only by turning the model off (see `advisoryOnly`) — which keeps the
 * list stable instead of letting ranks flicker as beliefs wobble.
 */
export function placeSettled(
  films: readonly Film[],
  beliefs: Map<string, Belief>,
  threshold = PLACE_CONFIDENCE,
): Film[] {
  return films.map((f) => {
    if (isPlaced(f)) return f;
    const belief = beliefs.get(f.id);
    if (!belief) return f;
    return confidenceFromSpread(belief.spread) >= threshold ? { ...f, lock: "soft" as const } : f;
  });
}

/**
 * Withdraw every soft lock, leaving hard locks untouched — what the advisory-only
 * setting does when the user turns the model's authority off.
 *
 * Safe precisely because the two are distinguishable: the model's placements come
 * out, the user's stay. The evidence log is not touched, so switching back on
 * restores everything from the same duels rather than starting over.
 */
export function withdrawSoftLocks(films: readonly Film[]): Film[] {
  return films.map((f) => {
    if (!isSoft(f)) return f;
    const withdrawn = { ...f };
    delete withdrawn.lock;
    return withdrawn;
  });
}

/** How settled a film is, 0–1, for display. A film with no belief yet reads 0. */
export function confidenceOf(film: Film, beliefs: Map<string, Belief>): number {
  const belief = beliefs.get(film.id);
  return belief ? confidenceFromSpread(belief.spread) : 0;
}
