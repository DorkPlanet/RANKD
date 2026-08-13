// How far through the library you actually are.
//
// Fast Shuffle used to say nothing about whether it was getting anywhere. You
// could swipe for ten minutes and the only number on screen was a duel counter,
// which measures effort rather than progress — it goes up whether or not the
// answers taught the model anything.
//
// Two questions worth answering, both about the WHOLE library rather than the
// current run's pool, because "how far through this am I" is a question about
// the collection and not about the session:
//
//   COMPARED — how much of the library has been in a duel at all.
//   RANKED   — how much of it has a position, split by who decided.
//
// ── These two are NOT the same number, and the names must not imply it ──────
//
// A film can be compared many times and still have no position: it earns one
// only when the evidence gets confident enough for a soft lock, or when the user
// commits to a hard one. This field was called `shuffled` and its bar was
// labelled SHUFFLED, which read as "done being sorted" — so the bar could
// legitimately show 100% while the list below was still full of UN-RNKD pills,
// and it looked like a counting bug rather than two honest measurements. The
// list says RNKD / UN-RNKD; this file and its bar now use the same words for the
// same idea, so there is one vocabulary rather than three.
//
// Pure, so the bars are testable without rendering anything.

import { isHard, isPlaced, isSoft } from "./lock";
import type { Judgement } from "./log";
import { ORDERED_TIERS, type Rating } from "./tiers";
import type { Film } from "./types";

export interface LibraryProgress {
  total: number;
  /** Films that have been in at least one recorded duel. NOT "films that are ranked". */
  compared: number;
  /** Films the user committed to. */
  hard: number;
  /** Films the evidence placed. */
  soft: number;
}

/**
 * Count the library's coverage and its lock state.
 *
 * "Compared" deliberately counts a duel from ANY mode, not only shuffle runs. A
 * film settled by a climb has been compared just as genuinely as one settled by
 * a shuffle, and a coverage bar that ignored that would tell someone who had
 * ranked a whole tier by hand that they had done nothing.
 *
 * Films are counted once however many duels they have fought — this is breadth,
 * not volume. `duels` already answers "how much fighting", and the two are very
 * different: forty duels concentrated on four films is not broad coverage.
 */
export function libraryProgress(films: readonly Film[], log: readonly Judgement[]): LibraryProgress {
  const seen = new Set<string>();
  for (const j of log) {
    seen.add(j.a);
    seen.add(j.b);
  }

  let compared = 0;
  let hard = 0;
  let soft = 0;
  for (const film of films) {
    // Only films still in the library count. A judgement naming a film since
    // removed is not coverage of anything.
    if (seen.has(film.id)) compared++;
    if (isHard(film)) hard++;
    else if (isSoft(film)) soft++;
  }

  return { total: films.length, compared, hard, soft };
}

/**
 * How far through THIS RUN's scope you are — the session bar.
 *
 * Deliberately derived from the log rather than from session state, which is
 * what makes it survive walking away. A long session interrupted by real life
 * and resumed an hour later picks up exactly where it left off, because there
 * was never any in-memory progress to lose: the bar is a question asked of the
 * evidence, and the evidence is on disk.
 *
 * `scoped` is the run's pool — pass `poolFor(films, opts)` from matchmaker.ts so
 * the denominator is precisely the films this run can serve, and the bar cannot
 * fill while work remains or stall while it does not.
 */
export function sessionProgress(
  scoped: readonly Film[],
  log: readonly Judgement[],
): { total: number; compared: number } {
  const seen = new Set<string>();
  for (const j of log) {
    seen.add(j.a);
    seen.add(j.b);
  }
  return { total: scoped.length, compared: scoped.filter((f) => seen.has(f.id)).length };
}

/**
 * The library broken down by tier — how much of each star rating has a position.
 *
 * This is the question the old library bars could not answer. "232 of 861
 * ranked" tells you there is work left; it does not tell you WHERE, so it could
 * not help you decide what to do next. Per tier it can: three stars untouched at
 * 185 films is a different afternoon from half a star untouched at fourteen.
 *
 * Every tier is returned, including empty ones. An empty tier and an unranked
 * tier are both "0 ranked" and they mean completely different things — one is
 * finished by definition and the other is the whole job — so the caller is given
 * `total` and left to say so.
 */
export interface TierSlice {
  rating: Rating;
  total: number;
  ranked: number;
}

export function tierProgress(films: readonly Film[]): TierSlice[] {
  const totals = new Map<Rating, { total: number; ranked: number }>();
  for (const t of ORDERED_TIERS) totals.set(t, { total: 0, ranked: 0 });

  for (const film of films) {
    const slot = totals.get(film.rating as Rating);
    if (!slot) continue; // a rating outside the scale is not a tier
    slot.total++;
    if (isPlaced(film)) slot.ranked++;
  }

  return ORDERED_TIERS.map((rating) => ({ rating, ...totals.get(rating)! }));
}

/**
 * The tier most worth going to next: the least-ranked one that still has films
 * in it, biggest first when two are equally unranked.
 *
 * Returns undefined when there is nothing to suggest — an empty library, or one
 * where everything is already placed. Saying nothing is correct there; inventing
 * a recommendation for a finished library is how a helpful line becomes noise.
 */
export function leastRanked(slices: readonly TierSlice[]): TierSlice | undefined {
  return slices
    .filter((s) => s.total > 0 && s.ranked < s.total)
    .sort((a, b) => a.ranked / a.total - b.ranked / b.total || b.total - a.total)[0];
}

/**
 * What you have done in THIS SITTING.
 *
 * The library bars could not do this job. At 861 films one duel moves a 204px
 * track by a quarter of a pixel, so they are static furniture while you play —
 * they report a real thing at a scale nobody can see. A sitting is small enough
 * that every duel visibly changes it, which is the whole point: the number on
 * screen should answer to what you just did.
 *
 * Derived from the log's own timestamps rather than a counter, for the same
 * reason `sessionProgress` is: there is no in-memory tally to lose, so walking
 * away and coming back does not reset or double anything. `settled` needs a
 * baseline because the log records duels, not placements — the caller snapshots
 * the hard-lock count when the sitting starts and passes it back in.
 */
export interface SessionStats {
  duels: number;
  settled: number;
}

export function sessionStats(
  log: readonly Judgement[],
  since: number,
  hardNow: number,
  hardAtStart: number,
): SessionStats {
  return {
    duels: log.filter((j) => j.t >= since).length,
    // Never negative. Withdrawing a lock mid-sitting (the advisory-only setting,
    // or a reset) would otherwise read as "-3 settled", which is not a thing.
    settled: Math.max(0, hardNow - hardAtStart),
  };
}

/**
 * A count as a percentage of the library, safe on an empty one.
 *
 * Returns 0 rather than NaN when there is nothing to be a fraction of — an
 * empty library is 0% ranked, and a bar rendered with `width: NaN%` silently
 * collapses instead of failing loudly.
 */
export const pct = (n: number, total: number): number => (total > 0 ? (n / total) * 100 : 0);
