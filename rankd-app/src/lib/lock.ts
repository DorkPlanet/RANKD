// How a film came to have a position.
//
// There are two ways, and conflating them was a real bug. Phase 2 used one
// `confirmed` flag for both, which meant Fast Shuffle FROZE ITS OWN OUTPUT: the
// moment the model placed a film it was pinned in the order it happened to hold
// at that instant, so the model's earliest and weakest estimate outlived every
// better one it formed afterwards. It also made the "include films I've already
// placed" tickbox all-or-nothing — you could not say "revisit what you worked
// out, leave what I decided".
//
//   SOFT — the model's placement. It crossed the confidence threshold, so it
//          gets a number, but it is still the model's opinion: it stays in the
//          shuffle pool and stays free to move as the evidence improves.
//   HARD — the user's commitment. Earned through a confirm. Pinned, excluded
//          from the pool, and never touched by the model.
//
// A hard lock always beats a soft one. Nothing ever downgrades a hard lock to a
// soft one — the model does not get to take back a decision the user made.

import type { Film } from "./types";

export type Lock = "soft" | "hard";

/** Has a position, however it got one — this is what earns a number in the list. */
export const isPlaced = (film: Film): boolean => film.lock !== undefined;

/** The user committed to this. Pinned, and the model may not move it. */
export const isHard = (film: Film): boolean => film.lock === "hard";

/** The model placed this. It counts, but it is still up for revision. */
export const isSoft = (film: Film): boolean => film.lock === "soft";

/**
 * Read a film's lock, tolerating libraries written before locks existed.
 *
 * Old saves carry `confirmed: true`, which could only ever have been a user
 * confirm — auto-placement did not exist when they were written — so it reads as
 * HARD. Applied on load (see `store.ts`) rather than scattered through readers,
 * so the rest of the app only ever sees `lock`.
 */
export function migrateLock(film: Film & { confirmed?: boolean }): Film {
  if (film.lock !== undefined) return film;
  if (!film.confirmed) return film;
  const migrated: Film & { confirmed?: boolean } = { ...film, lock: "hard" };
  delete migrated.confirmed;
  return migrated;
}
