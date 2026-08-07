// What to ask next.
//
// PORTED from Nth (`lib/ranking/matchmaker.ts`) — MIT, © 2026 James Cameron. See
// THIRD-PARTY.md. Nth's version is a database query; this is a pure function over
// the local library. The selection strategy, the repetition guard, the
// exploration term and the never-deadlock fallback are all theirs and are kept
// deliberately intact — the fallback in particular is easy to lose in a rewrite
// and its absence only shows up as a mode that mysteriously stops serving pairs.
//
// Dropped from Nth: the likes/favourites biasing, which needs a signal rankd
// doesn't have. Added for rankd: scope, so a run can be aimed at everything, at
// one tier, or at a tier and its neighbours.
//
// The idea. The most useful question is the one whose answer you can least
// predict: an UNSETTLED film against an opponent it is CLOSE to. A duel between
// your #1 and your #400 teaches nothing — you already know. So the anchor is
// whichever film the model is least sure about, and its opponent is whichever
// film sits nearest it.
//
// With one exception, and it matters: near-score matching structurally cannot
// produce the comparison that catches a badly mis-rated film. A masterpiece
// stranded at 2★ only ever meets other 2★ films, all of which it beats, and
// "beat the other 2★ films" is exactly what a correctly-rated 2★ film also does.
// So a slice of pairs go deliberately long-range.

import type { Belief } from "./bayes";
import { PRIOR_SPREAD } from "./bayes";
import { isHard } from "./lock";
import type { Judgement } from "./log";
import type { Rating } from "./tiers";
import type { Film } from "./types";

/**
 * How many of the most recent judgements form the repetition guard: a pair inside
 * that window is not served again while it is there. A small fixed window rather
 * than a per-pair cooldown — enough to stop immediate repeats, and it never
 * deadlocks, because the fallback below ignores it rather than returning nothing.
 */
export const REPETITION_GUARD_WINDOW = 10;

/**
 * The share of pairs that go long-range instead of near-score. Small enough that
 * the informative default still dominates the session, large enough that a
 * mis-rated film surfaces within a sitting rather than a month.
 */
export const EXPLORATION_RATE = 0.15;

/** What a run is aimed at. */
export type Scope =
  | { kind: "all" }
  | { kind: "tier"; tier: Rating }
  | { kind: "range"; tier: Rating; below: number; above: number };

export interface MatchOptions {
  scope: Scope;
  /**
   * Let films the USER committed to into the pool. Off by default: a shuffle run
   * is usually about the hundreds of films with no position yet.
   *
   * Note what this does NOT exclude. Soft-locked films — the ones the model
   * placed itself — stay in the pool either way, because the model's own earlier
   * guess is exactly the thing it should be allowed to improve on. Excluding
   * them was the Phase 2 bug: Fast Shuffle progressively froze its own output.
   */
  includeConfirmed?: boolean;
  /** Pairs served but not yet committed, so a just-swiped pair isn't served
   * straight back while its deferred write is still pending. */
  recentlyServed?: readonly (readonly [string, string])[];
  /** Injected so tests pin exploration on or off instead of hoping. */
  shouldExplore?: () => boolean;
}

/** The films a scope admits, before the confirmed filter. */
export function inScope(films: readonly Film[], scope: Scope): Film[] {
  if (scope.kind === "all") return [...films];
  if (scope.kind === "tier") return films.filter((f) => f.rating === scope.tier);
  const low = scope.tier - scope.below;
  const high = scope.tier + scope.above;
  return films.filter((f) => f.rating >= low && f.rating <= high);
}

/** The pool a run will actually draw from. Exported so the setup sheet can show
 * the same count the run will use, rather than one computed separately and
 * drifting from it. */
export function poolFor(films: readonly Film[], opts: MatchOptions): Film[] {
  const scoped = inScope(films, opts.scope);
  return opts.includeConfirmed ? scoped : scoped.filter((f) => !isHard(f));
}

/** The unordered key for a pair, so (A,B) and (B,A) guard identically. */
const pairKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

// A film as selection reads it. A film the model has never seen reads at the wide
// prior — maximally unsettled — so fresh films are served first.
interface Candidate {
  film: Film;
  mean: number;
  spread: number;
}

const candidatesOf = (pool: readonly Film[], beliefs: Map<string, Belief>): Candidate[] =>
  pool.map((film) => {
    const b = beliefs.get(film.id);
    return { film, mean: b?.mean ?? film.rating * 2, spread: b?.spread ?? PRIOR_SPREAD };
  });

// Nearest or farthest in belief-space, skipping the anchor and any guarded pair.
// Ties break toward the LESS settled opponent, then by id, so the choice is
// deterministic — a matchmaker that picks differently on identical input is
// untestable.
function pick(
  anchor: Candidate,
  candidates: readonly Candidate[],
  guarded: ReadonlySet<string>,
  far: boolean,
): Candidate | null {
  let best: Candidate | null = null;
  let bestDistance = far ? -Infinity : Infinity;
  for (const other of candidates) {
    if (other.film.id === anchor.film.id) continue;
    if (guarded.has(pairKey(anchor.film.id, other.film.id))) continue;
    const distance = Math.abs(other.mean - anchor.mean);
    const better = far ? distance > bestDistance : distance < bestDistance;
    const tied =
      distance === bestDistance &&
      best !== null &&
      (other.spread > best.spread || (other.spread === best.spread && other.film.id < best.film.id));
    if (better || tied) {
      best = other;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The next pair to ask about, or null when there isn't one (fewer than two films
 * in the pool — a normal state, not an error).
 *
 * Never deadlocks. Anchors are tried least-settled first and each takes its
 * nearest un-guarded opponent; only if EVERY candidate pair sits inside the guard
 * window — a tiny, fully-explored pool — does it fall back and ignore the guard.
 * A pair is always returned when two films exist.
 *
 * Side-effect free: choosing a pair records nothing. The judgement is written
 * only when the user actually answers.
 */
export function nextPair(
  films: readonly Film[],
  log: readonly Judgement[],
  beliefs: Map<string, Belief>,
  opts: MatchOptions,
): [Film, Film] | null {
  const pool = poolFor(films, opts);
  if (pool.length < 2) return null;

  const candidates = candidatesOf(pool, beliefs);

  const guarded = new Set<string>();
  for (const j of log.slice(-REPETITION_GUARD_WINDOW)) guarded.add(pairKey(j.a, j.b));
  for (const [a, b] of opts.recentlyServed ?? []) guarded.add(pairKey(a, b));

  // Least settled first — the films the model knows least about are the ones
  // worth asking about. Ties by id so the order is stable.
  const anchors = [...candidates].sort(
    (a, b) => b.spread - a.spread || (a.film.id < b.film.id ? -1 : 1),
  );

  // One explore/exploit decision per serve, so exploration is a property of the
  // run rather than something the caller has to remember to ask for.
  const explore = (opts.shouldExplore ?? (() => Math.random() < EXPLORATION_RATE))();

  for (const anchor of anchors) {
    const opponent = pick(anchor, candidates, guarded, explore);
    if (opponent) return [anchor.film, opponent.film];
  }

  // Everything is guarded. Rather than serve nothing, drop the guard.
  const anchor = anchors[0];
  const opponent = pick(anchor, candidates, new Set(), explore);
  return opponent ? [anchor.film, opponent.film] : null;
}
