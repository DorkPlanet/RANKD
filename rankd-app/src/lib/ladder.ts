// The ranking engine — insertion placement with skip + binary settle.
// Ported from the prototype's ladder logic (rankd.html), rewritten as pure,
// DOM-free functions that take state and return new state (React-friendly).
//
// A placement run inserts one contender among the films ABOVE it in stable
// order. Normal play tests the next film up (a climb); a skip tests N up at
// once; a loss after a skip caps hi so the window bisects and always settles
// back DOWN. Scores only move at settle, spread evenly per-tier so every
// placement is an exact, tie-proof reorder.
//
// NOTE: still uses the prototype's hard-lock model (rankLocked + freeze score
// at settle). The soft/provisional-placement rework is task #5.

import type { Film, PlacementRun, RankState } from "./types";
import { TIER_RANGE } from "./tiers";

const cloneFilms = (films: Film[]): Film[] => films.map((f) => ({ ...f }));

// Deterministic total order even among score ties: score asc, then id.
export function stableOrder(pool: Film[]): Film[] {
  return [...pool].sort(
    (a, b) => a.score - b.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

// The master ranking — best first.
export function rankedFilms(films: Film[]): Film[] {
  return [...films].sort((a, b) => b.score - a.score);
}

// 1-indexed overall rank of a film in the master order.
export function overallRank(films: Film[], filmId: string): number {
  return rankedFilms(films).findIndex((f) => f.id === filmId) + 1;
}

function poolFor(films: Film[], run: PlacementRun): Film[] {
  return films.filter((f) => Math.abs(f.rating - run.tier) <= run.maxDiff);
}

// Films ranked above the contender within its pool (in stable order).
function aboveOf(films: Film[], run: PlacementRun): Film[] {
  const ordered = stableOrder(poolFor(films, run));
  const ci = ordered.findIndex((f) => f.id === run.filmId);
  return ci === -1 ? [] : ordered.slice(ci + 1);
}

// Lowest-ranked film in the pool that hasn't locked yet.
function nextClimber(pool: Film[]): Film | null {
  return stableOrder(pool).filter((f) => !f.rankLocked)[0] ?? null;
}

// Which film above the contender to test next (index into aboveOf()).
// -1 means the window has collapsed — the contender has found its slot.
export function probeIndex(run: PlacementRun): number {
  if (run.lo >= run.hi) return -1;
  if (run.skipN > 0) return Math.min(run.hi - 1, run.lo + run.skipN - 1); // skip
  if (run.capped) return run.lo + Math.floor((run.hi - 1 - run.lo) / 2); // settle
  return run.lo; // climb one
}

function initContender(films: Film[], run: PlacementRun, filmId: string): PlacementRun {
  const r: PlacementRun = { ...run, filmId, lo: 0, hi: 0, capped: false, streak: 0, skipN: 0 };
  r.hi = aboveOf(films, r).length;
  return r;
}

// Even-spaces each tier's films across its own score band, preserving order and
// keeping every score valid for its tier. Mutates the passed film objects.
function redistribute(ordered: Film[]): void {
  const byRating: Record<number, Film[]> = {};
  for (const f of ordered) (byRating[f.rating] ??= []).push(f);
  for (const key of Object.keys(byRating)) {
    const grp = byRating[Number(key)];
    const [mn, mx] = TIER_RANGE[Number(key)] ?? TIER_RANGE[0.5];
    const n = grp.length;
    grp.forEach((f, i) => {
      f.score = n === 1 ? Math.round((mn + mx) / 2) : Math.round(mn + (i / (n - 1)) * (mx - mn));
    });
  }
}

// Advance to the next-lowest unlocked climber, auto-locking any film that has
// nothing above it (it's the tier top). Returns null when the tier is done.
function advanceToNextClimber(films: Film[], base: PlacementRun): PlacementRun | null {
  let next = nextClimber(poolFor(films, base));
  let r = base;
  while (next) {
    r = initContender(films, r, next.id);
    if (r.hi > 0) return r; // has opponents above — ready to play
    const nf = films.find((f) => f.id === next!.id);
    if (nf) nf.rankLocked = true; // nothing above — it's the tier top
    next = nextClimber(poolFor(films, r));
  }
  return null;
}

// Lock the contender at its found slot (lo), redistribute, then advance.
function settleAndAdvance(films: Film[], run: PlacementRun): PlacementRun | null {
  const contender = films.find((f) => f.id === run.filmId);
  if (contender) {
    const ordered = stableOrder(poolFor(films, run));
    const ci = ordered.findIndex((f) => f.id === contender.id);
    if (ci !== -1) {
      ordered.splice(ci, 1);
      ordered.splice(ci + run.lo, 0, contender);
      const idx = ordered.indexOf(contender);
      const below = ordered[idx - 1];
      const above = ordered[idx + 1];
      if (below && below.rating !== contender.rating) contender.rating = below.rating;
      else if (above && above.rating !== contender.rating) contender.rating = above.rating;
      redistribute(ordered);
    }
    contender.rankLocked = true;
  }
  return advanceToNextClimber(films, run);
}

// ── Public API ──────────────────────────────────────────────────────────

// Start placing the given tier. Throws if there aren't enough films (fail fast).
export function startRun(films: Film[], tier: PlacementRun["tier"], maxDiff = 0): RankState {
  const f = cloneFilms(films);
  const base: PlacementRun = { tier, maxDiff, filmId: "", lo: 0, hi: 0, capped: false, streak: 0, skipN: 0 };
  if (poolFor(f, base).length < 2) throw new Error("Need at least 2 films in range to start ranking");
  return { films: f, run: advanceToNextClimber(f, base) };
}

// The current duel: contender (left) vs the film it's testing (right).
// null when there's nothing to compare (window collapsed or no run).
export function getPair(state: RankState): { contender: Film; opponent: Film } | null {
  const { films, run } = state;
  if (!run) return null;
  const contender = films.find((f) => f.id === run.filmId);
  if (!contender) return null;
  const above = aboveOf(films, run);
  const j = probeIndex(run);
  if (j < 0 || j >= above.length) return null;
  return { contender, opponent: above[j] };
}

// Apply a decision: winnerId is whichever poster the player tapped.
export function choose(state: RankState, winnerId: string): RankState {
  const { run } = state;
  if (!run) return state;
  const films = cloneFilms(state.films);
  const above = aboveOf(films, run);
  const j = probeIndex(run);
  if (j < 0 || j >= above.length) return { films, run: settleAndAdvance(films, run) };

  const contenderWon = winnerId === run.filmId;
  const r: PlacementRun = { ...run };
  if (contenderWon) {
    r.lo = j + 1;
    r.streak++;
    r.skipN = 0;
  } else {
    r.hi = j;
    r.capped = true;
    r.streak = 0;
    r.skipN = 0;
  }
  if (r.lo >= r.hi) return { films, run: settleAndAdvance(films, r) };
  return { films, run: r };
}

// Set the next probe to jump N films up (the tactile "skip ahead").
export function skip(state: RankState, n: number): RankState {
  if (!state.run) return state;
  return { ...state, run: { ...state.run, skipN: Math.max(1, n) } };
}

// Aim the next probe at a specific film above the contender — the rolodex
// scrub. Returns state unchanged if the film isn't a valid target (it's below
// the contender or already beaten). Only touches run.skipN, not the films.
export function skipToFilm(state: RankState, filmId: string): RankState {
  const { run } = state;
  if (!run) return state;
  const k = aboveOf(state.films, run).findIndex((f) => f.id === filmId);
  if (k < 0 || k < run.lo) return state;
  return skip(state, k - run.lo + 1);
}
