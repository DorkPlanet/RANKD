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
  // The films it passed over, nearest first. Nearest matters: a sample taken
  // from this end is the closest comparison the move makes and the least
  // arguable, so it is the one that is always included.
  const passed = up ? order.slice(to, from).reverse() : order.slice(from + 1, to + 1);
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
