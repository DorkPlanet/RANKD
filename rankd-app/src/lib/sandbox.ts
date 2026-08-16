// Is the app currently pretending?
//
// ── What this protects ─────────────────────────────────────────────────────
//
// The tutorial shows the real screens working on the five seed films. Those
// screens are the real components — that is the whole point, a mock would drift
// from the app within a month — and the real components write. `saveFilms` runs
// from ten places across two files, the credits sweep saves in batches from a
// background walk, and a duel appends to the log.
//
// The log is the strict one. Every belief, badge, score and review card in this
// app rests on it being LITERALLY TRUE: a row means two films were compared and
// a person chose. A demonstration duel is not that. `settle` cannot tell the
// difference, so something has to, and the honest place is the boundary where
// the write happens rather than at each of the callers who might forget.
//
// ── Why a module flag and not a prop ───────────────────────────────────────
//
// Threading `sandbox` from AppShell down through DuelScreen into RoughCut,
// ShuffleDuel and the credits sweep would be a dozen new props whose only job
// is to be passed along, and the bug would be the one place that forgot. This
// is a property of the whole app for the duration of a tutorial, and it reads
// like one.
//
// It is deliberately write-only in scope: reads are untouched, so the tutorial
// sees the same library the app does. Nothing here makes anything harder to
// reason about at runtime, because the flag is on for exactly as long as the
// tutorial is on screen and off everywhere else.
//
// A leaf module, importing nothing, so any writer can guard on it without
// creating a cycle — same reason `syncState.ts` is one.

let sandbox = false;

/** Guard at the top of anything that PERSISTS. Reads must not consult this. */
export function isSandbox(): boolean {
  return sandbox;
}

/**
 * Turn pretending on or off.
 *
 * Called by the tutorial on mount and — critically — in its cleanup, so a tour
 * abandoned by navigating away, backgrounding the tab or a crash mid-step
 * cannot leave the app unable to save. Failing ON would be silent and total
 * data loss, so every exit path has to clear it.
 */
export function setSandbox(on: boolean): void {
  sandbox = on;
}
