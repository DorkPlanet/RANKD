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
  | { kind: "range"; tier: Rating; below: number; above: number }
  // Everything one person made, whatever stars each film got. The only scope
  // that spans tiers, and the only one whose result is never written back to
  // `score` — see the note at the top of lib/people.ts for why that pairing is
  // deliberate rather than an oversight.
  | { kind: "person"; name: string; role: "director" | "actor" };

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
  /**
   * Keep this film on one side across several serves, changing only its
   * opponent — the King of the Hill shape, applied to a mode that had neither
   * a contender nor a pile.
   *
   * ── Why ────────────────────────────────────────────────────────────────
   *
   * Two reasons, and the second is the load-bearing one.
   *
   * Reading it: two unfamiliar films at once is two things to weigh before you
   * can answer. Holding one still means every answer after the first is a
   * comparison against something you have already thought about.
   *
   * Evidence: a film earns a position from duels ABOUT ITSELF, and this
   * function's default is to anchor on whichever film is least settled — a
   * DIFFERENT one almost every serve. Over a big pool that spreads evidence so
   * thin that nothing accumulates enough to be placed. Holding an anchor
   * concentrates duels where a placement actually comes from.
   *
   * Ignored when the film is not in the pool — it was placed, hard-locked,
   * filtered out by the scope, or removed — so a stale id degrades to the
   * normal least-settled behaviour rather than serving nothing.
   */
  anchorId?: string;
}

/** The films a scope admits, before the confirmed filter. */
export function inScope(films: readonly Film[], scope: Scope): Film[] {
  if (scope.kind === "all") return [...films];
  if (scope.kind === "tier") return films.filter((f) => f.rating === scope.tier);
  if (scope.kind === "person")
    return films.filter((f) =>
      scope.role === "director" ? f.director === scope.name : (f.cast ?? []).includes(scope.name),
    );
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

  // ── A held anchor is a PIN, not a queue position ────────────────────────
  //
  // It used to be moved to the front of the list and otherwise treated like any
  // other candidate, on the reasoning that falling through to the least-settled
  // ordering meant holding an anchor could never serve nothing.
  //
  // That reasoning was fine and the behaviour was not. Once the anchor had
  // faced everyone inside the repetition guard, the loop below simply moved on
  // to a DIFFERENT film — while the screen carried the held one's name and, for
  // a Refine, while the user believed they were refining one particular film.
  // Traced over a five-film pool: c, c, c, c, then a, a, a, b.
  //
  // So the pin is honoured here, in full, before anything else is considered.
  // The guard is tried first because a fresh opponent is a better duel; if
  // every pairing is guarded the guard is dropped rather than the anchor. A
  // repeated pairing is a weaker duel. Refining a film the user did not choose
  // is not a weaker anything — it is the wrong answer.
  //
  // Falling through still happens when the id is not in the pool at all, which
  // is how a stale anchor degrades safely.
  if (opts.anchorId) {
    const pinned = candidates.find((c) => c.film.id === opts.anchorId);
    if (pinned) {
      const opponent =
        pick(pinned, candidates, guarded, explore) ?? pick(pinned, candidates, new Set(), explore);
      if (opponent) return [pinned.film, opponent.film];
    }
  }

  for (const anchor of anchors) {
    const opponent = pick(anchor, candidates, guarded, explore);
    if (opponent) return [anchor.film, opponent.film];
  }

  // Everything is guarded. Rather than serve nothing, drop the guard.
  const anchor = anchors[0];
  const opponent = pick(anchor, candidates, new Set(), explore);
  return opponent ? [anchor.film, opponent.film] : null;
}
