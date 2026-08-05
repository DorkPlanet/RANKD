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
// A spotlight isn't a climb — it's a search for one film's place, so it narrows
// a window instead of walking neighbours. A promotion run is the exception: it
// borrows the ordinary climb against the tier above.
const isSearch = (s: PlacementSession): boolean => s.mode === "spotlight" && !s.promotionQueue;

// The pile as it stands without the subject in it. Nothing but the subject ever
// moves during a spotlight, so this order — and any index into it — is stable
// for the whole session.
const othersOf = (s: PlacementSession): string[] => s.unconfirmed.filter((id) => id !== s.subjectId);

// Park the subject at the top of whatever window is left, so the pile on screen
// always shows the best estimate of where it belongs so far.
function placeSubject(s: PlacementSession): void {
  if (!s.subjectId) return;
  const os = othersOf(s);
  os.splice(Math.min(s.spotLo ?? 0, os.length), 0, s.subjectId);
  s.unconfirmed = os;
}

// Next opponent = the middle of the remaining window. Halving the search is what
// keeps a 130-film tier to about seven duels instead of a hundred and thirty,
// and every one of them still tells the session something it didn't know.
function searchRefresh(s: PlacementSession): void {
  const os = othersOf(s);
  const lo = s.spotLo ?? 0;
  const hi = Math.min(s.spotHi ?? os.length - 1, os.length - 1);
  s.spotLo = lo;
  s.spotHi = hi;
  if (lo > hi) {
    s.needsConfirm = true; // nowhere left it could be — it's placed
    s.challengerId = "";
    return;
  }
  s.needsConfirm = false;
  s.challengerId = os[(lo + hi) >> 1];
}

function refresh(s: PlacementSession): void {
  if (isSearch(s)) {
    searchRefresh(s);
    return;
  }
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

// Spotlight — re-place ONE film. It starts exactly where it already stands and
// moves only as far as its results justify: it climbs while it keeps winning,
// and turns downward once something beats it. It deliberately does NOT start
// from the bottom of the tier — doing that made every unfinished session read as
// a catastrophic drop, when all it meant was that few duels had been fought.
// Its original score is kept so abandoning restores it exactly.
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

  // Keep the standing order so the film sits at its current position; shuffling
  // is the deliberate opt-in to a varied sequence instead.
  const ids = pool.map((p) => p.id);
  const unconfirmed = shuffle ? shuffled(ids) : ids;
  const s: PlacementSession = {
    tier,
    spanBelow: 0,
    spanAbove: 0,
    mode: "spotlight",
    subjectId: filmId,
    origScore: subject.score,
    origRating: subject.rating,
    // Where it stood before any of this, so the session can show the move it made.
    origIndex: unconfirmed.indexOf(filmId),
    // It could be anywhere in the tier until a duel says otherwise.
    spotLo: 0,
    spotHi: unconfirmed.length - 2, // every film except the subject itself
    spotWins: [],
    spotLosses: [],
    confirmed: [],
    unconfirmed,
    contenderId: filmId,
    challengerId: "",
    needsConfirm: false,
  };
  refresh(s);
  return { films: f, session: s };
}

// The films a spotlight could still be placed among. Everything outside this is
// already decided, so the duel screen can show it as settled rather than live.
// Null whenever nothing is being searched (no session, a run, or a promotion).
export function searchWindow(state: RankState): Set<string> | null {
  const s = state.session;
  if (!s || !isSearch(s) || !s.subjectId) return null;
  const os = othersOf(s);
  const lo = s.spotLo ?? 0;
  const hi = Math.min(s.spotHi ?? os.length - 1, os.length - 1);
  if (lo > hi) return new Set();
  return new Set(os.slice(lo, hi + 1));
}

export interface SpotlightSummary {
  film: Film;
  fromIndex: number;
  toIndex: number;
  total: number;
  beat: Film[];
  lostTo: Film[];
}

// What the session actually established: where the film stood, where it stands
// now, and which films decided it.
export function spotlightSummary(state: RankState): SpotlightSummary | null {
  const { session } = state;
  if (!session || session.mode !== "spotlight" || !session.subjectId) return null;
  const film = state.films.find((f) => f.id === session.subjectId);
  if (!film) return null;
  const byId = (id: string) => state.films.find((f) => f.id === id);
  return {
    film,
    fromIndex: session.origIndex ?? 0,
    toIndex: session.unconfirmed.indexOf(session.subjectId),
    total: session.unconfirmed.length,
    beat: (session.spotWins ?? []).map(byId).filter((f): f is Film => !!f),
    lostTo: (session.spotLosses ?? []).map(byId).filter((f): f is Film => !!f),
  };
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

  // Both films fought, whoever won. Counted here rather than at confirm, because
  // the question is how much evidence a placement rests on, and a duel is
  // evidence whichever way it goes.
  for (const f of films) {
    if (f.id === s.contenderId || f.id === s.challengerId) f.duels = (f.duels ?? 0) + 1;
  }

  // A spotlight resolves by narrowing, not by swapping places. Beating a film
  // puts every film below that one out of the question; losing to it rules out
  // everything above. The subject never leaps past films whose relation to it
  // isn't already settled by that logic.
  if (isSearch(s)) {
    const os = othersOf(s);
    const j = os.indexOf(s.challengerId);
    if (j < 0) return state;
    const beaten = winnerId === s.contenderId;
    s.spotWins = beaten ? [...(s.spotWins ?? []), s.challengerId] : (s.spotWins ?? []);
    s.spotLosses = beaten ? (s.spotLosses ?? []) : [...(s.spotLosses ?? []), s.challengerId];
    if (beaten) s.spotHi = j - 1;
    else s.spotLo = j + 1;
    placeSubject(s);
    searchRefresh(s);
    return { films, session: s };
  }

  const ci = s.unconfirmed.indexOf(s.contenderId);
  const chi = s.unconfirmed.indexOf(s.challengerId);
  if (ci < 0 || chi < 0) return state; // no valid opponent — shouldn't be dueling

  s.unconfirmed.splice(ci, 1); // lift the contender out
  // Removing it shifts everything below its old slot up one, so a challenger
  // that sat below the contender is now one index lower.
  const target = ci < chi ? chi - 1 : chi;
  // A spotlight keeps a record of every film the subject met, so the session can
  // show what actually changed rather than just a final number.
  const spotlight = s.mode === "spotlight";
  if (spotlight) {
    const beaten = winnerId === s.contenderId;
    s.spotWins = beaten ? [...(s.spotWins ?? []), s.challengerId] : (s.spotWins ?? []);
    s.spotLosses = beaten ? (s.spotLosses ?? []) : [...(s.spotLosses ?? []), s.challengerId];
  }

  if (winnerId === s.contenderId) {
    s.unconfirmed.splice(target, 0, s.contenderId); // winner takes the loser's place
  } else {
    s.unconfirmed.splice(target + 1, 0, s.contenderId); // drop in beneath the winner
    // A promotion run is the one spotlight that climbs: the subject is the thing
    // being placed, so it never hands the climb over — losing simply ends it.
    if (spotlight) {
      refresh(s);
      return { films, session: s };
    }
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
  // A spotlight settles wherever the search ended, which is usually mid-pile —
  // so the film it locks in is the subject, not whatever happens to be on top.
  // Scores still come from the pile's order, so its neighbours keep their places.
  if (isSearch(s)) {
    const subject = films.find((f) => f.id === s.subjectId);
    if (subject) subject.confirmed = true;
    writeScores(films, s);
    return { films, session: null };
  }
  const championId = s.unconfirmed.shift(); // the top of the pile
  if (championId) {
    s.confirmed.push(championId);
    const champ = films.find((f) => f.id === championId);
    if (champ) champ.confirmed = true;
  }
  writeScores(films, s);
  // A promotion run places one film and stops. A full run would hand off to the
  // next climber here; a spotlight has nothing further to place.
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
  // Only on actually reaching the top. A spotlight also stops the moment the
  // subject loses, and settling mid-pile has plainly not earned a higher tier.
  if (session.unconfirmed.indexOf(session.contenderId) !== 0) return undefined;
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
  // Flicking the spotlit film to the top asserts it beats the whole tier, which
  // closes the search outright rather than shuffling the pile.
  if (isSearch(session) && filmId === session.subjectId) {
    const s: PlacementSession = { ...session, spotLo: 0, spotHi: -1 };
    placeSubject(s);
    searchRefresh(s);
    return { films, session: s };
  }
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
  // Mirror of the flick-to-top assertion: it loses to everything, so the search
  // is over and it settles at the foot of the tier.
  if (isSearch(session) && filmId === session.subjectId) {
    const end = othersOf(session).length;
    const s: PlacementSession = { ...session, spotLo: end, spotHi: end - 1 };
    placeSubject(s);
    searchRefresh(s);
    return { films, session: s };
  }
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
  // A spotlight has no champion to un-park — backing out reopens the boundary it
  // just settled on, so the film re-fights the neighbour that decided its place.
  if (isSearch(session)) {
    const at = Math.min(session.spotLo ?? 0, othersOf(session).length - 1);
    const s: PlacementSession = { ...session, spotLo: Math.max(0, at - 1), spotHi: Math.max(0, at - 1) };
    placeSubject(s);
    searchRefresh(s);
    return { films, session: s };
  }
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
  // In a spotlight, only films still inside the search window are worth facing —
  // the rest were settled by earlier results, so a duel against one could only
  // repeat what the session already knows. Scrubbing past the window aims at its
  // nearest edge instead of doing nothing, so the strip always lands on a real
  // opponent.
  if (isSearch(session)) {
    const os = othersOf(session);
    const lo = session.spotLo ?? 0;
    const hi = Math.min(session.spotHi ?? os.length - 1, os.length - 1);
    if (lo > hi) return state;
    const j = os.indexOf(filmId);
    if (j < 0) return state;
    const clamped = os[Math.min(Math.max(j, lo), hi)];
    return { ...state, session: { ...session, challengerId: clamped, needsConfirm: false } };
  }
  return { ...state, session: { ...session, challengerId: filmId, needsConfirm: false } };
}
