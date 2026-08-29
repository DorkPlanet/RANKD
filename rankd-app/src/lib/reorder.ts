// Dragging a row up or down the list, as EVIDENCE.
//
// ── Why a drag is not a lock ───────────────────────────────────────────────
//
// The obvious reading of "put this here" is a hard lock: the user pointed at a
// position, so pin it. The user's own reading is better, and it is the one built
// here — "the user deciding the item belongs in that position for the moment.
// Maybe not with a hard lock as that would be assumptive."
//
// A lock is a claim that a position is FINISHED. A drag is a claim that this
// thing is better than those things, which is the same claim a duel makes and
// carries none of the finality. So a drag is written into the evidence log in
// exactly the currency every other opinion in this app is written in, and then
// nothing downstream has to know it happened: beliefs move, `respreadTier`
// re-scores, soft locks settle, the shuffled view reorders. One new idea, no new
// concept anywhere else.
//
// ── How far you moved it is how much you meant it ──────────────────────────
//
// Also the user's: "it should count as one win if its within 10, then more the
// further it jumps. Same for going down."
//
// That is the right shape and it is worth saying why. Nudging something one
// place is a small opinion — often just tidying — and hauling it two hundred
// rows up is a strong one. A drag that always counted for the same would either
// make every nudge shout or make every haul a whisper. Distance is the volume
// control the gesture already has.
//
// ── Who it is evidence AGAINST ─────────────────────────────────────────────
//
// The films it passed, sampled across the span rather than taken from one end.
// A move claims "I belong above all of these", and the honest way to record that
// is against a spread of them — the far end alone would be one lucky pairing,
// and every single one would be a hundred rows of fabricated duels from one
// gesture.

import { newJudgement, type Judgement } from "./log";
import { tierMax, tierMin } from "./tiers";
import type { Film } from "./types";

/**
 * How many rows a move has to cover before it counts for more than one duel.
 *
 * The user's number. It also happens to be about a screenful, which is the
 * natural unit for "I moved it a bit" against "I moved it somewhere else".
 */
export const MOVE_STEP = 10;

/**
 * The weight of a move, in duels.
 *
 * One for anything up to a screenful, then one more per screenful after that.
 * Capped, because the cap is what stops a drag from the bottom of an 861-film
 * library to the top writing 86 judgements from a single gesture — which would
 * outweigh every real duel that film had ever fought and could not be undone by
 * dragging it back.
 */
export const MAX_MOVE_WEIGHT = 6;

export const weightOf = (distance: number): number =>
  Math.min(MAX_MOVE_WEIGHT, Math.max(1, Math.ceil(Math.abs(distance) / MOVE_STEP)));

/**
 * The judgements a drag is worth.
 *
 * `order` is the list as the reader sees it, best first. `from` and `to` are
 * indexes into that order. Returns rows ready for the journal — the caller
 * appends them and refits, exactly as the duel screen does.
 *
 * Empty when the move is a no-op or names something that is not there, so a
 * caller never has to check first.
 */
export function judgementsForMove(
  order: readonly Film[],
  from: number,
  to: number,
): Judgement[] {
  if (from === to) return [];
  if (from < 0 || to < 0 || from >= order.length || to >= order.length) return [];

  const moved = order[from];
  if (!moved) return [];

  const up = to < from;
  // ── The films it passed, ordered from the DESTINATION end ────────────────
  //
  // This used to run from the origin end, on the reasoning that the nearest
  // comparison is the least arguable and therefore the one a single duel should
  // be spent on. That is true and it is the wrong thing to optimise, which a
  // real drag made obvious: a book hauled six rows up from the 3★s recorded one
  // win over the 3★ it started next to, lost to the row above the landing slot,
  // and settled at the BOTTOM of its new tier — nowhere near where the finger
  // put it. Reported as the item moving back rather than moving.
  //
  // The claim that actually places something is the one nearest where it
  // LANDED. "I beat the row I came to rest above" is what lifts it to that spot;
  // "I beat the row I was already next to" says almost nothing, and at weight 1
  // it is the only thing said.
  //
  // So the near end of this list is the destination, and a one-duel move spends
  // itself there. Longer moves sample back toward the origin from it, which is
  // also the right order to lose precision in.
  const passed = up ? order.slice(to, from) : order.slice(from + 1, to + 1).reverse();
  if (passed.length === 0) return [];

  // ── The film it stopped under, which is the other half of the claim ──────
  //
  // The wins alone say "better than everything from here down" and never say
  // stop, so the model is free to carry on upward — and it does. Seen on the
  // first real run: a book dropped at position 3 settled at position 1, because
  // its one win outweighed two neighbours that had never been duelled at all.
  // Nothing was wrong with the scoring; the gesture had simply not been recorded
  // in full.
  //
  // A drop also says "not better than the thing I stopped under". One row the
  // other way, against the nearest film it did NOT pass, is what makes it land
  // where the finger did. Absent at the ends of the list, where there is nothing
  // on the far side to have stopped at.
  // Both read from the order with the moved film LIFTED OUT, where landing at
  // `to` means settling between `rest[to - 1]` and `rest[to]`. Dragging up it
  // stops under the first of those; dragging down it stops over the second.
  const rest = order.filter((_, i) => i !== from);
  const anchor = up ? rest[to - 1] : rest[to];

  const weight = weightOf(to - from);
  // Spread across the span rather than bunched at one end. `Math.round` over the
  // fractional stride keeps the first pick at the near edge and the last at the
  // far one, so a weight of 1 records the closest comparison and a weight of 6
  // records the whole reach of the move.
  const picks: Film[] = [];
  for (let i = 0; i < weight; i++) {
    const at =
      weight === 1 ? 0 : Math.round((i / (weight - 1)) * (passed.length - 1));
    const opponent = passed[at];
    if (opponent && opponent.id !== moved.id && !picks.includes(opponent)) picks.push(opponent);
  }

  // `a` is always the moved film, so the outcome reads directly: dragging up is
  // a win for it, dragging down is a loss.
  const rows = picks.map((opponent) =>
    newJudgement(moved.id, opponent.id, up ? "a" : "b", "drag"),
  );

  // The stop, in the opposite direction. Guarded against naming a film already
  // in `picks`, which would be one gesture claiming both sides of a pairing.
  if (anchor && anchor.id !== moved.id && !picks.some((p) => p.id === anchor.id)) {
    rows.push(newJudgement(moved.id, anchor.id, up ? "b" : "a", "drag"));
  }

  return rows;
}

/**
 * The rating a film takes when it is dropped somewhere new.
 *
 * ── Why the rating moves ───────────────────────────────────────────────────
 *
 * The user's call: drag a 3★ up among the 4★s and it becomes a 4★. It is the
 * same rule the spanned climb uses — the rating moves, the band never does —
 * and it is the only way a drag across a boundary can mean anything at all.
 * Tier bands do not overlap, so a film that kept its 3★ would be re-scored
 * straight back below every 4★ on the next respread, and the drag would appear
 * to undo itself.
 *
 * ── Taken from the NEIGHBOURS, not from the pixel ──────────────────────────
 *
 * The rating is whatever the row it landed between already has, so the answer is
 * always a rating that exists in the library at that spot. Reading it off the
 * scroll position instead would need this function to know about tier headers
 * and section heights, and would give a different answer on the shuffled page,
 * which has neither.
 *
 * The film ABOVE wins ties. Dropping something onto the boundary between a 4★
 * and a 3★ is a claim to be above that 3★, and taking the lower rating would
 * make the drop a no-op the moment scores were rewritten.
 */
export function ratingAfterMove(
  order: readonly Film[],
  from: number,
  to: number,
): Film["rating"] | undefined {
  const moved = order[from];
  if (!moved || from === to) return undefined;

  // The order WITHOUT the moved film, so "the row above" means the row it will
  // actually sit under rather than itself.
  const rest = order.filter((_, i) => i !== from);
  const above = rest[to - 1];
  const below = rest[to];

  const landed = above?.rating ?? below?.rating;
  return landed === undefined || landed === moved.rating ? undefined : landed;
}

/**
 * The library with the film actually moved to where it was dropped.
 *
 * ── Why the position is WRITTEN and not left to the model ─────────────────
 *
 * The spec said two things and the first build only did one of them: "It should
 * reorder it accordingly. Maybe not with a hard lock as that would be
 * assumptive. But it should update its number in the order of things. As the
 * data goes, it should count as one win if its within 10…"
 *
 * Reorder it, AND count it as evidence. Only the evidence half was built, which
 * left the model to work the position out — and it cannot, because the model has
 * no way of knowing what the gesture meant. Dropping a book at position 5
 * repeatedly landed it at 7 or 8: its one recorded win put it above the row it
 * was dropped onto and below two untouched neighbours still sitting on their
 * seed, which is a defensible answer to a question nobody asked. Reported as the
 * item moving back rather than moving.
 *
 * So the order is written directly. This is NOT a lock — `lock` is untouched, so
 * a soft placement stays soft and the model may revise it the moment real duels
 * disagree. That is exactly "for the moment".
 *
 * ── Why scores are rewritten per TIER ─────────────────────────────────────
 *
 * Bands never overlap, and everything downstream depends on that: `list.ts`
 * takes a plain score sort as tier-correct, and the counts, the profile and the
 * cards all inherit it. So the requested order is applied WITHIN each affected
 * band rather than across the list — which is the same thing, because a film
 * that moved between tiers has already had its rating changed to match where it
 * landed.
 */
export function applyMove(
  films: readonly Film[],
  order: readonly Film[],
  from: number,
  to: number,
  rating?: Film["rating"],
): Film[] {
  const moved = order[from];
  if (!moved || from === to) return [...films];

  // The order the reader asked for, with the film lifted out and put back.
  const next = order.filter((_, i) => i !== from);
  next.splice(to, 0, moved);

  // The rating change comes first so the film is spread inside its NEW band.
  const ratingOf = (f: Film) => (f.id === moved.id && rating !== undefined ? rating : f.rating);

  const byTier = new Map<number, string[]>();
  for (const f of next) {
    const t = ratingOf(f);
    byTier.set(t, [...(byTier.get(t) ?? []), f.id]);
  }

  const scores = new Map<string, number>();
  for (const [tier, ids] of byTier) {
    const mn = tierMin(tier);
    const mx = tierMax(tier);
    const n = ids.length;
    // Evenly across the band, best first — the same spacing `respreadTier` and
    // `writeScores` use, so a tier that was reordered by hand and one that was
    // reordered by a climb are numerically indistinguishable.
    ids.forEach((id, i) =>
      scores.set(id, n === 1 ? Math.round((mn + mx) / 2) : Math.round(mx - (i / (n - 1)) * (mx - mn))),
    );
  }

  return films.map((f) => {
    const score = scores.get(f.id);
    if (score === undefined) return f;
    return {
      ...f,
      score,
      ...(f.id === moved.id && rating !== undefined ? { rating } : {}),
    };
  });
}
