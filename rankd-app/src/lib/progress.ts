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
//   SHUFFLED — how much of the library has been compared at all.
//   LOCKED   — how much of it has a position, split by who decided.
//
// Pure, so the bars are testable without rendering anything.

import { isHard, isSoft } from "./lock";
import type { Judgement } from "./log";
import type { Film } from "./types";

export interface LibraryProgress {
  total: number;
  /** Films that have been in at least one recorded duel. */
  shuffled: number;
  /** Films the user committed to. */
  hard: number;
  /** Films the evidence placed. */
  soft: number;
}

/**
 * Count the library's coverage and its lock state.
 *
 * "Shuffled" deliberately counts a duel from ANY mode, not only shuffle runs. A
 * film settled by a climb has been compared just as genuinely as one settled by
 * a shuffle, and a coverage bar that ignored that would tell someone who had
 * ranked a whole tier by hand that they had done nothing.
 *
 * Films are counted once however many duels they have fought — this is breadth,
 * not volume. `duels` already answers "how much fighting", and the two are very
 * different: forty duels concentrated on four films is not broad coverage.
 */
export function libraryProgress(films: readonly Film[], log: readonly Judgement[]): LibraryProgress {
  const compared = new Set<string>();
  for (const j of log) {
    compared.add(j.a);
    compared.add(j.b);
  }

  let shuffled = 0;
  let hard = 0;
  let soft = 0;
  for (const film of films) {
    // Only films still in the library count. A judgement naming a film since
    // removed is not coverage of anything.
    if (compared.has(film.id)) shuffled++;
    if (isHard(film)) hard++;
    else if (isSoft(film)) soft++;
  }

  return { total: films.length, shuffled, hard, soft };
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
 * A count as a percentage of the library, safe on an empty one.
 *
 * Returns 0 rather than NaN when there is nothing to be a fraction of — an
 * empty library is 0% ranked, and a bar rendered with `width: NaN%` silently
 * collapses instead of failing loudly.
 */
export const pct = (n: number, total: number): number => (total > 0 ? (n / total) * 100 : 0);
