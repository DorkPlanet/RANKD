// The ranking engine — full head-to-head climb with confirm-to-commit.
//
// Every film goes head-to-head in a bottom-up climb: the contender duels the
// film directly above it; a win swaps it up and it keeps climbing; a loss hands
// the climb to the winner (the running-best sweeps to the top). Whoever reaches
// the top is confirmed by the user and joins the ranked shelf; the climb then
// restarts from the bottom. The ONLY committed data is a confirmed position —
// the in-between shuffle records nothing (no comparison log, no inference).

import type { Film, PlacementSession, RankState } from "./types";
import { tierMin, tierMax, tierAbove, type Rating } from "./tiers";

const clone = (films: Film[]): Film[] => films.map((f) => ({ ...f }));

// The master ranking — best first (by derived score).
export function rankedFilms(films: Film[]): Film[] {
  return [...films].sort((a, b) => b.score - a.score);
}

// 1-indexed overall rank of a film in the master order.
export function overallRank(films: Film[], id: string): number {
  return rankedFilms(films).findIndex((f) => f.id === id) + 1;
}

// Best first, so the pile starts as the standing we already believe. Ordering it
// this way is what makes the climb short: a film meets progressively stronger
// opponents rather than an arbitrary sequence.
function poolFor(films: Film[], tier: number, below: number, above: number): Film[] {
  return films
    .filter((f) => f.rating >= tier - below && f.rating <= tier + above)
    .sort((a, b) => b.score - a.score);
}

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

// Spread the run's films across their score bands in [...confirmed,
// ...unconfirmed] order, so the master ranking reflects the current standing.
//
// Grouped BY RATING, because each star tier owns its own non-overlapping band.
// A cross-tier run holds films of several ratings, and spreading them all across
// one tier's band would hand a 3.5★ film a 4★ score — silently corrupting the
// master order for every film the run touched. Each rating keeps its own band;
// the run only decides the order within it.
function writeScores(films: Film[], s: PlacementSession): void {
  const order = [...s.confirmed, ...s.unconfirmed]; // best → worst overall
  const byRating = new Map<number, string[]>();
  for (const id of order) {
    const f = films.find((ff) => ff.id === id);
    if (!f) continue;
    byRating.set(f.rating, [...(byRating.get(f.rating) ?? []), id]);
  }
  for (const [rating, ids] of byRating) {
    const mn = tierMin(rating);
    const mx = tierMax(rating);
    const n = ids.length;
    ids.forEach((id, i) => {
      const f = films.find((ff) => ff.id === id);
      if (f) f.score = n === 1 ? Math.round((mn + mx) / 2) : Math.round(mx - (i / (n - 1)) * (mx - mn));
    });
  }
}

// ── Public API ──────────────────────────────────────────────────────────

// Start placing the given tier. Throws if there aren't enough films (fail fast).
export function startRun(
  films: Film[],
  tier: PlacementSession["tier"],
  {
    below = 0,
    above = 0,
    shuffle = false,
  }: { below?: number; above?: number; shuffle?: boolean } = {},
): RankState {
  const f = clone(films);
  const pool = poolFor(f, tier, below, above);
  if (pool.length < 2) throw new Error("Need at least 2 films in range to start ranking");
  const ids = pool.map((p) => p.id);
  const unconfirmed = shuffle ? shuffled(ids) : ids;
  const s: PlacementSession = {
    tier,
    spanBelow: below,
    spanAbove: above,
    mode: "koth",
    confirmed: [],
    unconfirmed,
    contenderId: unconfirmed[unconfirmed.length - 1], // bottom
    challengerId: "",
    needsConfirm: false,
  };
  refresh(s);
  return { films: f, session: s };
}

// Spotlight — re-place ONE film. It drops to the bottom of its own tier so every
// peer sits above it and it can climb to any slot, then the run ends the moment
// it settles rather than rolling on to the next climber. Its original score is
// kept so abandoning restores it: starting a spotlight moves a film before it
// has earned anything, and walking away shouldn't cost it its place.
export function startSpotlight(
  films: Film[],
  filmId: string,
  { shuffle = false }: { shuffle?: boolean } = {},
): RankState {
  const f = clone(films);
  const subject = f.find((x) => x.id === filmId);
  if (!subject) throw new Error("No such film");
  const tier = subject.rating;
  const pool = poolFor(f, tier, 0, 0);
  if (pool.length < 2) throw new Error(`No other ${tier}★ films to place against`);

  const others = pool.filter((p) => p.id !== filmId).map((p) => p.id);
  const unconfirmed = [...(shuffle ? shuffled(others) : others), filmId]; // subject last = bottom
  const s: PlacementSession = {
    tier,
    spanBelow: 0,
    spanAbove: 0,
    mode: "spotlight",
    subjectId: filmId,
    origScore: subject.score,
    origRating: subject.rating,
    confirmed: [],
    unconfirmed,
    contenderId: filmId,
    challengerId: "",
    needsConfirm: false,
  };
  refresh(s);
  return { films: f, session: s };
}

// Put a spotlit film back as it was. Abandoning a run must cost nothing.
export function abandonSpotlight(state: RankState): RankState {
  const { session } = state;
  if (!session || session.mode !== "spotlight" || !session.subjectId) return { ...state, session: null };
  const films = clone(state.films);
  const subject = films.find((f) => f.id === session.subjectId);
  if (subject) {
    if (session.origScore !== undefined) subject.score = session.origScore;
    if (session.origRating !== undefined) subject.rating = session.origRating;
  }
  return { films, session: null };
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
//
// The challenger is usually the film directly above, but a rolodex scrub can aim
// at a distant one. Either way the outcome is the same shape: the contender ends
// up immediately above the film it beat, or immediately below the film that beat
// it. Any distance the scrub covered collapses HERE, at the duel — the pile is
// never reordered while the player is merely looking around.
export function choose(state: RankState, winnerId: string): RankState {
  const { session } = state;
  if (!session || session.needsConfirm) return state;
  const films = clone(state.films);
  const s: PlacementSession = { ...session, unconfirmed: [...session.unconfirmed] };
  const ci = s.unconfirmed.indexOf(s.contenderId);
  const chi = s.unconfirmed.indexOf(s.challengerId);
  if (ci < 0 || chi < 0) return state; // no valid opponent — shouldn't be dueling

  s.unconfirmed.splice(ci, 1); // lift the contender out
  // Removing it shifts everything below its old slot up one, so a challenger
  // that sat below the contender is now one index lower.
  const target = ci < chi ? chi - 1 : chi;
  if (winnerId === s.contenderId) {
    s.unconfirmed.splice(target, 0, s.contenderId); // winner takes the loser's place
  } else {
    s.unconfirmed.splice(target + 1, 0, s.contenderId); // drop in beneath the winner
    s.contenderId = s.challengerId; // the winner carries the climb on
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
  // A spotlight places one film and stops. A full run would hand off to the next
  // climber here; a spotlight has nothing further to place.
  if (s.mode === "spotlight") return { films, session: null };
  if (s.unconfirmed.length === 0) return { films, session: null }; // tier fully placed
  s.contenderId = s.unconfirmed[s.unconfirmed.length - 1]; // restart from the bottom
  refresh(s);
  return { films, session: s };
}

// ── Tier promotion (spotlight only) ─────────────────────────────────────
//
// The only route by which a film's star rating ever changes. Two ways up,
// mirroring the earn-it / assert-it pairing used everywhere else in the app:
// beat the weakest films of the tier above, or flick past them.

const PROMOTION_OPPONENTS = 3;

// Is the spotlit film sitting on top of its tier with somewhere left to go?
export function promotionTarget(state: RankState): Rating | undefined {
  const { session } = state;
  if (!session || session.mode !== "spotlight" || !session.needsConfirm) return undefined;
  const above = tierAbove(session.tier);
  if (above === undefined) return undefined;
  return state.films.some((f) => f.rating === above) ? above : undefined;
}

// Earn it: queue the weakest few of the tier above, weakest first, and duel them.
export function startPromotionDuel(state: RankState): RankState {
  const above = promotionTarget(state);
  const { session } = state;
  if (!above || !session) return state;
  const films = clone(state.films);
  const queue = films
    .filter((f) => f.rating === above)
    .sort((a, b) => a.score - b.score) // weakest first
    .slice(0, PROMOTION_OPPONENTS)
    .map((f) => f.id);
  if (queue.length === 0) return state;

  // The subject sits below its first opponent so the normal climb applies: beat
  // it and you move up, lose and the promotion is off.
  const unconfirmed = [...queue.slice().reverse(), session.contenderId];
  const s: PlacementSession = {
    ...session,
    tier: above,
    unconfirmed,
    contenderId: session.contenderId,
    promotionQueue: queue,
    needsConfirm: false,
  };
  refresh(s);
  return { films, session: s };
}

// Assert it: skip the duels and take the higher rating outright.
export function promoteDirect(state: RankState): RankState {
  const above = promotionTarget(state);
  const { session } = state;
  if (!above || !session?.subjectId) return state;
  const films = clone(state.films);
  const subject = films.find((f) => f.id === session.subjectId);
  if (!subject) return state;
  subject.rating = above;
  subject.score = tierMin(above); // enters at the foot of its new tier, to climb from there
  try {
    return startSpotlight(films, subject.id, {});
  } catch {
    // Promoted into a tier with no one else in it — nothing to place against, so
    // it simply stands there as its own entry.
    subject.confirmed = true;
    return { films, session: null };
  }
}

// Did the subject just clear the last of its promotion opponents?
export function promotionWon(state: RankState): boolean {
  const { session } = state;
  if (!session?.promotionQueue?.length) return false;
  return session.needsConfirm && session.contenderId === session.subjectId;
}

// Bank a won promotion. Deliberately NOT writeScores: a promotion pile holds
// only the handful of films the subject actually faced, so spreading it across
// the whole band would rewrite the scores of a tier that was never re-ranked.
// Instead the subject is slotted just above the opponents it beat and nothing
// else is touched.
export function completePromotion(state: RankState): RankState {
  const { session } = state;
  if (!session?.promotionQueue || !session.subjectId) return state;
  const films = clone(state.films);
  const subject = films.find((f) => f.id === session.subjectId);
  if (!subject) return state;

  const tier = session.tier;
  const beaten = new Set(session.promotionQueue);
  const peers = films
    .filter((f) => f.rating === tier && f.id !== subject.id)
    .sort((a, b) => a.score - b.score); // weakest first

  // The best film it beat, and the weakest it didn't — it belongs between them.
  const lastBeaten = [...peers].reverse().find((f) => beaten.has(f.id));
  const firstUnbeaten = peers.find((f) => !beaten.has(f.id));
  const floor = lastBeaten ? lastBeaten.score : tierMin(tier);
  const ceiling = firstUnbeaten ? firstUnbeaten.score : tierMax(tier);

  subject.rating = tier;
  subject.score = Math.round((floor + ceiling) / 2);
  subject.confirmed = true;
  return { films, session: null };
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
  // Flicking the climbing film parks it at the top and hands the climb to the
  // next film up from the bottom — the same as flicking any other film. Without
  // this it lands at the top with nothing above it and drops the player straight
  // into a confirm they never asked for.
  if (filmId === s.contenderId && unconfirmed.length > 1) {
    s.contenderId = unconfirmed[unconfirmed.length - 1];
  }
  refresh(s);
  return { films, session: s };
}

// Mirror of flickToTop: throw a film to the BOTTOM of the pile. Same deal — a
// user assertion that it belongs down there, commits nothing.
export function flickToBottom(state: RankState, filmId: string): RankState {
  const { session } = state;
  if (!session) return state;
  const idx = session.unconfirmed.indexOf(filmId);
  if (idx < 0) return state; // not an unconfirmed film
  const films = clone(state.films);
  const unconfirmed = [...session.unconfirmed];
  unconfirmed.splice(idx, 1);
  unconfirmed.push(filmId);
  const s: PlacementSession = { ...session, unconfirmed };
  // Sending the climber to the bottom just means it starts its climb from there.
  refresh(s);
  return { films, session: s };
}

// Back out of a pending confirm: drop the champion one place so it has to win
// its way back to the top. Commits nothing — it only ever un-parks the film.
export function stepBackFromConfirm(state: RankState): RankState {
  const { session } = state;
  if (!session || !session.needsConfirm) return state;
  if (session.unconfirmed.length < 2) return state; // nothing left to duel
  const films = clone(state.films);
  const unconfirmed = [...session.unconfirmed];
  const [champ] = unconfirmed.splice(0, 1);
  unconfirmed.splice(1, 0, champ); // slot it back in just below the new top
  const s: PlacementSession = { ...session, unconfirmed, contenderId: champ };
  refresh(s);
  return { films, session: s };
}

// "Jump to top" button — flick the current contender up.
export function jumpToTop(state: RankState): RankState {
  if (!state.session) return state;
  return flickToTop(state, state.session.contenderId);
}

// Rolodex scrub — the fatigue shortcut, in both directions. Aim the duel at any
// film in the pile: scrub up to leap past ones the contender clears, or down to
// drop past ones that beat it.
//
// This only AIMS. The pile is left exactly as it was, so the strip holds still
// while the player looks around — nothing shuffles under the thumb. The move
// itself lands in choose(), when the duel is actually fought and the contender
// takes its place above or below the film it faced.
//
// Skipping is a user assertion ("I know this belongs around here"), not an
// inference: the player supplies the ordering directly rather than earning it a
// duel at a time, exactly as flickToTop does. Nothing is committed either way —
// only a confirm does that.
export function skipToFilm(state: RankState, filmId: string): RankState {
  const { session } = state;
  if (!session) return state;
  const ti = session.unconfirmed.indexOf(filmId);
  if (ti < 0 || filmId === session.contenderId) return state; // unknown, or itself
  return { ...state, session: { ...session, challengerId: filmId, needsConfirm: false } };
}
