// The ranking engine — full head-to-head climb with confirm-to-commit.
//
// A note on what "records nothing" now means. The PLACEMENT still commits only
// at a confirm — the in-between shuffle moves no scores and infers nothing, and
// that is still the point. What changed is that every duel fought along the way
// is now written down as evidence (lib/log.ts): not to move the list, but so the
// judgements the user made are not destroyed by the act of using them. The
// engine stays pure — it appends to `state.journal` and the shell does the IO.
//
// Every film goes head-to-head in a bottom-up climb: the contender duels the
// film directly above it; a win swaps it up and it keeps climbing; a loss hands
// the climb to the winner (the running-best sweeps to the top). Whoever reaches
// the top is confirmed by the user and joins the ranked shelf; the climb then
// restarts from the bottom. The ONLY committed data is a confirmed position —
// the in-between shuffle records nothing (no comparison log, no inference).

import type { Film, PlacementSession, RankState } from "./types";
import { tierMin, tierMax, tierAbove, type Rating } from "./tiers";
import { newJudgement, type LogMode } from "./log";

// Which game a duel was fought in, for the evidence row. A promotion run is its
// own thing: the subject is fighting a different tier, which is a stronger claim
// than placing it among its peers.
//
// "spotlight" was the third value here until that mode was removed. It survives
// in `LogMode` because rows carrying it are already on people's devices — see
// the header of lib/log.ts. Nothing writes it any more.
const logModeOf = (s: PlacementSession): LogMode => (s.promotionQueue ? "promotion" : "koth");

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
// ── Why a run can be confined to part of its tier ──────────────────────────
//
// This spreads a run's films across the whole tier band, which is right when the
// run IS the tier. It is destructive when the run is a slice of one.
//
// Rough Cut deals a tier into thirds by writing scores inside three sub-bands,
// and "rank a pile" then climbs one of them. Without a confinement the first
// confirm re-spread those four films from tierMin to tierMax — so the pile the
// user had just separated scattered straight back through the other two, and the
// cut they had done by hand was gone. `band` is what keeps a pile inside the
// space it already occupied.
//
// Only set for an `only` run that is not cross-tier; a cross-tier run writes no
// scores at all, and a whole-tier run should have the whole tier.
function writeScores(films: Film[], s: PlacementSession): void {
  const order = [...s.confirmed, ...s.unconfirmed]; // best → worst overall
  const byRating = new Map<number, string[]>();
  for (const id of order) {
    const f = films.find((ff) => ff.id === id);
    if (!f) continue;
    byRating.set(f.rating, [...(byRating.get(f.rating) ?? []), id]);
  }
  for (const [rating, ids] of byRating) {
    const [mn, mx] = s.band ?? [tierMin(rating), tierMax(rating)];
    const n = ids.length;
    ids.forEach((id, i) => {
      const f = films.find((ff) => ff.id === id);
      if (f) f.score = n === 1 ? Math.round((mn + mx) / 2) : Math.round(mx - (i / (n - 1)) * (mx - mn));
    });
  }
}

// ── Public API ──────────────────────────────────────────────────────────

// Start placing the given tier. Throws if there aren't enough films (fail fast).
//
// `only` replaces the tier pool with an explicit set of films — a director's
// work, say, which is not a tier and has no reason to be one. It keeps the
// ORDER IT WAS GIVEN rather than re-sorting by score: the caller's order is
// already the best standing it has (for a person run, the belief ranking), and
// a score sort would silently regroup a cross-tier pile back into tier blocks,
// putting every 5★ above every 4★ before a single duel had been fought. That is
// exactly the ordering a cross-tier run exists to question.
//
// `crossTier` says the run may not write positions — see `confirm`.
export function startRun(
  films: Film[],
  tier: PlacementSession["tier"],
  {
    below = 0,
    above = 0,
    shuffle = false,
    only,
    crossTier = false,
  }: {
    below?: number;
    above?: number;
    shuffle?: boolean;
    only?: string[];
    crossTier?: boolean;
  } = {},
): RankState {
  const f = clone(films);
  // Filtered through the library rather than trusted: an id naming a film that
  // is not here would put a phantom in the pile that every lookup then misses.
  const pool = only ? only.map((id) => f.find((x) => x.id === id)).filter((x): x is Film => !!x) : poolFor(f, tier, below, above);
  if (pool.length < 2) throw new Error("Need at least 2 films in range to start ranking");
  const ids = pool.map((p) => p.id);
  const unconfirmed = shuffle ? shuffled(ids) : ids;

  // A slice of a tier keeps the space it already holds. Taken from the pile's
  // own scores rather than from the caller, so it needs no coordination: if
  // Rough Cut put these four between 734 and 933, that is where they stay.
  //
  // A pile with no spread — every film still on the tier's seed score, which is
  // what a tier looks like before anything has happened to it — has nothing
  // worth confining, so it falls through to the whole band.
  const scores = pool.map((p) => p.score);
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const band: [number, number] | undefined =
    only && !crossTier && hi > lo ? [lo, hi] : undefined;

  const s: PlacementSession = {
    tier,
    spanBelow: below,
    spanAbove: above,
    ...(crossTier ? { crossTier: true } : {}),
    ...(band ? { band } : {}),
    confirmed: [],
    unconfirmed,
    contenderId: unconfirmed[unconfirmed.length - 1], // bottom
    challengerId: "",
    needsConfirm: false,
  };
  refresh(s);
  return { films: f, session: s, journal: [] };
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
  return settle(state, winnerId);
}

// Too close to call. The user is declining to separate two films, which is a
// real answer and not a failure to give one — forcing a coin-flip here would
// write a winner nobody claimed and every belief downstream would inherit it.
//
// So it records a `draw` and, for placement, does the least presumptuous thing
// the climb allows: the contender steps in below the challenger, exactly as a
// loss would. The pile has to put it somewhere and "not above" is the only thing
// a draw actually licenses — but the log still says draw, so nothing downstream
// believes the challenger won.
export function skipPair(state: RankState): RankState {
  return settle(state, null);
}

// The shared body of `choose` and `skipPair`. A null `winnerId` is the draw.
function settle(state: RankState, winnerId: string | null): RankState {
  const { session } = state;
  if (!session || session.needsConfirm) return state;
  const films = clone(state.films);
  const s: PlacementSession = { ...session, unconfirmed: [...session.unconfirmed] };
  const drew = winnerId === null;

  // The evidence row for this duel, minted once and used by every path below.
  // `a` is always the contender and `b` the challenger, so the outcome reads the
  // same whichever mechanic asked the question — which is what lets one log be
  // re-derived from regardless of which game produced it.
  //
  // ── Except a cross-tier run, which records NOTHING ────────────────────────
  //
  // Elsewhere in the app the log always records; that rule exists so a setting
  // can govern how much a duel INFLUENCES the list without ever destroying the
  // fact that it was answered. A person run is outside that bargain, because it
  // is not a claim about the library at all: it is a list you build to look at
  // and to share, over a pile that can include films you have never seen. Those
  // duels answer "which Nolan is better", not "where does this belong", and
  // feeding them to a model that ranks your whole library would let a
  // filmography argument leak into everything.
  //
  // So a cross-tier run writes no journal row and no duel count, on top of
  // already writing no score and no lock (see `confirm`). It is the one game in
  // the app that leaves no trace whatever. (User's explicit call — the cost,
  // accepted knowingly, is that every person climb is a cold start: its opening
  // order is read from belief means that these duels will never improve.)
  const journal = s.crossTier
    ? state.journal
    : [
        ...state.journal,
        newJudgement(
          s.contenderId,
          s.challengerId,
          drew ? "draw" : winnerId === s.contenderId ? "a" : "b",
          logModeOf(s),
        ),
      ];

  // Both films fought, whoever won. Counted here rather than at confirm, because
  // the question is how much evidence a placement rests on, and a duel is
  // evidence whichever way it goes — which is exactly why a run that is not
  // evidence does not count them.
  if (!s.crossTier) {
    for (const f of films) {
      if (f.id === s.contenderId || f.id === s.challengerId) f.duels = (f.duels ?? 0) + 1;
    }
  }

  const ci = s.unconfirmed.indexOf(s.contenderId);
  const chi = s.unconfirmed.indexOf(s.challengerId);
  if (ci < 0 || chi < 0) return state; // no valid opponent — shouldn't be dueling

  s.unconfirmed.splice(ci, 1); // lift the contender out
  // Removing it shifts everything below its old slot up one, so a challenger
  // that sat below the contender is now one index lower.
  const target = ci < chi ? chi - 1 : chi;

  // A draw places like a loss — "not above" is all it licenses — so it falls
  // through to the same branch. The log already recorded it as a draw.
  if (winnerId === s.contenderId) {
    s.unconfirmed.splice(target, 0, s.contenderId); // winner takes the loser's place
    refresh(s);
    return { films, session: s, journal };
  }

  s.unconfirmed.splice(target + 1, 0, s.contenderId); // drop in beneath the winner

  // ── Losing a promotion duel ends the promotion ────────────────────────────
  //
  // A promotion run is not a climb over a pile, it is one film's attempt on the
  // tier above: the subject is the only thing being placed, so there is no
  // "winner carries the climb on" to fall back to.
  //
  // The old code returned here without handing the climb over, and a comment
  // said that ended the run. It did not. `refresh` then aimed the subject at the
  // film directly above it — the one that had just beaten it — so the same duel
  // was served again, forever, and the only way out was Done. The test covering
  // this asserted `promotionWon` was false, which is equally true of an infinite
  // rematch, so nothing caught it.
  //
  // Losing now really does end it: the attempt is over, and the run that was
  // interrupted comes back exactly as it stood. The subject is still at the top
  // of its own tier awaiting the confirm it had already earned — it reached for
  // a higher rating and missed, which costs it the promotion and nothing else.
  // The duels it lost are already in the journal either way.
  if (s.promotionQueue) {
    const back = s.resumeAfter;
    if (!back) return { films, session: null, journal }; // nothing to go back to
    return { films, session: { ...back }, journal };
  }

  s.contenderId = s.challengerId; // the winner carries the climb on
  refresh(s);
  return { films, session: s, journal };
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
  if (championId) s.confirmed.push(championId);

  // A cross-tier run confirms an ORDER and nothing else.
  //
  // `confirm` normally does three things at once: it moves the champion onto
  // the shelf, it hard-locks it, and it re-spreads every film in the pile
  // across its tier band. The last two are claims about the MAIN list, and a
  // cross-tier run has not earned either of them. `writeScores` groups by
  // rating so it would not corrupt the bands — but it would still reorder every
  // film of a given rating inside its band on the strength of duels fought
  // against films from other tiers, silently rewriting the main list from a run
  // the user started to answer a different question. And a hard lock would
  // assert the user had placed the film among its tier peers, which is
  // precisely what they did not do.
  //
  // So it writes nothing. `s.confirmed` is already an ordered id array, which
  // means the finished pile IS the ranked list — there is no second ordering to
  // store, and nothing downstream to keep in sync. See lib/people.ts.
  if (!s.crossTier) {
    const champ = films.find((f) => f.id === championId);
    if (champ) champ.lock = "hard";
    writeScores(films, s);
  }
  if (s.unconfirmed.length === 0) return { films, session: null, journal: state.journal }; // tier fully placed
  s.contenderId = s.unconfirmed[s.unconfirmed.length - 1]; // restart from the bottom
  refresh(s);
  return { films, session: s, journal: state.journal };
}

// ── Tier promotion ──────────────────────────────────────────────────────────
//
// The only route by which a film's star rating ever changes through play.
// Everywhere else a rating comes from the CSV import or from logging a film, and
// is then permanent. Two ways up, mirroring the earn-it / assert-it pairing used
// everywhere else in the app: beat the weakest films of the tier above, or take
// the rating outright.
//
// ── Why this hangs off King of the Hill and not its own mode ────────────────
//
// Topping a King of the Hill pile means the film beat every other film you own
// at that rating, one at a time. That is the strongest claim the app can make
// about a film, so it is the one that unlocks the higher tier.
//
// The trade is that it is rare — at most once per run, on the first confirm —
// which is correct for something that rewrites a star rating.

const PROMOTION_OPPONENTS = 3;

/**
 * Has the film awaiting confirmation just beaten its entire tier?
 *
 * Three conditions, and each one is load-bearing:
 *
 *  · It is the FIRST confirm of the run (`confirmed` is empty). Later confirms
 *    are #2, #3 and so on — reaching the top of what is left is not reaching the
 *    top of the tier, and offering promotion every time would make it furniture.
 *
 *  · The run's pile holds every film of the subject's rating that the library
 *    holds. This is what rules out a Rough Cut sub-pile: topping the upper third
 *    of your 3★ films is a real achievement and is not the same claim at all.
 *    Stated as a set comparison rather than a flag on the session, so any future
 *    way of starting a partial run is covered without having to remember to set
 *    something.
 *
 *  · The run is not cross-tier. Those write no score and no lock by design, so a
 *    rating change is plainly outside what they are allowed to decide.
 */
export function promotionTarget(state: RankState): Rating | undefined {
  const { session } = state;
  if (!session || !session.needsConfirm) return undefined;
  if (session.crossTier || session.promotionQueue) return undefined;
  if (session.confirmed.length > 0) return undefined;
  if (session.unconfirmed.indexOf(session.contenderId) !== 0) return undefined;

  const subject = state.films.find((f) => f.id === session.contenderId);
  if (!subject) return undefined;

  // Every film at the subject's rating has to have been in the pile it just beat.
  const inRun = new Set([...session.confirmed, ...session.unconfirmed]);
  const beatTheLot = state.films
    .filter((f) => f.rating === subject.rating && f.id !== subject.id)
    .every((f) => inRun.has(f.id));
  if (!beatTheLot) return undefined;

  const above = tierAbove(subject.rating);
  if (above === undefined) return undefined;
  return state.films.some((f) => f.rating === above) ? above : undefined;
}

// Earn it: queue the weakest few of the tier above, weakest first, and duel them.
//
// `resumeAfter` is the whole reason this can hang off a long climb. A King of
// the Hill run over a 185-film tier is an hour's work, and the promotion offer
// arrives one confirm into it — so the attempt has to be something the run comes
// BACK from, win or lose, rather than something that ends it. The session is
// stashed exactly as it stood at the confirm, which makes both endings trivial:
// a loss restores it verbatim (see `settle`), and a win restores it with the
// promoted film lifted out (see `completePromotion`).
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
    // The run to come back to. Nested one level and never deeper: a promotion
    // run is barred from offering its own promotion (`promotionTarget` returns
    // undefined for anything already carrying a queue), so this cannot chain.
    resumeAfter: { ...session },
    // The confined band belongs to the run being interrupted, not to this
    // attempt on a different tier. Left set, `completePromotion` would be
    // writing a 4★ film's score inside a 3★ pile's slice.
    band: undefined,
  };
  refresh(s);
  return { films, session: s, journal: state.journal };
}

// Assert it: skip the duels and take the higher rating outright.
export function promoteDirect(state: RankState): RankState {
  const above = promotionTarget(state);
  const { session } = state;
  if (!above || !session) return state;
  const films = clone(state.films);
  const subject = films.find((f) => f.id === session.contenderId);
  if (!subject) return state;
  subject.rating = above;
  // The foot of its new tier, to climb from there. Asserting a promotion claims
  // the RATING and nothing about where it sits inside it — that is still to be
  // earned, which is the difference between this and winning the duels.
  subject.score = tierMin(above);
  subject.lock = "hard";
  return { films, session: resumeWithout(session, subject.id), journal: state.journal };
}

// Did the subject just clear the last of its promotion opponents?
export function promotionWon(state: RankState): boolean {
  const { session } = state;
  if (!session?.promotionQueue?.length) return false;
  return session.needsConfirm && session.unconfirmed.indexOf(session.contenderId) === 0;
}

/**
 * Hand the interrupted run back, with the promoted film lifted out of it.
 *
 * The film has left the tier the run is about, so it must not still be sitting
 * in the pile — it would be dueled again at its old rating, and `writeScores`
 * would then hand it a score inside a band it no longer belongs to.
 *
 * Returns null when what is left cannot be played: one film has nothing to duel.
 */
function resumeWithout(back: PlacementSession, promotedId: string): PlacementSession | null {
  const unconfirmed = back.unconfirmed.filter((id) => id !== promotedId);
  if (unconfirmed.length < 2) return null;
  const s: PlacementSession = {
    ...back,
    unconfirmed,
    confirmed: [...back.confirmed],
    contenderId: unconfirmed[unconfirmed.length - 1], // restart from the bottom
    needsConfirm: false,
  };
  refresh(s);
  return s;
}

// Bank a won promotion. Deliberately NOT writeScores: a promotion pile holds
// only the handful of films the subject actually faced, so spreading it across
// the whole band would rewrite the scores of a tier that was never re-ranked.
// Instead the subject is slotted just above the opponents it beat and nothing
// else is touched.
export function completePromotion(state: RankState): RankState {
  const { session } = state;
  if (!session?.promotionQueue) return state;
  const films = clone(state.films);
  const subject = films.find((f) => f.id === session.contenderId);
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
  subject.lock = "hard";
  // Back to the climb that was interrupted, minus the film that just left it.
  const back = session.resumeAfter;
  return {
    films,
    session: back ? resumeWithout(back, subject.id) : null,
    journal: state.journal,
  };
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
  return { films, session: s, journal: state.journal };
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
  return { films, session: s, journal: state.journal };
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
  return { films, session: s, journal: state.journal };
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
