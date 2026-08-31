// The decisions a ranking is actually waiting on.
//
// ── Why a ranking needs this ───────────────────────────────────────────────
//
// A finished-looking list is not a settled one. Every film can have a number
// while the pairs that decide those numbers were never judged — the model placed
// them, or a cut asserted them, or they simply inherited an imported rating. The
// app knew which was which all along and never said: `relations.ts` can tell you
// exactly which pairs the record settles, and it was only ever asked about the
// two films on screen.
//
// So this asks it about the whole list. An OPEN CALL is two films that sit next
// to each other in your ranking where the record does not settle which is
// better. That is the honest unit of remaining work: not "23 films unplaced",
// which counts things the model already has an opinion about, but "7 decisions
// nobody has made".
//
// ── Why adjacent pairs, and not every pair ─────────────────────────────────
//
// A library of 861 films has 370,230 pairs and almost none of them are in doubt;
// nobody needs to be asked whether their favourite beats their least favourite.
// The pairs that carry a ranking are the ones that touch, because those are the
// only ones whose answer could reorder anything. Counting them also makes the
// number fall as you play, which a total over all pairs never would.
//
// ── What it deliberately does not do ───────────────────────────────────────
//
// It does not guess. A pair is open when `known` returns null: a pair nobody
// judged, or one the record contradicts itself about. Both are genuinely
// unfinished business.
//
// A DRAW is not. "Too close to call" is an answer about exactly those two films,
// and counting it as outstanding would put it back on the pile and ask again —
// which is the tedium the whole remembered-duel layer exists to remove.
//
// Nothing here consults the belief model. `bayes.ts` can say two films are
// PROBABLY close, and probably is not a decision the user made; a count built on
// it would drift every time the model refitted, which is the opposite of a
// number you can work through. See the header of relations.ts.

import { rankedFilms } from "./ladder";
import type { Oracle } from "./relations";
import type { Film } from "./types";

/** Two films that sit next to each other, and nothing settles which is better. */
export interface OpenCall {
  /** The film currently ranked higher. */
  a: string;
  b: string;
}

/**
 * Every adjacent pair in `order` the record does not settle.
 *
 * `order` must be best-first. Pass `rankedFilms(films)` or a tier's slice of it.
 */
export function openCalls(order: readonly Film[], oracle: Oracle): OpenCall[] {
  const out: OpenCall[] = [];
  for (let i = 0; i + 1 < order.length; i++) {
    if (oracle.known(order[i].id, order[i + 1].id) === null) {
      out.push({ a: order[i].id, b: order[i + 1].id });
    }
  }
  return out;
}

/** The same question asked of a whole library. */
export const libraryOpenCalls = (films: readonly Film[], oracle: Oracle): OpenCall[] =>
  openCalls(rankedFilms([...films]), oracle);

/**
 * The films caught up in these calls, best-first and without repeats.
 *
 * A run over exactly this set is the point of the whole file: a climb that asks
 * only the questions the ranking is waiting on, rather than walking a tier that
 * is mostly already decided. `startRun(films, tier, { only })` takes it as it
 * comes, and preserves the order — so the pile opens in the standing it already
 * has and the climb is short.
 */
export function callFilms(calls: readonly OpenCall[], films: readonly Film[]): Film[] {
  const wanted = new Set<string>();
  for (const c of calls) {
    wanted.add(c.a);
    wanted.add(c.b);
  }
  return rankedFilms([...films]).filter((f) => wanted.has(f.id));
}

/**
 * Which tier is carrying the most unfinished business.
 *
 * Counted per tier rather than over the library, because every run that could
 * act on the answer is tier-scoped. A tier is only offered if there is enough
 * left in it to duel — two films is the floor for a climb.
 */
export function shakiestTier(
  films: readonly Film[],
  oracle: Oracle,
): { tier: number; calls: OpenCall[] } | undefined {
  const byTier = new Map<number, Film[]>();
  for (const f of rankedFilms([...films])) {
    byTier.set(f.rating, [...(byTier.get(f.rating) ?? []), f]);
  }

  let best: { tier: number; calls: OpenCall[] } | undefined;
  for (const [tier, inTier] of byTier) {
    const calls = openCalls(inTier, oracle);
    if (calls.length === 0) continue;
    // Ties break toward the better rating: the films you care most about are
    // the ones worth settling first.
    if (!best || calls.length > best.calls.length || (calls.length === best.calls.length && tier > best.tier)) {
      best = { tier, calls };
    }
  }
  return best && best.calls.length > 0 ? best : undefined;
}
