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

/** The app's one easing. Also `globals.css` — sheets, splash, coach marks. */
export const EASE = "cubic-bezier(0.2, 0.8, 0.3, 1)";

/**
 * Half a page turn, in ms.
 *
 * The profile's track slides once, over 300ms. The list turns in two halves —
 * out, then in — so each is half that and the two gestures take the same time.
 */
export const TURN_MS = 150;

/**
 * The parts of the current screen that travel: everything but its chrome.
 *
 * The header, the nav and any `.chrome-hold` band stay exactly where they are.
 * An earlier version moved `main` and gave each bar the inverse offset so the
 * two would cancel; the maths was right and the result was wrong, because
 * `main` is `overflow-hidden` and a bar pushed back to its old place is outside
 * the box of the parent that moved. It was clipped, not pinned. Leaving `main`
 * alone makes that same `overflow-hidden` useful instead: it is what crops the
 * page cleanly at the screen edge.
 */
function pageLayers(): HTMLElement[] {
  const main = document.querySelector("main");
  if (!main) return [];
  return [...main.children].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      el.tagName !== "HEADER" &&
      el.tagName !== "NAV" &&
      !el.classList.contains("chrome-hold"),
  );
}

/**
 * Drag the current screen sideways under a finger.
 *
 * DOM straight, no React. This runs on every touchmove; routing it through state
 * would re-render a screen to move one layer.
 *
 * `null` means let go without turning: everything eases back where it started.
 */
export function dragScreen(px: number | null): void {
  for (const el of pageLayers()) {
    el.style.transition = px === null ? `transform ${TURN_MS}ms ${EASE}` : "none";
    el.style.transform = px ? `translateX(${px}px)` : "";
  }
}

/**
 * Walk the screen you are leaving off the edge, then call back.
 *
 * ── Why the outgoing screen has to move ────────────────────────────────────
 *
 * It used to vanish the instant the next one was chosen, so the arriving screen
 * slid in over bare page background. That reads as a wipe rather than a turn:
 * nothing left, something arrived.
 *
 * ── And why the mount lands between the two halves ─────────────────────────
 *
 * A screen is expensive to build. Mounting one in the same commit that starts
 * its animation spends the first frames of that animation on the mount, which is
 * the chop. Leaving first gives the build a gap of its own, and a frame dropped
 * between two movements is far harder to see than one dropped inside a movement.
 *
 * `travelled` is how far across the finger already got, 0 to 1. The exit is timed
 * against the remainder for the same reason the list's is: a fixed duration from
 * most of the way across overtakes the hand that let go.
 */
export function exitScreen(dir: Dir, travelled: number, done: () => void): void {
  const layers = pageLayers();
  if (!layers.length) return done();
  const ms = Math.max(70, Math.round(TURN_MS * (1 - Math.min(1, travelled))));
  for (const el of layers) {
    el.style.transition = `transform ${ms}ms ${EASE}`;
    el.style.transform = `translateX(${dir * -100}%)`;
  }
  // A timer rather than transitionend: the callback must fire even if the
  // element is torn down mid-flight, and a navigation that never happens is a
  // far worse failure than one that happens a frame early.
  window.setTimeout(done, ms);
}
