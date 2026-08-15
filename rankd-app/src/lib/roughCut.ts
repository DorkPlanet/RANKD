// Rough Cut — dealing a big tier into three piles before ranking it.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// King of the Hill costs n(n-1)/2 duels to rank a tier, because each pass
// re-derives what earlier passes established. That is fine at 20 films and
// absurd at 185: the 3★ tier alone is several thousand comparisons. Every
// gesture proposed to make it bearable — flick to bottom, lock the tail, a
// reverse climb — was a constant-factor patch on a quadratic sort.
//
// Nobody sorts a large pile of cards by comparing pairs. They deal it into rough
// piles and then refine each one. This is that: one pass over the tier, one
// decision per film, no comparisons at all. Every decision is still the user's —
// nothing is inferred and nothing is guessed.
//
// ── Why it needs no change to ladder.ts ────────────────────────────────────
//
// `poolFor` sorts the climb's pile BY SCORE, so the pile's order is score order.
// The climb is expensive precisely because that order starts arbitrary; give it
// a nearly-sorted pile and insertion sort is close to linear. So Rough Cut does
// not need a new engine, a new session type or a new lock. It writes scores. The
// climb afterwards is simply far cheaper.
//
// ── What it deliberately does NOT do ───────────────────────────────────────
//
// · It writes NO log rows. No pair was compared, so recording judgements would
//   be inventing evidence — and every belief, badge and review card in this app
//   rests on the log being literally true.
// · It sets NO lock. Saying "this is in the top third" is not the same as
//   committing to a position, so films stay UN-RNKD and still get climbed.

import { tierMax, tierMin, type Rating } from "./tiers";
import type { Film } from "./types";

export type Bucket = "top" | "middle" | "bottom";

/** Best first, matching the order the pile and the list are read in. */
export const BUCKETS: Bucket[] = ["top", "middle", "bottom"];

/**
 * Rewrite scores so each film sits in the third of its tier's band that the user
 * put it in.
 *
 * Within a third, films keep their EXISTING relative order and spread evenly
 * across the sub-band. Two things follow from that: whatever the previous duels
 * established is preserved rather than flattened, and a second pass over one
 * third refines it to ninths. That is what makes this composable instead of a
 * one-shot.
 *
 * Films with no assignment are returned untouched, so an abandoned pass keeps
 * whatever it managed to decide and loses nothing else.
 */
export function applyRoughCut(
  films: readonly Film[],
  tier: Rating,
  assignment: ReadonlyMap<string, Bucket>,
): Film[] {
  if (assignment.size === 0) return [...films];

  const lo = tierMin(tier);
  const hi = tierMax(tier);
  const third = (hi - lo) / 3;

  // Sub-bands run best-first down the band: "top" takes the highest scores.
  const bandOf = (b: Bucket): [number, number] =>
    b === "top" ? [lo + 2 * third, hi] : b === "middle" ? [lo + third, lo + 2 * third] : [lo, lo + third];

  const scores = new Map<string, number>();
  for (const bucket of BUCKETS) {
    const members = films
      .filter((f) => assignment.get(f.id) === bucket)
      .sort((a, b) => b.score - a.score);
    if (members.length === 0) continue;

    const [bLo, bHi] = bandOf(bucket);
    // Spread across the sub-band rather than stacking on its midpoint: identical
    // scores would hand the climb an arbitrary order again, which is the exact
    // thing this pass exists to fix.
    //
    // Strictly INSIDE the band, never on its edges. Adjacent bands share a
    // boundary, so spreading edge-to-edge put the worst "upper" film and the best
    // "middle" film on the same number — measured on a real pass, both landed on
    // 7667. That silently discards the only judgement the user actually made.
    // n+1 steps and interior points keep every third strictly above the next.
    const step = (bHi - bLo) / (members.length + 1);
    members.forEach((f, i) => {
      scores.set(f.id, Math.round(bHi - (i + 1) * step));
    });
  }

  return films.map((f) => (scores.has(f.id) ? { ...f, score: scores.get(f.id)! } : f));
}

/**
 * The films a pass should ask about: everything in the tier the user has not
 * already committed to.
 *
 * Hard locks are skipped — the user settled those deliberately, and a coarse
 * pass must not quietly overwrite a fine decision with a rough one. Soft locks
 * ARE included: those are the model's guesses, and the user's rough opinion
 * outranks them.
 */
/**
 * Which third of its tier each film currently sits in.
 *
 * The piles a cut made are not stored anywhere and do not need to be: a film's
 * score IS which pile it is in. So "go back to the split I did yesterday" is a
 * question about the library as it stands, not about remembered state — and it
 * survives closing the app, restoring a backup, or ranking one of the piles.
 *
 * A tier nobody has cut reads as all-middle, because that is where the seed
 * score sits. True, and harmless: the counts make it obvious there is nothing
 * to go back to.
 */
export function bandsOf(films: readonly Film[], tier: Rating): Record<Bucket, Film[]> {
  const lo = tierMin(tier);
  const third = (tierMax(tier) - lo) / 3;
  const out: Record<Bucket, Film[]> = { top: [], middle: [], bottom: [] };
  for (const f of films) {
    if (f.rating !== tier || f.lock === "hard") continue;
    const b: Bucket = f.score > lo + 2 * third ? "top" : f.score > lo + third ? "middle" : "bottom";
    out[b].push(f);
  }
  for (const b of BUCKETS) out[b].sort((a, c) => c.score - a.score);
  return out;
}

export function roughCutPool(films: readonly Film[], tier: Rating): Film[] {
  return films
    .filter((f) => f.rating === tier && f.lock !== "hard")
    .sort((a, b) => b.score - a.score);
}
