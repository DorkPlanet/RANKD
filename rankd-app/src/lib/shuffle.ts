// Turning what the evidence thinks into where a film actually sits.
//
// Two jobs, both narrow on purpose:
//
//   SCORES — project beliefs into rankd's tier bands.
//   RANKS  — decide when a film has been duelled enough to claim a number.
//
// The projection problem, and why it is not arithmetic. Beliefs live on a 1–10
// scale and can be driven anywhere by enough evidence; rankd's scores live in
// hard, non-overlapping bands (4★ owns 7001–8000). Mapping one onto the other
// with a formula means a clamp, and a clamp is a rule you have to remember to
// apply everywhere. Instead a tier is RE-SPREAD across its own band in belief
// order — the same thing `writeScores` in ladder.ts already does on a confirm.
// Band containment then falls out of the construction: there is no expression
// anywhere in this file that could produce a score outside a film's own band, so
// a 3★ cannot outrank a 4★ no matter what the duels say.
//
// That is the deliberate limit on the model's authority. Cross-tier evidence is
// still recorded and still surfaces — as a promotion suggestion, for the user to
// accept — but it never moves a film across a star boundary on its own.

import { confidenceFromSpread, type Belief } from "./bayes";
import { seedOf } from "./beliefs";
import { isHard, isPlaced, isSoft } from "./lock";
import { seedScore, tierMax, tierMin, type Rating } from "./tiers";
import type { Film } from "./types";

/**
 * How settled a film must be before it claims a number in the list.
 *
 * CALIBRATED, not guessed — see test/calibration.test.ts, which simulates real
 * sessions and prints the numbers. What it found:
 *
 *   ~1 duel per film   → nothing placed. Correct: one duel is not an opinion.
 *   ~10 duels per film → everything placed, median confidence 0.73.
 *
 * And the constraint that actually pins this value: confidence SATURATES. It
 * cannot climb indefinitely because the matchmaker stops asking about films it
 * has already settled, so they stop tightening. A threshold at or above the
 * ceiling would place nothing, ever, no matter how long anyone swiped — which
 * would look exactly like a broken feature rather than a strict one.
 *
 * ── 0.5 → 0.65 → 0.55, all on 21 Aug 2026 ─────────────────────────────────
 *
 * **The landing point is 0.55.** 0.65 was tried first and went too far: the
 * user played it and said so — "we've gone too far the other way with how many
 * duels a film now needs. Meet somewhere in the middle, in favour of where it
 * was." What that buys, measured on the same 120-film simulation:
 *
 *    duels/film    @0.5   @0.55   @0.6   @0.65
 *        2           17      6       0      0
 *        4          120     80      29      0
 *        5          120    120      69     25
 *       10          120    120     120    120
 *
 * So 0.55 keeps the shape of 0.5 — full placement at about five duels a film,
 * not ten — while cutting the SHALLOW placements that were the actual
 * complaint: at two duels a film it places six where 0.5 placed seventeen. It
 * costs roughly one extra duel per film before a tier fills in. 0.65 cost five,
 * which is a different game rather than a stricter one.
 *
 * ── The measurement that set the bounds ───────────────────────────────────
 *
 * The user's ask: films should need more evidence before the app claims to have
 * worked them out. Measured before moving it rather than argued, over simulated
 * sessions at two library sizes, counting how many films clear each threshold:
 *
 *   120 films   5 duels/film   @0.5 120   @0.6  69   @0.65  25   @0.7   4
 *   120 films  10 duels/film   @0.5 120   @0.6 120   @0.65 120   @0.7  89
 *   400 films  10 duels/film   @0.5 400   @0.6 400   @0.65 400   @0.7 400
 *
 * Two things that measurement corrected in the note above. The ceiling is
 * higher than "0.72–0.73" — median reaches 0.744 at 20 duels/film on 120 films
 * and 0.779 on 400, with maxima of 0.798 and 0.845 — because a bigger library
 * affords more informative comparisons. So there is real headroom above 0.5,
 * and the old note was calibrated on a smaller library than anyone actually has.
 *
 * Nothing at or above 0.7 is available at all: it places only 89 of 120 at ten
 * duels a film, so it punishes a SMALL scope. Fast Shuffle is often played over
 * one tier or one person, and a threshold that works on the whole library but
 * stalls on a tier is the broken-looking failure this constant exists to avoid.
 *
 * The useful band is therefore narrow — roughly 0.5 to 0.65 — and where to sit
 * inside it is a feel question rather than a measurement one. Measurement says
 * what each value costs; only playing it says which cost is right.
 *
 * Beware the obvious misreading of "confidence": it measures how precisely the
 * evidence LOCATES a film, not how much that evidence agrees with itself.
 * Contradictory duels between close films are informative — they establish the
 * pair as adjacent — so they raise confidence rather than lowering it. That is
 * right, but it means this threshold is not a filter for "the user was
 * consistent about this one".
 */
export const PLACE_CONFIDENCE = 0.55;

/**
 * How many duels a film needs before Fast Shuffle gives it a provisional number.
 *
 * ── Why a COUNT and not a confidence ───────────────────────────────────────
 *
 * The two stages answer two different questions, and only one of them is about
 * precision:
 *
 *   PROVISIONAL — "have we asked enough to have an opinion?"  A count.
 *   SETTLED     — "has the evidence actually located it?"     Confidence.
 *
 * A count is the right gate for the first because it ARRIVES. Confidence is a
 * continuous quantity that a film reaches on the matchmaker's schedule, not the
 * user's, so gating the first number on it meant a session where nothing
 * happened for hundreds of duels. Five duels is a bar you can watch a film
 * cross, and the state is labelled provisional precisely so that an early,
 * roughly-right number is an honest thing to show.
 *
 * A count would be the WRONG gate for the second, for the reason the note on
 * PLACE_CONFIDENCE gives: five duels against films a title obviously beats
 * locate it barely better than none. That is what confidence is for, and it
 * keeps that job.
 */
export const PLACE_DUELS = 5;

// ── Stage two: how settled a film is, on a scale that can actually reach 1 ──
//
// Raw confidence CANNOT reach 1. `confidenceFromSpread` is 1 - spread/PRIOR,
// spread only approaches zero asymptotically, and the matchmaker stops asking
// about films it has settled so their spread stops tightening at all.
//
// The first instinct was to treat that as a reason not to show a percentage.
// The user's call was better: **if a bar sits at 80% forever then 80% is what
// finished looks like, and the goal should be measured against the ceiling that
// exists rather than one that does not.** We make the app; we set the goal.
//
// MEASURED before being chosen, with the anchor held and refits running, over
// simulated sessions:
//
//   86 films   ~3.5 duels/film   median 0.707   p90 0.744   max 0.786
//   865 films  ~9 duels/film     median 0.731   p90 0.766   max 0.816
//   86 films   20 duels/film     median 0.796   p90 0.810   max 0.831
//   400 films  20 duels/film     median 0.797   p90 0.811   max 0.838
//
// Strikingly stable across pool sizes, which is what makes a fixed ceiling
// defensible at all.
//
// ── Why it does not start from zero ────────────────────────────────────────
//
// A film that has just earned its provisional number already sits around 0.65.
// Scaled from 0 that would read "75% settled" the instant the number appeared,
// which is an anticlimax and an overclaim in one. So the scale starts where the
// provisional ends: the bar is empty when a film is first placed and full when
// it has had roughly twenty duels, which is what the second stage is for.

/** Confidence a film has roughly earned by the time it is first placed. */
export const SETTLE_FROM = 0.65;

/** The achievable ceiling — what "fully settled" means here. */
export const SETTLE_AT = 0.8;

/**
 * How far a film has come between its provisional number and being as settled
 * as this system can make it. 0 at placement, 1 at the ceiling, never outside.
 */
export function settledness(confidence: number): number {
  const span = SETTLE_AT - SETTLE_FROM;
  return Math.min(1, Math.max(0, (confidence - SETTLE_FROM) / span));
}

/** The same thing for a film, straight from the belief map. */
export function settlednessOf(film: Film, beliefs: Map<string, Belief>): number {
  const belief = beliefs.get(film.id);
  return belief ? settledness(confidenceFromSpread(belief.spread)) : 0;
}

const meanOf = (film: Film, beliefs: Map<string, Belief>): number =>
  beliefs.get(film.id)?.mean ?? seedOf(film);

/**
 * Re-spread one tier across its band, in the order the evidence believes.
 *
 * `movePlaced` is the run's tickbox, and it governs HARD locks only. When false —
 * the default — films the user committed to keep their existing ORDER exactly:
 * they are pinned in sequence and everything else is merged in around them by
 * belief. Their scores may still be rewritten (the whole band is re-spread, as it
 * already is on every confirm), but a placement the user made never changes
 * position without being asked. When true, the user opted in and the tier is
 * simply sorted by belief.
 *
 * SOFT locks are never pinned, whatever the tickbox says. Pinning them was the
 * Phase 2 bug: a film crossed the confidence threshold on the model's earliest
 * and weakest estimate, and that estimate then outlived every better one the
 * model formed afterwards. The model must always be free to improve on itself.
 */
export function respreadTier(
  films: readonly Film[],
  tier: number,
  beliefs: Map<string, Belief>,
  movePlaced: boolean,
): Film[] {
  const inTier = films.filter((f) => f.rating === tier);
  if (inTier.length === 0) return [...films];

  const byBelief = (a: Film, b: Film) => meanOf(b, beliefs) - meanOf(a, beliefs) || a.id.localeCompare(b.id);

  let ordered: Film[];
  if (movePlaced) {
    ordered = [...inTier].sort(byBelief);
  } else {
    // Pinned films hold their current sequence; everything else is merged in by
    // belief. A plain sort would have reordered the pinned ones against each
    // other, which is precisely what the tickbox being off promises not to do.
    const pinned = inTier.filter(isHard).sort((a, b) => b.score - a.score);
    const movable = inTier.filter((f) => !isHard(f)).sort(byBelief);
    ordered = [];
    let i = 0;
    let j = 0;
    while (i < pinned.length && j < movable.length) {
      if (meanOf(movable[j], beliefs) > meanOf(pinned[i], beliefs)) ordered.push(movable[j++]);
      else ordered.push(pinned[i++]);
    }
    ordered.push(...pinned.slice(i), ...movable.slice(j));
  }

  // Evenly across the band, best first. Identical to writeScores' spacing, so a
  // tier that has been through a shuffle and one that has been through a climb
  // are numerically indistinguishable — as they should be.
  const mn = tierMin(tier);
  const mx = tierMax(tier);
  const n = ordered.length;
  const scores = new Map<string, number>();
  ordered.forEach((f, i) => {
    scores.set(f.id, n === 1 ? Math.round((mn + mx) / 2) : Math.round(mx - (i / (n - 1)) * (mx - mn)));
  });

  return films.map((f) => (scores.has(f.id) ? { ...f, score: scores.get(f.id)! } : f));
}

/**
 * Re-spread every tier a set of films belongs to. The entry point after a duel:
 * pass the two films that were judged and only their bands are rewritten.
 */
export function respreadFor(
  films: readonly Film[],
  touched: readonly Film[],
  beliefs: Map<string, Belief>,
  movePlaced: boolean,
): Film[] {
  const tiers = new Set(touched.map((f) => f.rating));
  let out = [...films];
  for (const tier of tiers) out = respreadTier(out, tier, beliefs, movePlaced);
  return out;
}

/**
 * The rating the evidence would have given this film.
 *
 * `seedOf` is `rating * 2`, so the belief scale IS the star scale doubled: 4★
 * seeds at 8.0, 3.5★ at 7.0. Inverting that is the whole rule — the tier whose
 * seed the belief now sits nearest — and it needs no threshold of its own,
 * which is the point. A constant invented here would be a second opinion about
 * where a tier begins, and `tiers.ts` already owns that.
 *
 * Clamped to the real scale: a run of losses can push a mean below 1.0, and 0★
 * is not a rating anybody can give.
 */
export function ratingFromBelief(mean: number): Rating {
  const nearest = Math.round(mean) / 2;
  return Math.min(5, Math.max(0.5, nearest)) as Rating;
}

/**
 * Fix the ratings the evidence says are wrong.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The user's words: "the original idea for this was to rank all the things yes
 * but also be able to move them easily when placed wrong in the first place."
 *
 * An imported star rating is a FIRST GUESS. It came from Letterboxd or
 * Goodreads, often years ago, and it is frequently wrong — but until now
 * nothing in the app could correct it. Tier bands never overlap
 * (5★ = 9001..10000, 4★ = 7001..8000), so however one-sided the duels were, a
 * 4★ could never climb past the worst 5★. The evidence had nowhere to go.
 *
 * ── Why the RATING moves and the band does not ─────────────────────────────
 *
 * The obvious alternative is to let scores leave their band. That breaks the
 * invariant `list.ts` states plainly — "tier bands never overlap, so a plain
 * score sort is already tier-correct" — and the tier counts, the profile and
 * the share cards all inherit it.
 *
 * Changing the rating is the honest move anyway. The claim being made is not
 * "this 3★ outranks your 4★s"; it is "this was never a 3★".
 *
 * ── What it refuses to touch ───────────────────────────────────────────────
 *
 * · A HARD lock. That is a position the user committed to by hand, and
 *   re-rating moves the film out of the tier they placed it in. The model may
 *   revise its own opinions, never the user's.
 * · Anything without real evidence behind it. Both gates from `placeSettled`
 *   apply, and here they are required TOGETHER rather than either-or: this
 *   rewrites something the user said, so a film needs both the duels and the
 *   confidence, not whichever it reaches first.
 * · Guests, which are not in the library to re-rate.
 */
export function reRate(
  films: readonly Film[],
  beliefs: Map<string, Belief>,
  threshold = PLACE_CONFIDENCE,
  minDuels = PLACE_DUELS,
): { films: Film[]; changed: { id: string; from: Rating; to: Rating }[] } {
  const changed: { id: string; from: Rating; to: Rating }[] = [];

  const next = films.map((f) => {
    if (f.guest || isHard(f)) return f;
    if ((f.duels ?? 0) < minDuels) return f;

    const belief = beliefs.get(f.id);
    if (!belief) return f;
    if (confidenceFromSpread(belief.spread) < threshold) return f;

    const to = ratingFromBelief(belief.mean);
    if (to === f.rating) return f;

    changed.push({ id: f.id, from: f.rating, to });
    // Seeded at the new tier's midpoint rather than placed within it. Its
    // position among its new neighbours is a question no duel has been asked
    // yet — the respread below answers it from the belief it already has.
    return { ...f, rating: to, score: seedScore(to) };
  });

  if (changed.length === 0) return { films: [...films], changed };

  // Both tiers are now wrong: the one it left has a gap and the one it joined
  // has an unplaced arrival sitting at the midpoint. Respread settles both.
  const touched = next.filter((f) => changed.some((c) => c.id === f.id));
  const fromTiers = changed.map((c) => c.from);
  let out = respreadFor(next, touched, beliefs, true);
  for (const tier of new Set(fromTiers)) out = respreadTier(out, tier, beliefs, true);

  return { films: out, changed };
}

/**
 * Add one to the duel count of each film in a pair.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `Film.duels` describes itself as "the only record of how much evidence sits
 * behind a placement", and until now **Fast Shuffle never wrote it**. The only
 * increment in the app was `ladder.ts`'s, on the climb. So a film compared
 * fifty times in Fast Shuffle still read "Never duelled" on its info card, and
 * every badge counting duels undercounted by however much shuffling the user
 * had done.
 *
 * Cross-tier runs are excluded for the same reason the climb excludes them: a
 * person run compares films across star ratings, writes no scores, and is not
 * evidence about either film's position within its own tier.
 *
 * `mergeLibrary.rederive` recounts this from the log and is the authority; this
 * keeps the number right between merges rather than replacing it.
 */
export function countDuel(films: readonly Film[], pair: readonly [Film, Film]): Film[] {
  const ids = new Set([pair[0].id, pair[1].id]);
  return films.map((f) => (ids.has(f.id) ? { ...f, duels: (f.duels ?? 0) + 1 } : f));
}

/**
 * Grant a SOFT lock to any film the evidence has settled — a number in the list
 * that says "the model worked this one out", as distinct from one the user
 * committed to.
 *
 * Never touches a film that already has a lock. A hard lock is the user's
 * decision and the model does not get to take it back or restate it; a film
 * already soft-locked simply stays soft-locked, and its POSITION keeps improving
 * through `respreadTier` rather than through this flag.
 *
 * Nothing here ever downgrades or revokes. A soft lock, once granted, is
 * withdrawn only by turning the model off (see `advisoryOnly`) — which keeps the
 * list stable instead of letting ranks flicker as beliefs wobble.
 */
export function placeSettled(
  films: readonly Film[],
  beliefs: Map<string, Belief>,
  threshold = PLACE_CONFIDENCE,
  minDuels = PLACE_DUELS,
): Film[] {
  return films.map((f) => {
    if (isPlaced(f)) return f;
    // Either gate is enough, and they catch different films.
    //
    // The count is what makes the mode feel like it is doing something: a film
    // you have answered about five times gets its number, visibly, while you
    // are still playing.
    //
    // Confidence is kept as the second route because it catches films the count
    // misses — one that has been compared only three times but against very
    // well-known neighbours is genuinely located, and refusing it a number on a
    // technicality would be pedantry rather than rigour.
    if ((f.duels ?? 0) >= minDuels) return { ...f, lock: "soft" as const };
    const belief = beliefs.get(f.id);
    if (!belief) return f;
    return confidenceFromSpread(belief.spread) >= threshold ? { ...f, lock: "soft" as const } : f;
  });
}

/**
 * Withdraw every soft lock, leaving hard locks untouched — what the advisory-only
 * setting does when the user turns the model's authority off.
 *
 * Safe precisely because the two are distinguishable: the model's placements come
 * out, the user's stay. The evidence log is not touched, so switching back on
 * restores everything from the same duels rather than starting over.
 */
export function withdrawSoftLocks(films: readonly Film[]): Film[] {
  return films.map((f) => {
    if (!isSoft(f)) return f;
    const withdrawn = { ...f };
    delete withdrawn.lock;
    return withdrawn;
  });
}

/** How settled a film is, 0–1, for display. A film with no belief yet reads 0. */
export function confidenceOf(film: Film, beliefs: Map<string, Belief>): number {
  const belief = beliefs.get(film.id);
  return belief ? confidenceFromSpread(belief.spread) : 0;
}
