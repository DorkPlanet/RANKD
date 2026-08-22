// The app as one horizontal ribbon.
//
// ── Why a shared list rather than a swipe handler per screen ────────────────
//
// The screens already sit in an order: the bottom bar reads Your list, Log a
// film, Rank, Activity, You, and the user asked to be able to swipe along it
// rather than only tap into it. Three components own that gesture — the list,
// the duel and the profile — and if each held its own idea of what comes next,
// adding Activity would mean editing three files and getting three answers.
//
// So the order lives here once. `Log a film` is not in it: it is a sheet over
// whatever you were on, not a place. Activity is not in it YET, and slots
// between `duel` and `profile` on the day it becomes a screen — one line, and
// every swipe in the app learns about it at the same moment.
//
// ── Two screens have pages of their own, and they go first ─────────────────
//
// The list turns between its four states (everything, locked, shuffled,
// un-rnkd) and the profile turns between its three panels. A swipe there is
// about the page, and only a swipe that has run out of pages is about the
// screen. Those components decide that for themselves and call `stepScreen`
// when they reach their own edge, because only they know where their edge is.
//
// ── The continue screen falls out and needs no code ────────────────────────
//
// Arriving at the duel from elsewhere already bumps `greet` in `AppShell.go`,
// and `DuelScreen` already shows `ResumeOverlay` when a run is waiting. Routing
// a swipe through `go` means swiping back into a run mid-flight lands on the
// offer to continue rather than dropping you into a duel you had left, and
// nothing new had to be written for it.

/** The screens you can swipe between, left to right. */
export const RIBBON = ["list", "duel", "profile"] as const;

export type RibbonScreen = (typeof RIBBON)[number];

/** Which way a swipe is going. `1` is a finger moving left, revealing what is to the right. */
export type Dir = -1 | 1;

/**
 * The screen one step along, or `null` at either end.
 *
 * Null rather than a wrap-around. A ribbon that loops means swiping left from
 * the list lands on the profile, which reads as the app jumping rather than as
 * a run of pages — and there is no way to feel where you are in something with
 * no ends.
 */
export function stepScreen(from: RibbonScreen, dir: Dir): RibbonScreen | null {
  const next = RIBBON.indexOf(from) + dir;
  return next >= 0 && next < RIBBON.length ? RIBBON[next] : null;
}

/** How far across a page a swipe must travel before it turns it. */
export const TURN_AT = 0.22;

/**
 * Which page a horizontal swipe lands on, given where it started.
 *
 * Shared so the list and the profile agree about what counts as a turn. Returns
 * `"before"` or `"after"` when the swipe ran off the ends, which is the caller's
 * cue to hand the gesture to `stepScreen`.
 */
export function pageAfterSwipe(
  page: number,
  last: number,
  dx: number,
  width: number,
): number | "before" | "after" {
  if (Math.abs(dx) <= width * TURN_AT) return page;
  if (dx < 0) return page < last ? page + 1 : "after";
  return page > 0 ? page - 1 : "before";
}
