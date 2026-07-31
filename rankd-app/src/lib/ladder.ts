// The ranking engine — full head-to-head climb with confirm-to-commit.
//
// Every film goes head-to-head in a bottom-up climb: the contender duels the
// film directly above it; a win swaps it up and it keeps climbing; a loss hands
// the climb to the winner (the running-best sweeps to the top). Whoever reaches
// the top is confirmed by the user and joins the ranked shelf; the climb then
// restarts from the bottom. The ONLY committed data is a confirmed position —
// the in-between shuffle records nothing (no comparison log, no inference).

import type { Film, PlacementSession, RankState } from "./types";
import { tierMin, tierMax } from "./tiers";

const clone = (films: Film[]): Film[] => films.map((f) => ({ ...f }));

// The master ranking — best first (by derived score).
export function rankedFilms(films: Film[]): Film[] {
  return [...films].sort((a, b) => b.score - a.score);
}

// 1-indexed overall rank of a film in the master order.
export function overallRank(films: Film[], id: string): number {
  return rankedFilms(films).findIndex((f) => f.id === id) + 1;
}

function poolFor(films: Film[], tier: number, maxDiff: number): Film[] {
  return films.filter((f) => Math.abs(f.rating - tier) <= maxDiff);
}

// Recompute the challenger + needsConfirm from where the contender sits.
// index 0 = top of the pile, so "above" = a smaller index.
function refresh(s: PlacementSession): void {
  const ci = s.unconfirmed.indexOf(s.contenderId);
  if (ci <= 0) {
    s.needsConfirm = ci === 0; // at the top → confirm (ci === -1 shouldn't happen)
    s.challengerId = "";
  } else {
    s.needsConfirm = false;
    s.challengerId = s.unconfirmed[ci - 1];
  }
}

// Spread the tier's films across its score band in [...confirmed, ...unconfirmed]
// order, so the master ranking reflects the current standing. Written on confirm.
function writeScores(films: Film[], s: PlacementSession): void {
  const order = [...s.confirmed, ...s.unconfirmed]; // best → worst
  const n = order.length;
  const mn = tierMin(s.tier);
  const mx = tierMax(s.tier);
  order.forEach((id, i) => {
    const f = films.find((ff) => ff.id === id);
    if (f) f.score = n === 1 ? Math.round((mn + mx) / 2) : Math.round(mx - (i / (n - 1)) * (mx - mn));
  });
}

// ── Public API ──────────────────────────────────────────────────────────

// Start placing the given tier. Throws if there aren't enough films (fail fast).
export function startRun(films: Film[], tier: PlacementSession["tier"], maxDiff = 0): RankState {
  const f = clone(films);
  const pool = poolFor(f, tier, maxDiff);
  if (pool.length < 2) throw new Error("Need at least 2 films in range to start ranking");
  const unconfirmed = pool.map((p) => p.id);
  const s: PlacementSession = {
    tier,
    maxDiff,
    confirmed: [],
    unconfirmed,
    contenderId: unconfirmed[unconfirmed.length - 1], // bottom
    challengerId: "",
    needsConfirm: false,
  };
  refresh(s);
  return { films: f, session: s };
}

// The current duel: contender vs the film directly above it. null while a film
// is awaiting confirmation (use pendingConfirm) or when there's no session.
export function getPair(state: RankState): { contender: Film; opponent: Film } | null {
  const { films, session } = state;
  if (!session || session.needsConfirm || !session.challengerId) return null;
  const contender = films.find((f) => f.id === session.contenderId);
  const opponent = films.find((f) => f.id === session.challengerId);
  if (!contender || !opponent) return null;
  return { contender, opponent };
}

// The film sitting at the top of the pile, awaiting the user's confirm.
export function pendingConfirm(state: RankState): Film | null {
  const { films, session } = state;
  if (!session || !session.needsConfirm) return null;
  return films.find((f) => f.id === session.contenderId) ?? null;
}

// Apply a duel result: winnerId is whichever poster the player tapped.
export function choose(state: RankState, winnerId: string): RankState {
  const { session } = state;
  if (!session || session.needsConfirm) return state;
  const films = clone(state.films);
  const s: PlacementSession = { ...session, unconfirmed: [...session.unconfirmed] };
  const ci = s.unconfirmed.indexOf(s.contenderId);
  const chi = ci - 1;
  if (chi < 0) return state; // nothing above — shouldn't be dueling
  if (winnerId === s.contenderId) {
    // contender beats the film above → swap up, keep climbing
    [s.unconfirmed[ci], s.unconfirmed[chi]] = [s.unconfirmed[chi], s.unconfirmed[ci]];
  } else {
    // the film above wins → it becomes the contender and keeps climbing
    // (no swap: the winner already sits above the loser)
    s.contenderId = s.unconfirmed[chi];
  }
  refresh(s);
  return { films, session: s };
}

// Lock the top film into the ranked shelf, then restart the climb from the
// bottom. Returns a null session when the whole tier is placed.
export function confirm(state: RankState): RankState {
  const { session } = state;
  if (!session || !session.needsConfirm) return state;
  const films = clone(state.films);
  const s: PlacementSession = {
    ...session,
    confirmed: [...session.confirmed],
    unconfirmed: [...session.unconfirmed],
  };
  const championId = s.unconfirmed.shift(); // the top of the pile
  if (championId) {
    s.confirmed.push(championId);
    const champ = films.find((f) => f.id === championId);
    if (champ) champ.confirmed = true;
  }
  writeScores(films, s);
  if (s.unconfirmed.length === 0) return { films, session: null }; // tier fully placed
  s.contenderId = s.unconfirmed[s.unconfirmed.length - 1]; // restart from the bottom
  refresh(s);
  return { films, session: s };
}

// Fast-forward: send an unconfirmed film to the top of the pile. If it's the
// current contender, it's now at the top → awaiting confirm. Commits nothing.
export function flickToTop(state: RankState, filmId: string): RankState {
  const { session } = state;
  if (!session) return state;
  const idx = session.unconfirmed.indexOf(filmId);
  if (idx < 0) return state; // not an unconfirmed film
  const films = clone(state.films);
  const unconfirmed = [...session.unconfirmed];
  unconfirmed.splice(idx, 1);
  unconfirmed.unshift(filmId);
  const s: PlacementSession = { ...session, unconfirmed };
  refresh(s);
  return { films, session: s };
}

// "Jump to top" button — flick the current contender up.
export function jumpToTop(state: RankState): RankState {
  if (!state.session) return state;
  return flickToTop(state, state.session.contenderId);
}

// Rolodex scrub — the fatigue shortcut, in both directions. Move the contender
// to sit directly beneath `filmId`, so that film becomes its very next duel and
// everything in between is skipped outright.
//
// One rule covers both: scrub UP and the contender leaps past the films it
// clears; scrub DOWN and it drops past the films that beat it, landing under a
// weaker opponent. Either way it ends up directly below the target and duels it,
// so the climb resumes from a neighbourhood that already feels about right.
//
// This is a user assertion ("I know this belongs around here"), not an
// inference: the player supplies the ordering directly rather than earning it a
// duel at a time, exactly as flickToTop does. Nothing is committed — only a
// confirm does that. Repositioning (rather than merely re-aiming the displayed
// opponent) keeps the climb strictly adjacent, so what the duel shows and what
// choose() resolves can never disagree.
export function skipToFilm(state: RankState, filmId: string): RankState {
  const { session } = state;
  if (!session) return state;
  const ci = session.unconfirmed.indexOf(session.contenderId);
  const ti = session.unconfirmed.indexOf(filmId);
  if (ti < 0 || ti === ci) return state; // unknown film, or the contender itself
  const films = clone(state.films);
  const unconfirmed = [...session.unconfirmed];
  unconfirmed.splice(ci, 1); // lift the contender out
  // Lifting it shifts everything below its old slot up by one, so a target that
  // sat below the contender is now one index lower than it was.
  const targetIdx = ti < ci ? ti : ti - 1;
  unconfirmed.splice(targetIdx + 1, 0, session.contenderId); // drop it just below the target
  const s: PlacementSession = { ...session, unconfirmed };
  refresh(s);
  return { films, session: s };
}
