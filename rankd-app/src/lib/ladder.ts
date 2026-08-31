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

import type { AutoStep, Film, PlacementSession, RankState } from "./types";
import { tierMin, tierMax, tierAbove, type Rating } from "./tiers";
import { newJudgement, type LogMode } from "./log";
import { decidedOrder, type Oracle } from "./relations";
import { judgementsForMove } from "./reorder";

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

// ── Blocks: one film, or a cluster of them travelling together ─────────────
//
// Everything below thinks in BLOCKS rather than films. An ungrouped film is a
// block of one, which is why introducing clusters changed no behaviour for a
// pile that has none: the k=1 case is the old code exactly.

/** The cluster holding `id`, or null. Clusters never overlap. */
export function clusterOf(s: PlacementSession, id: string): string[] | null {
  return s.clusters?.find((c) => c.includes(id)) ?? null;
}

/**
 * The stretch of `unconfirmed` that moves when `id` moves — its cluster if it
 * has one, else just itself.
 *
 * Returns positions, not ids, because every caller needs to splice. Cluster
 * members are kept contiguous by `groupFilms` and by every move below, so `top`
 * and `size` describe a real run of the array; the filter is a guard against a
 * cluster naming a film that has already been confirmed out of the pile.
 */
function blockAt(s: PlacementSession, id: string): { top: number; size: number; ids: string[] } {
  const cluster = clusterOf(s, id);
  const members = cluster ? cluster.filter((m) => s.unconfirmed.includes(m)) : [id];
  if (members.length < 2) {
    const at = s.unconfirmed.indexOf(id);
    return { top: at, size: 1, ids: at < 0 ? [] : [id] };
  }
  const positions = members.map((m) => s.unconfirmed.indexOf(m)).sort((a, b) => a - b);
  const top = positions[0];
  return { top, size: positions.length, ids: s.unconfirmed.slice(top, top + positions.length) };
}

// Recompute the challenger + needsConfirm from where the contender sits.
// index 0 = top of the pile, so "above" = a smaller index.
//
// The contender is normalised to the TOP of its block — the face that fights on
// the block's behalf. Everything downstream (getPair, the arena, the strip) then
// reads a single climbing film exactly as it always did, and a cluster shows as
// one poster carrying its group rather than as a special case.
function refresh(s: PlacementSession): void {
  const { top } = blockAt(s, s.contenderId);
  if (top >= 0) s.contenderId = s.unconfirmed[top];
  if (top <= 0) {
    s.needsConfirm = top === 0; // at the top → confirm (top === -1 shouldn't happen)
    s.challengerId = "";
  } else {
    s.needsConfirm = false;
    s.challengerId = s.unconfirmed[top - 1];
  }
}

// ── Moving the pile, with no opinion about why ─────────────────────────────
//
// The splice half of `settle`, and nothing else. Both the user answering a duel
// and the climb replaying one they already answered end up here, because the
// pile move is identical either way — the contender ends up immediately above
// the film it beat, or immediately below the film that beat it.
//
// The SIGNATURE is the safety property. This takes a session and never sees
// `Film[]` or the journal, so a caller replaying a remembered duel through it
// cannot mint an evidence row or bump a duel count even by accident. Fabricated
// evidence would feed straight back into the oracle that produced it, and the
// only real defence against that is not having the ingredients in scope.
//
// A null outcome is a draw, which places exactly as a loss does — "not above" is
// all a draw licenses.
function applyOutcome(s: PlacementSession, outcome: "a" | "b" | "draw"): void {
  const mine = blockAt(s, s.contenderId);
  if (mine.top < 0 || s.unconfirmed.indexOf(s.challengerId) < 0) return; // shouldn't be dueling

  // Lift the whole contending block out in one piece.
  s.unconfirmed.splice(mine.top, mine.size);

  // Then find what it was fighting, in the array as it now stands. Recomputed
  // rather than adjusted by an offset because a rolodex scrub can aim at a film
  // anywhere in the pile — above or below — so there is no single index shift to
  // apply. The challenger may itself be a cluster, and a block that lost to it
  // has to land clear of the whole thing, not in the middle of it.
  const theirs = blockAt(s, s.challengerId);
  const at = outcome === "a" ? theirs.top : theirs.top + theirs.size;
  s.unconfirmed.splice(at, 0, ...mine.ids);
}

/**
 * Does the record already settle the duel that is on screen right now?
 *
 * A PEEK. It mutates nothing and decides nothing — it reports what the evidence
 * says about the current pair so the screen can play that duel back to the user
 * rather than performing it behind their back.
 *
 * ── Why this is a peek and not a loop ──────────────────────────────────────
 *
 * This replaced an `advance()` that resolved every known duel in one atomic
 * call, inside the engine, before the screen ever rendered. It was correct, it
 * was fast, and it was the wrong shape: the pile leapt several places between
 * taps with nothing to watch, so the person playing could not see what had been
 * decided for them, could not check it, and could not stop it. Reported as
 * "jumping places without knowing why or what it's jumping".
 *
 * Resolving one step at a time is what makes the pass showable and — the part
 * that actually matters — interruptible. The user takes any duel back simply by
 * answering it themselves.
 *
 * ── Who opts out ───────────────────────────────────────────────────────────
 *
 * A cross-tier run records nothing by design (see `settle`), and reading the
 * library's log to skip its duels would import exactly the leak that ban exists
 * to prevent — a filmography argument deciding where films sit in the main list.
 * A promotion attempt is one film against a different tier, and its loss branch
 * restores `resumeAfter`, which a pile-move helper has no way to express.
 */
export function peekKnown(state: RankState): AutoStep | null {
  const { session, oracle } = state;
  if (!session || !oracle) return null;
  if (session.crossTier || session.promotionQueue) return null;
  if (session.needsConfirm || !session.challengerId || !session.contenderId) return null;
  const why = oracle.explain(session.contenderId, session.challengerId);
  if (!why) return null;
  return {
    a: session.contenderId,
    b: session.challengerId,
    o: why.o,
    via: why.direct ? "direct" : "inferred",
    at: why.direct?.at,
    chain: why.chain,
  };
}

/**
 * Play out ONE duel the record already settles.
 *
 * ── Termination, proved rather than guarded ────────────────────────────────
 *
 * The screen loops on this, so the proof that used to live in `advance` lives
 * here. Let Φ = unconfirmed.indexOf(contenderId). `refresh` aims the contender
 * at unconfirmed[Φ-1], so:
 *
 *   · contender wins  — it is spliced in at Φ-1, same film climbing.  Φ' = Φ-1
 *   · contender loses — it is spliced back at Φ and the challenger, now at Φ-1,
 *     takes over the climb.                                          Φ' = Φ-1
 *
 * Every step drops Φ by exactly one, and at Φ = 0 `refresh` sets `needsConfirm`,
 * at which point `peekKnown` returns null and the caller's loop ends. So a
 * replay runs at most unconfirmed.length - 1 times even against an oracle
 * answering at random.
 *
 * (That same invariant is why the unaided climb costs exactly n(n-1)/2 duels —
 * every pass over m films is m-1 of them. See test/climbCost.test.ts.)
 *
 * Routes through `applyOutcome`, which never receives `Film[]` or the journal
 * and therefore cannot mint an evidence row or bump a duel count. Replaying a
 * remembered duel must leave no trace: the user answered it once, and a second
 * row saying so would be the act of reading the log fabricating evidence for it.
 */
export function replayStep(state: RankState): RankState {
  const step = peekKnown(state);
  const { session } = state;
  if (!step || !session) return state;
  const s: PlacementSession = { ...session, unconfirmed: [...session.unconfirmed] };
  applyOutcome(s, step.o);
  // A loss or a draw hands the climb to the winner, exactly as `settle` does.
  if (step.o !== "a") s.contenderId = s.challengerId;
  refresh(s);
  return { ...state, session: s, resolved: [step] };
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
  const order = [...s.confirmed, ...s.unconfirmed, ...(s.confirmedTail ?? [])]; // best → worst overall
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

/**
 * A climb that spanned tiers gets to correct the ratings it spanned.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * King of the Hill can reach either side of its tier — `spanBelow` and
 * `spanAbove` — so its pile deliberately mixes ratings, and it asks a question
 * no single-tier run can: is this 3★ actually better than your 4★s? The answer
 * used to be thrown away. `writeScores` groups by rating and writes each film
 * inside its OWN band, so a 3★ that beat every 4★ went back to being the best
 * of the 3★s — below all of them.
 *
 * ── Redistribution, not promotion, and the first draft got this wrong ──────
 *
 * The obvious rule is "a film that beat a better-rated one is promoted to that
 * rating". It was written, and a trace of a three-film pile showed what it
 * really does:
 *
 *     b(3★) beats high(4★)  ->  b promoted to 4★
 *     a(3★) beats high(4★)  ->  a promoted to 4★
 *     high(4★) confirmed last, now sitting under two 4★s  ->  unchanged
 *
 * Three 4★s out of a pile that held one. Ratings can only ever go UP under that
 * rule, because the winners are promoted before the loser is judged, and by then
 * everything above it matches its own rating. A spanned run would inflate a
 * library a little every time it ran.
 *
 * So the pile keeps the ratings it came in with and hands them out in the order
 * the climb produced. The MULTISET is preserved — one 4★ in, one 4★ out — and
 * the only thing that changes is who holds which. `b` takes the 4★ and `high`
 * takes a 3★, which is the swap the duels actually argued for, and the library's
 * shape is untouched.
 *
 * That is also the thing that was asked for: not a promotion ladder, but being
 * "able to move them easily when placed wrong in the first place".
 *
 * ── Why the RATING moves and the band never does ───────────────────────────
 *
 * Tier bands must stay non-overlapping — `list.ts` states that a plain score
 * sort is tier-correct because of it, and the counts, the profile and the cards
 * all inherit that. `writeScores` runs immediately after this and reads
 * `f.rating` to pick the band, so setting the rating here is the whole job.
 *
 * ── Why this needs no toggle, where Fast Shuffle does ─────────────────────
 *
 * Fast Shuffle re-rates off a belief fit nobody sees, which is why it asks
 * first. Spanning a climb is already an explicit act — you set the reach on the
 * way in — and every duel behind this was answered by hand, just now. An
 * unspanned pile is all one rating, so the multiset is one value repeated and
 * redistribution cannot change anything. That inertness is structural.
 */
function redistributeRatings(films: Film[], order: readonly string[]): void {
  const inPile = order
    .map((id) => films.find((f) => f.id === id))
    .filter((f): f is Film => f !== undefined);
  if (inPile.length < 2) return;

  // Best first, so position i takes the i-th best rating the pile held.
  const ratings = inPile.map((f) => f.rating).sort((a, b) => b - a);
  inPile.forEach((f, i) => {
    f.rating = ratings[i];
  });
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
    oracle,
    directOnly = false,
  }: {
    below?: number;
    above?: number;
    shuffle?: boolean;
    only?: string[];
    crossTier?: boolean;
    /** Only count pairs that actually met. Recorded on the session. */
    directOnly?: boolean;
    // What the user has already decided — see `advance`. A run over a pile that
    // is entirely settled walks straight to its first confirm without asking
    // anything, which is the point.
    oracle?: Oracle;
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
    ...(directOnly ? { directOnly: true } : {}),
    ...(band ? { band } : {}),
    confirmed: [],
    unconfirmed,
    contenderId: unconfirmed[unconfirmed.length - 1], // bottom
    challengerId: "",
    needsConfirm: false,
  };
  refresh(s);
  return { films: f, session: s, journal: [], oracle };
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

  if (s.unconfirmed.indexOf(s.contenderId) < 0 || s.unconfirmed.indexOf(s.challengerId) < 0) {
    return state; // no valid opponent — shouldn't be dueling
  }

  // A draw places like a loss — "not above" is all it licenses. The log already
  // recorded it as a draw, so nothing downstream believes the challenger won.
  const contenderWon = winnerId === s.contenderId;
  applyOutcome(s, contenderWon ? "a" : "b");

  if (contenderWon) {
    refresh(s);
    return { films, session: s, journal, oracle: state.oracle };
  }

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
    if (!back) return { films, session: null, journal, oracle: state.oracle }; // nothing to go back to
    return { films, session: { ...back }, journal, oracle: state.oracle };
  }

  s.contenderId = s.challengerId; // the winner carries the climb on
  refresh(s);
  return { films, session: s, journal, oracle: state.oracle };
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
  // The top of the pile — a single film, or a whole gathered block going up
  // together. A cluster that reaches the top has beaten everything below it as
  // one thing, so it is placed as one thing: its members take consecutive ranks
  // in the order they were carrying, and the cluster is spent.
  const block = blockAt(s, s.unconfirmed[0]);
  const championIds = s.unconfirmed.splice(0, Math.max(1, block.top === 0 ? block.size : 1));
  s.confirmed.push(...championIds);
  if (s.clusters && championIds.length > 1) {
    const gone = new Set(championIds);
    const rest = s.clusters.filter((c) => !c.some((id) => gone.has(id)));
    s.clusters = rest.length > 0 ? rest : undefined;
  }

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
    const locking = new Set(championIds);
    for (const f of films) if (locking.has(f.id)) f.lock = "hard";
    // ── Ratings settle at the END of the pile, not per confirm ─────────────
    //
    // Redistribution needs the finished order: it hands the pile's own ratings
    // out by position, and half an order would hand them out by half a
    // position. Doing it per confirm was the first draft's mistake and it could
    // only ever inflate — see `redistributeRatings`.
    if (s.unconfirmed.length === 0) {
      redistributeRatings(films, [...s.confirmed, ...(s.confirmedTail ?? [])]);
    }
    writeScores(films, s);
  }
  if (s.unconfirmed.length === 0) {
    return { films, session: null, journal: state.journal, oracle: state.oracle }; // tier fully placed
  }
  s.contenderId = s.unconfirmed[s.unconfirmed.length - 1]; // restart from the bottom
  // The restart is where remembering compounds. Every earlier pass established
  // relations among exactly these films, so the climb back up from the bottom is
  // the part the record can most often replay outright — which is the same thing
  // as saying this line is why the run felt repetitive.
  refresh(s);
  return { films, session: s, journal: state.journal, oracle: state.oracle };
}

// ── Placing films by hand ───────────────────────────────────────────────────
//
// Duels are one way to place a film and they are not always the easiest one.
// "This is the worst of these", "this belongs about here", "that one is a slot
// too high" are all things a person knows instantly and could only say, until
// now, by playing a duel for every intervening film.
//
// Each of these is a user ASSERTION, on the footing `flickToTop` already stands
// on: it moves the pile, it records no judgement, and — except where it locks —
// it commits nothing. The user supplies the ordering directly rather than
// earning it a duel at a time.

/**
 * Lock the bottom film of the pile into last place.
 *
 * The mirror of `confirm`, and the reason it exists: reaching the TOP is how a
 * film earns a position, which is right for the best of a pile and absurd for
 * the worst. Saying "this is the weakest of what's left" used to require the
 * film to climb past everything above it first — a full pass of duels to reach
 * a position nobody was arguing about.
 *
 * The pile now fills from both ends and the run ends when they meet.
 *
 * Writes scores and a hard lock exactly as `confirm` does, because it is the
 * same act of commitment pointed the other way. A cross-tier run writes neither,
 * for the reasons set out in `confirm`.
 */
export function confirmLast(state: RankState): RankState {
  const { session } = state;
  if (!session || session.promotionQueue) return state;
  if (session.unconfirmed.length < 2) return state; // nothing to separate it from
  const films = clone(state.films);
  const s: PlacementSession = {
    ...session,
    confirmed: [...session.confirmed],
    unconfirmed: [...session.unconfirmed],
    confirmedTail: [...(session.confirmedTail ?? [])],
  };

  // The whole block, if the bottom film is travelling in a cluster: a gathered
  // group is placed as one thing wherever it is placed from.
  const block = blockAt(s, s.unconfirmed[s.unconfirmed.length - 1]);
  const taking = block.top >= 0 && block.top + block.size === s.unconfirmed.length ? block.size : 1;
  const going = s.unconfirmed.splice(s.unconfirmed.length - taking, taking);
  s.confirmedTail = [...going, ...s.confirmedTail!];
  if (s.clusters && going.length > 1) {
    const gone = new Set(going);
    const rest = s.clusters.filter((c) => !c.some((id) => gone.has(id)));
    s.clusters = rest.length > 0 ? rest : undefined;
  }

  if (!s.crossTier) {
    const locking = new Set(going);
    for (const f of films) if (locking.has(f.id)) f.lock = "hard";
    if (s.unconfirmed.length === 0) {
      redistributeRatings(films, [...s.confirmed, ...s.confirmedTail]);
    }
    writeScores(films, s);
  }
  if (s.unconfirmed.length === 0) {
    return { films, session: null, journal: state.journal, oracle: state.oracle };
  }
  // The climb restarts from the new bottom, which is what the pile now is.
  s.contenderId = s.unconfirmed[s.unconfirmed.length - 1];
  refresh(s);
  return { films, session: s, journal: state.journal, oracle: state.oracle };
}

/**
 * Put a film at a given position in the pile, directly.
 *
 * `flickToTop` and `flickToBottom` are this operation at the two extremes, and
 * the extremes are the two cases a person is least often sure about. "It belongs
 * around here" is the common one and had no way to be said.
 *
 * Provisional and free: it reorders `unconfirmed` and touches nothing else, so
 * it can be adjusted as often as the user likes until the run ends. `index` is a
 * position in the pile, best-first, clamped rather than rejected.
 */
export function placeAt(state: RankState, filmId: string, index: number): RankState {
  const { session } = state;
  if (!session) return state;
  const block = blockAt(session, filmId);
  if (block.top < 0) return state; // not in the pile

  const s: PlacementSession = { ...session, unconfirmed: [...session.unconfirmed] };
  s.unconfirmed.splice(block.top, block.size);
  const at = Math.max(0, Math.min(s.unconfirmed.length, index));
  s.unconfirmed.splice(at, 0, ...block.ids);
  // Moving the climber does not hand the climb to anyone else — it is still the
  // film being placed, now placed somewhere else. Moving anything ELSE leaves
  // the climb alone. Either way `refresh` re-aims from where the contender sits.
  refresh(s);
  return { films: state.films, session: s, journal: state.journal, oracle: state.oracle };
}

/**
 * The longest run from the top of the pile that the record already settles.
 *
 * `decidedRest` answers the same question about the WHOLE pile and returns an
 * order or nothing. This is its prefix: how many films from the top are both
 * totally ordered among themselves and known to beat everything below them.
 *
 * Both conditions are needed. Ordered-among-themselves alone would happily lock
 * a top three that some film further down beats, which is a claim the record
 * does not make.
 *
 * Returns the ids in order, or null when the top two are not settled — there is
 * no point offering to batch a single film, which is what `confirm` already is.
 */
export function settledPrefix(state: RankState): string[] | null {
  const { session, oracle } = state;
  if (!session || !oracle) return null;
  if (session.crossTier || session.promotionQueue) return null;
  const pile = session.unconfirmed;
  if (pile.length < 3) return null; // the whole-pile case is `decidedRest`

  // Grow the prefix while the next film is beaten by every film already in it
  // and beats every film below. Stops at the first one that is not.
  const taken: string[] = [];
  for (let k = 0; k < pile.length - 1; k++) {
    const rest = pile.slice(k + 1);
    const beatsAllBelow = rest.every((id) => oracle.known(pile[k], id) === "a");
    if (!beatsAllBelow) break;
    const underAllTaken = taken.every((id) => oracle.known(id, pile[k]) === "a");
    if (!underAllTaken) break;
    taken.push(pile[k]);
  }
  return taken.length > 1 ? taken : null;
}

/**
 * Lock in a settled run from the top of the pile, in one go.
 *
 * Routes every film through the ordinary `confirm`, deliberately: that is what
 * keeps the hard locks, the band confinement a Rough Cut pile depends on, and
 * the end-of-pile rating redistribution correct by construction rather than by
 * being written out a second time here.
 */
export function confirmPrefix(state: RankState): RankState {
  const order = settledPrefix(state);
  if (!order || !state.session) return state;
  let s = state;
  for (const id of order) {
    const session = s.session;
    if (!session) break;
    const rest = [id, ...session.unconfirmed.filter((x) => x !== id)];
    s = confirm({
      ...s,
      session: { ...session, unconfirmed: rest, contenderId: id, challengerId: "", needsConfirm: true },
    });
  }
  return { ...s, resolved: undefined };
}

/**
 * Take a film back off the shelf and return it to the pile.
 *
 * Being stuck with a placement until the run ends is what makes people abandon
 * runs — and abandoning is far more destructive than a wrong position, because
 * the pile's whole working order goes with it. `nudgeConfirmed` handles "one
 * slot out"; this is for "that should not be placed at all yet".
 *
 * The lock goes with it. A number in the list means the user committed to a
 * position, and this is them taking that back; leaving the lock would show a
 * rank for a film that is once again unplaced.
 */
export function reopenConfirmed(state: RankState, filmId: string): RankState {
  const { session } = state;
  if (!session) return state;
  const fromHead = session.confirmed.includes(filmId);
  const fromTail = (session.confirmedTail ?? []).includes(filmId);
  if (!fromHead && !fromTail) return state;

  const films = clone(state.films);
  const s: PlacementSession = {
    ...session,
    confirmed: session.confirmed.filter((id) => id !== filmId),
    unconfirmed: [...session.unconfirmed],
    confirmedTail: (session.confirmedTail ?? []).filter((id) => id !== filmId),
  };
  // Back to the end it came from, so it re-enters the pile where it was placed
  // rather than somewhere it has to be argued out of.
  if (fromHead) s.unconfirmed.unshift(filmId);
  else s.unconfirmed.push(filmId);
  // Dropped rather than left empty, so a run that never used the tail is
  // serialised the way it always was and reads back identically.
  if (s.confirmedTail?.length === 0) s.confirmedTail = undefined;

  if (!s.crossTier) {
    const back = films.find((f) => f.id === filmId);
    if (back) delete back.lock;
    writeScores(films, s);
  }
  refresh(s);
  return { films, session: s, journal: state.journal, oracle: state.oracle };
}

// ── Small corrections, without restarting anything ──────────────────────────
//
// "That one is a place too high" is a thing you notice the moment it happens,
// and until now the only way to act on it was to abandon the run or drag the row
// in the list afterwards. Both are heavier than the mistake.

/**
 * Move an already-placed film a few positions up or down the shelf.
 *
 * Negative `delta` is upward (a better rank), positive downward, clamped to the
 * ends. The move is recorded the way every other positional opinion in the app
 * is recorded — through `judgementsForMove`, in "drag" mode — so it lands in the
 * evidence log as the user's claim rather than vanishing.
 *
 * ── Why "drag" mode is the safety property, not a detail ───────────────────
 *
 * lib/relations.ts excludes "drag" rows from its default evidence set, because
 * the pairs a positional move implies were chosen by an algorithm sampling
 * around the destination rather than by a finger. That exclusion is what makes
 * this safe: a nudge can never cause the climb to skip a duel it should have
 * asked. The rows still count for the belief fit, which is where they belong.
 */
export function nudgeConfirmed(state: RankState, filmId: string, delta: number): RankState {
  const { session } = state;
  if (!session || delta === 0) return state;
  const from = session.confirmed.indexOf(filmId);
  if (from < 0) return state;
  const to = Math.max(0, Math.min(session.confirmed.length - 1, from + delta));
  if (to === from) return state;

  const films = clone(state.films);
  const confirmed = [...session.confirmed];
  confirmed.splice(from, 1);
  confirmed.splice(to, 0, filmId);
  const s: PlacementSession = { ...session, confirmed };

  // Read from the order as it stood BEFORE the move, which is what
  // `judgementsForMove` expects: it works out what was passed from `from` to `to`.
  const before = session.confirmed
    .map((id) => films.find((f) => f.id === id))
    .filter((f): f is Film => f !== undefined);
  const rows = s.crossTier ? [] : judgementsForMove(before, from, to);

  // A cross-tier run writes no scores at all — its order lives in `confirmed`,
  // which the splice above has already corrected.
  if (!s.crossTier) writeScores(films, s);
  return {
    films,
    session: s,
    journal: [...state.journal, ...rows],
    oracle: state.oracle,
  };
}

/**
 * Move a film within the group it is gathered into.
 *
 * Writes NO judgements, deliberately. A cluster's internal order is an
 * assertion, not a comparison — nobody was shown these two films side by side —
 * and minting rows here would put evidence into the log for duels that never
 * happened, which lib/relations.ts would then read back as fact and use to skip
 * real ones. Commits nothing either: the group is still climbing, and only a
 * confirm moves the list.
 */
export function reorderCluster(state: RankState, filmId: string, delta: number): RankState {
  const { session } = state;
  if (!session || delta === 0) return state;
  const cluster = clusterOf(session, filmId);
  if (!cluster) return state;

  const { top, size, ids } = blockAt(session, filmId);
  if (top < 0 || size < 2) return state;
  const within = ids.indexOf(filmId);
  const to = Math.max(0, Math.min(size - 1, within + delta));
  if (to === within) return state;

  const moved = [...ids];
  moved.splice(within, 1);
  moved.splice(to, 0, filmId);
  const unconfirmed = [...session.unconfirmed];
  unconfirmed.splice(top, size, ...moved);

  const s: PlacementSession = {
    ...session,
    unconfirmed,
    clusters: session.clusters?.map((c) => (c === cluster ? moved : c)),
  };
  refresh(s);
  return { films: state.films, session: s, journal: state.journal, oracle: state.oracle };
}

// ── Gathering films to travel together ──────────────────────────────────────

/**
 * Pull `ids` into one block sitting where `anchorId` currently sits.
 *
 * The anchor is the film the user reached for first, and it is what makes this a
 * statement rather than a guess: "these belong next to THIS one". Gathering at
 * the topmost member instead would quietly promote the whole group to the best
 * position any of them held, which is a claim nobody made.
 *
 * Relative order is preserved from the pile — see `PlacementSession.clusters`
 * for why gathering deliberately says nothing about the order inside the group.
 *
 * Commits nothing, writes no judgements, and can be undone by `ungroupFilm`
 * right up until the block confirms.
 */
export function groupFilms(state: RankState, ids: readonly string[], anchorId: string): RankState {
  const { session } = state;
  if (!session || session.crossTier || session.promotionQueue) return state;

  const inPile = session.unconfirmed;
  // Existing clusters overlapping the selection are absorbed rather than left to
  // overlap — two clusters sharing a film could not both stay contiguous.
  const wanted = new Set(ids.filter((id) => inPile.includes(id)));
  for (const c of session.clusters ?? []) {
    if (c.some((id) => wanted.has(id))) for (const id of c) if (inPile.includes(id)) wanted.add(id);
  }
  if (wanted.size < 2 || !wanted.has(anchorId)) return state;

  // Pile order, so the group keeps the standing it already had.
  const members = inPile.filter((id) => wanted.has(id));
  const rest = inPile.filter((id) => !wanted.has(id));
  // How many non-members sit above the anchor — that is where the block lands.
  const at = inPile.slice(0, inPile.indexOf(anchorId)).filter((id) => !wanted.has(id)).length;
  const unconfirmed = [...rest.slice(0, at), ...members, ...rest.slice(at)];

  const clusters = [...(session.clusters ?? []).filter((c) => !c.some((id) => wanted.has(id))), members];
  const s: PlacementSession = { ...session, unconfirmed, clusters };
  // The climb carries on from wherever it was; if the contender was swept into
  // the block, `refresh` normalises it to the block's face.
  refresh(s);
  return { films: state.films, session: s, journal: state.journal, oracle: state.oracle };
}

/**
 * Take one film back out of its group.
 *
 * A cluster is a convenience, not a commitment — the moment it stops being true
 * the user has to be able to say so, and the alternative (abandon the run) is
 * the repetition this whole feature exists to remove. The film is left exactly
 * where it is in the pile; only its membership goes.
 */
export function ungroupFilm(state: RankState, filmId: string): RankState {
  const { session } = state;
  if (!session?.clusters) return state;
  const cluster = clusterOf(session, filmId);
  if (!cluster) return state;

  const shrunk = cluster.filter((id) => id !== filmId);
  // A group of one is not a group.
  const clusters = session.clusters
    .map((c) => (c === cluster ? shrunk : c))
    .filter((c) => c.length > 1);
  const s: PlacementSession = { ...session, clusters: clusters.length > 0 ? clusters : undefined };
  refresh(s);
  return { films: state.films, session: s, journal: state.journal, oracle: state.oracle };
}

// ── Nothing left to decide ──────────────────────────────────────────────────
//
// A pile whose every remaining pair the user has already settled has no
// decisions left in it — only taps. `advance` walks the climb to the top without
// asking anything, and then `confirm` restarts it and `advance` walks it again:
// the duels are gone but the lock-in taps are not, and on a re-ranked 200-film
// tier that is still 200 of them. This is what turns those 200 into one.
//
// Measured, not assumed — test/climbCost.test.ts puts a fully decided 200-film
// tier at 199 duels and 1 tap, against 19,900 and 200 unaided.

/**
 * The order the record implies for everything still unplaced, or null if it
 * implies none. Null is the normal answer mid-run; the point is that it is
 * strictly deductive, so a non-null answer means there is genuinely nothing left
 * to ask. See `decidedOrder` for why an undecided pair, a draw and a cycle all
 * refuse.
 */
export function decidedRest(state: RankState): string[] | null {
  const { session, oracle } = state;
  if (!session || !oracle) return null;
  // A cross-tier run reads no evidence at all, and a promotion attempt is not a
  // pile being placed — same two exclusions `advance` makes, for the same reasons.
  if (session.crossTier || session.promotionQueue) return null;
  if (session.unconfirmed.length < 2) return null;
  return decidedOrder(session.unconfirmed, oracle);
}

/**
 * Lock in the whole remaining pile in the order the record already implies.
 *
 * OFFERED, never automatic — silently placing fifty films is the app deciding on
 * the user's behalf, which is the one thing this whole feature is built not to
 * do. The screen asks; this runs when they say yes.
 *
 * Each film goes through the ordinary `confirm`, deliberately rather than by
 * writing scores here: that is what keeps the hard locks, the band confinement a
 * Rough Cut pile depends on (`writeScores`), and the end-of-pile rating
 * redistribution correct by construction instead of by duplication.
 */
export function finishDecided(state: RankState): RankState {
  const order = decidedRest(state);
  if (!order || !state.session) return state;

  let s = state;
  for (let i = 0; i < order.length; i++) {
    const session = s.session;
    if (!session) break;
    // Park the next film at the top and confirm it. Set explicitly each time
    // because `confirm` ends by restarting the climb from the bottom and running
    // `advance`, which leaves the pile in whatever shape the record dictates —
    // correct, but not something to hand the next iteration by accident.
    const rest = order.slice(i);
    s = confirm({
      ...s,
      session: { ...session, unconfirmed: rest, contenderId: rest[0], challengerId: "", needsConfirm: true },
    });
  }
  return { ...s, resolved: undefined };
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
  // Plain refresh: `advance` declines a promotion run anyway, and being explicit
  // here says so at the call site rather than making the reader go and check.
  refresh(s);
  return { films, session: s, journal: state.journal, oracle: state.oracle };
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
  return {
    films,
    session: resumeWithout(session, subject.id, state.oracle),
    journal: state.journal,
    oracle: state.oracle,
  };
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
function resumeWithout(
  back: PlacementSession,
  promotedId: string,
  oracle?: Oracle,
): PlacementSession | null {
  const unconfirmed = back.unconfirmed.filter((id) => id !== promotedId);
  if (unconfirmed.length < 2) return null;
  const s: PlacementSession = {
    ...back,
    unconfirmed,
    confirmed: [...back.confirmed],
    contenderId: unconfirmed[unconfirmed.length - 1], // restart from the bottom
    needsConfirm: false,
  };
  // `back` is the ordinary climb the attempt interrupted — captured before the
  // queue was added — so this advances as any other restart does.
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
    session: back ? resumeWithout(back, subject.id, state.oracle) : null,
    journal: state.journal,
    oracle: state.oracle,
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
  return { films, session: s, journal: state.journal, oracle: state.oracle };
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
  return { films, session: s, journal: state.journal, oracle: state.oracle };
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
  // ── Plain `refresh`, and it MUST stay plain ───────────────────────────────
  //
  // This is "Not yet — keep playing": the user is deliberately un-parking a film
  // the pile says has won. The record almost certainly agrees the champion beats
  // whatever is now above it — it just climbed past all of them — so `advance`
  // would settle that duel from the log, walk the film straight back to the top,
  // and re-serve the identical confirm screen. One tap, nothing visibly changes,
  // forever. The user is asking to be shown a duel, which is the one thing
  // auto-resolve exists to avoid doing on its own initiative.
  refresh(s);
  return { films, session: s, journal: state.journal, oracle: state.oracle };
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
  // No `advance` here, and not only because this calls no `refresh`. The scrub
  // is the user aiming by hand at a film that may be anywhere in the pile, so
  // the challenger is NOT unconfirmed[Φ-1] — the invariant `advance` relies on
  // to terminate does not hold, and auto-resolving would also throw away the aim
  // they just took. The duel they scrubbed to is the one they get.
  return { ...state, session: { ...session, challengerId: filmId, needsConfirm: false } };
}
