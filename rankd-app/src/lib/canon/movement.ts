// What moved, and by how much.
//
// The reason the history table exists: "where it is against where it was."
// Pure, so it can be tested without a database and run on either side.

import type { SnapshotEntry } from "../snapshot";

/** Positive means it went UP the ranking, which is towards rank 1. */
export type Move = number | "new";

/**
 * Compare two orders.
 *
 * A film absent from `then` is `"new"`, which is a different claim from moving a
 * long way and has to be said differently: "up 400 places" for something that
 * was not in the canon at all would be inventing a position it never held.
 *
 * A film absent from `now` is simply not reported. It has left the canon, and
 * the caller is describing what is there rather than what is gone.
 */
export function movement(
  now: readonly SnapshotEntry[],
  then: readonly SnapshotEntry[],
): Map<string, Move> {
  const before = new Map(then.map((e) => [e.i, e.r]));
  const out = new Map<string, Move>();

  for (const entry of now) {
    const was = before.get(entry.i);
    // Ranks count DOWN towards the top, so an improvement is a decrease. The
    // subtraction is this way round so the number the reader sees is positive
    // when the film went up, which is what "up 4" means.
    out.set(entry.i, was === undefined ? "new" : was - entry.r);
  }
  return out;
}

/**
 * How a move reads on the page.
 *
 * Here rather than in a component because it is the sentence, and the sentence
 * has rules: `VOICE.md` bans em dashes, wants contractions, and forbids
 * inventing a number. "Held" rather than "0" or "no change", because a film that
 * did not move has not done anything worth quantifying.
 *
 * Returns null when there is nothing worth saying, so the caller renders nothing
 * rather than a blank chip.
 */
export function describeMove(move: Move | undefined, window: string): string | null {
  if (move === undefined) return null;
  if (move === "new") return `New this ${window}`;
  if (move === 0) return "Held";
  return move > 0 ? `Up ${move} this ${window}` : `Down ${Math.abs(move)} this ${window}`;
}
