// What the evidence thinks — the single place anything in the app reads the model.
//
// Two schedules, because the two jobs have completely different budgets:
//
//   ONLINE  (`applyJudgement`) runs on every swipe. Two films, a few microseconds.
//           Order-dependent, and it drifts.
//   BATCH   (`fitBeliefs`, via `beliefsFor`) recomputes everything from the whole
//           log. Order-INDEPENDENT, so it erases that drift — and it is the only
//           thing that can absorb a contradiction cycle.
//
// MEASURED, on the real 861-film library (see test/import.test.ts, which prints
// these): 2k judgements → 10ms · 10k → 80ms · 40k → 295ms. Comfortably an
// idle-callback job at any volume this app will reach, and there is no need to
// chunk the sweeps — a worry the plan raised that the numbers put to rest.
// Still kept off the interaction path, because 295ms in the middle of a swipe
// streak would be felt even though it is fine between them.
//
// The split is not an optimisation, it is the design: the cheap update keeps the
// swipe instant, the periodic fit keeps the answer honest.
//
// Nothing here writes storage or touches React. `beliefsFor` is pure; the idle
// scheduling lives in `beliefsWhenIdle`, which is the only impure export.

import {
  fitBeliefs,
  fitBeliefsYielding,
  updateDecisive,
  updateDraw,
  type Belief,
  type FitComparison,
  type FitEntry,
} from "./bayes";
import type { Judgement } from "./log";
import type { Film } from "./types";

export type { Belief } from "./bayes";
export { confidenceFromSpread, LARGE_MOVE_THRESHOLD } from "./bayes";

/**
 * A film's prior mean: its star rating on the model's 1–10 scale.
 *
 * This is the ONLY place stars enter the model, and it is deliberately the
 * weakest possible influence — a starting point, not a constraint. A film can be
 * driven well past its tier by enough duels (see the bayes suite). That the LIST
 * still refuses to let it cross a tier band is a separate, deliberate decision
 * made in shuffle.ts, not something the model believes.
 */
export const seedOf = (film: Film): number => film.rating * 2;

const toEntries = (films: readonly Film[]): FitEntry[] =>
  films.map((f) => ({ id: f.id, seed: seedOf(f) }));

const toComparisons = (log: readonly Judgement[]): FitComparison[] =>
  log.map((j) => ({ aId: j.a, bId: j.b, outcome: j.o }));

/**
 * Every film's belief, fitted from the whole log. Pure, and expensive — see the
 * warning on `fitBeliefs`. Callers on an interaction path want `beliefsWhenIdle`
 * or the cached `lastBeliefs`, not this.
 */
export function beliefsFor(films: readonly Film[], log: readonly Judgement[]): Map<string, Belief> {
  return fitBeliefs(toEntries(films), toComparisons(log));
}

/**
 * Fold one fresh judgement into an existing belief map, cheaply — the per-swipe
 * path. Returns a NEW map; the input is not mutated, so a caller holding the old
 * one still sees what it saw.
 *
 * This drifts, by design: applying the same judgements in a different order gives
 * a slightly different answer. That is the price of an instant swipe, and it is
 * what the batch fit exists to clean up.
 */
export function applyJudgement(
  beliefs: Map<string, Belief>,
  judgement: Judgement,
  fallback: (id: string) => Belief,
): Map<string, Belief> {
  const a = beliefs.get(judgement.a) ?? fallback(judgement.a);
  const b = beliefs.get(judgement.b) ?? fallback(judgement.b);
  const next = new Map(beliefs);
  if (judgement.o === "draw") {
    const out = updateDraw(a, b);
    next.set(judgement.a, out.a);
    next.set(judgement.b, out.b);
  } else {
    const [winner, loser] = judgement.o === "a" ? [a, b] : [b, a];
    const [winnerId, loserId] = judgement.o === "a" ? [judgement.a, judgement.b] : [judgement.b, judgement.a];
    const out = updateDecisive(winner, loser);
    next.set(winnerId, out.winner);
    next.set(loserId, out.loser);
  }
  return next;
}

// ── The idle schedule ───────────────────────────────────────────────────
//
// One cache, keyed on what would actually change the answer: which films exist
// and how many judgements there are. A film's star rating changing also changes
// its seed, so that is folded into the key too — cheaply, by summing.

interface Cached {
  key: string;
  beliefs: Map<string, Belief>;
}

let cached: Cached | null = null;
let inFlight: Promise<Map<string, Belief>> | null = null;

const keyFor = (films: readonly Film[], log: readonly Judgement[]): string =>
  `${films.length}:${log.length}:${films.reduce((n, f) => n + f.rating, 0)}`;

/** The last fit, if one has been computed for this exact library and log. Never
 * triggers work — for a caller that wants a number now or not at all. */
export function lastBeliefs(films: readonly Film[], log: readonly Judgement[]): Map<string, Belief> | null {
  return cached && cached.key === keyFor(films, log) ? cached.beliefs : null;
}

// requestIdleCallback isn't in Safari before 17 and isn't typed in our lib set,
// so this is the one place the fallback lives.
type IdleFn = (cb: () => void) => void;
const onIdle: IdleFn = (cb) => {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (ric) ric(cb, { timeout: 2000 });
  else setTimeout(cb, 1);
};

/**
 * The batch fit, run when the browser is idle and cached. Concurrent callers
 * share one computation rather than each starting their own — with 828 films
 * that difference is visible.
 *
 * Deliberately NOT a hook and NOT awaited by anything on the swipe path: a
 * caller asks for this, keeps rendering whatever it already had, and updates when
 * the answer arrives.
 */
export function beliefsWhenIdle(
  films: readonly Film[],
  log: readonly Judgement[],
): Promise<Map<string, Belief>> {
  const key = keyFor(films, log);
  if (cached && cached.key === key) return Promise.resolve(cached.beliefs);
  if (inFlight) return inFlight;
  // ── Sliced, and warm-started from the last answer ─────────────────────────
  //
  // This used to be one synchronous `beliefsFor` inside the idle callback, and
  // that was the Fast Shuffle seize. Measured on an 821-film library: a fit over
  // a 5,000-judgement log is ~80ms on a desktop and climbs with the log — 24
  // sweeps at a thousand judgements, 145 at five thousand. Four or five times
  // that on a phone, every twelve answers, with the main thread shut.
  //
  // `onIdle` made it worse rather than better: somebody swiping continuously
  // never produces idle time, so the callback was deferred to its 2000ms timeout
  // and then landed mid-gesture.
  //
  // Two changes, and neither alters the answer. The previous beliefs are handed
  // in as a starting point — the objective is strictly concave, so the maximum is
  // the same and only the route to it is shorter. And the sweeps are sliced, so
  // the thread comes back between them.
  const previous = cached?.beliefs;
  inFlight = new Promise<Map<string, Belief>>((resolve) => {
    onIdle(() => {
      void fitBeliefsYielding(toEntries(films), toComparisons(log), previous).then((beliefs) => {
        cached = { key, beliefs };
        inFlight = null;
        resolve(beliefs);
      });
    });
  });
  return inFlight;
}
