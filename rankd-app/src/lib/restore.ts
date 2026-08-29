// A way back from the things that cannot otherwise be taken back.
//
// ── What has no undo today ─────────────────────────────────────────────────
//
// "Clear my ranking" and "Drop the N Fast Shuffle placed" both rewrite every
// film in the library in one press, and a Rough Cut commit rewrites a whole
// tier. None of them can be reversed. The evidence log survives a drag and a
// duel — it is append-only and tombstoned — but it holds JUDGEMENTS, not
// placements: it cannot tell you what score a film had before a reset, because
// a score was never written there.
//
// So the missing piece is small and specific. Four fields per film, taken
// immediately before anything structural, kept for the last few operations.
//
// ── What a restore point is NOT ────────────────────────────────────────────
//
// It is not a backup and must never be sold as one. It carries no titles, no
// artwork, no duels and no saved rankings — restoring one onto a library that
// has since had films REMOVED cannot bring them back, because their titles were
// never here to bring. `missingFrom` counts them so the screen can say so
// rather than quietly restoring less than it promised.
//
// It also does not restore the LOG. "Clear my ranking" erases the duels as well
// as the placements, and a restore point puts the placements back and leaves the
// evidence gone. That is worth saying out loud wherever this is offered.
//
// ── Device-local, forever ──────────────────────────────────────────────────
//
// Excluded from `SYNC_KEYS` and from every entry in `FILE_KEYS_BY_FORMAT`, for
// the reason `runs.ts` gives about an unfinished climb and one more besides: an
// undo stack is a record of what THIS device did in the last few minutes.
// Merging two devices' stacks has no correct answer, and restoring one from a
// file would offer to undo an operation that happened on another machine, to a
// library that has moved on since.

import type { Film } from "./types";
import type { Lock } from "./lock";
import type { Rating } from "./tiers";
import { keyFor } from "./medium";

// See the note in `runs.ts` on why every key here is a function: `currentMedium`
// answers "film" during the server render, so a module-level const would bake in
// the wrong medium for that pass.
const KEY = () => keyFor("rankd-restore-v1");

/**
 * How many points are kept.
 *
 * Four fields per film is roughly 40 bytes, so a 861-film library costs about
 * 35KB a point and five of them 175KB — comfortably inside a localStorage
 * budget that also holds the library and the log. The cap matters more as a
 * design choice than as a size one: a stack you can scroll is a history, and a
 * history is a feature nobody asked for. Five is "the last few things I did".
 */
export const MAX_POINTS = 5;

/** One film's placement, and nothing else about it. */
export interface Snap {
  id: string;
  rating: Rating;
  score: number;
  /** Absent means the film was unplaced when the point was taken. */
  lock?: Lock;
}

export interface RestorePoint {
  id: string;
  /** Epoch ms, so the screen can say "4 minutes ago" without storing a string. */
  at: number;
  /** What was about to happen. Written by the caller, shown verbatim. */
  label: string;
  films: Snap[];
}

/** The four fields worth keeping, for every film that has them. */
export function snapshot(films: readonly Film[]): Snap[] {
  return films.map((f) => {
    const s: Snap = { id: f.id, rating: f.rating, score: f.score };
    // Written only when there is one, so an unplaced film costs three fields
    // rather than four and `applyPoint` can tell "was unplaced" from "unknown".
    if (f.lock) s.lock = f.lock;
    return s;
  });
}

export function loadPoints(): RestorePoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RestorePoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // A corrupt undo stack is worth nothing and must not take the screen down
    // with it. Losing it costs an undo; throwing costs Settings.
    return [];
  }
}

function save(points: RestorePoint[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY(), JSON.stringify(points));
  } catch {
    // Storage full. An undo stack is the first thing that should go when the
    // library and the log are competing for the same budget, so this is silent
    // by design — see the same decision in `store.ts`.
  }
}

/**
 * Record where the ranking stands, immediately BEFORE changing it.
 *
 * Returns the point so a caller can undo its own operation without going back
 * to storage, and so a test can assert on what was taken.
 *
 * An empty library takes no point: there is nothing to come back to, and an
 * empty entry in the list would offer an undo that does nothing.
 */
export function takePoint(label: string, films: readonly Film[]): RestorePoint | null {
  if (films.length === 0) return null;
  const point: RestorePoint = {
    // Time plus a suffix: two points can be taken in the same millisecond by a
    // caller that batches, and the id is what the list keys on.
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    label,
    films: snapshot(films),
  };
  // Newest first, so the list reads top-down as "most recent thing I did" and
  // the cap drops the oldest.
  save([point, ...loadPoints()].slice(0, MAX_POINTS));
  return point;
}

/**
 * Put the ranking back, and leave everything else exactly as it is.
 *
 * Only the three placement fields are written. A film's title, artwork, credits
 * and tags are whatever they are NOW — a restore point is not a backup and must
 * not undo an edit it never recorded.
 *
 * Films added since the point was taken are untouched rather than deleted. They
 * were not part of the operation being undone, and removing them would make
 * this destructive in a way its name promises it is not.
 */
export function applyPoint(point: RestorePoint, films: readonly Film[]): Film[] {
  const by = new Map(point.films.map((s) => [s.id, s]));
  return films.map((f) => {
    const s = by.get(f.id);
    if (!s) return f;
    const back: Film = { ...f, rating: s.rating, score: s.score };
    // Deleted rather than set to `undefined`: unplaced is the absence of the
    // key, and `isPlaced` is not the only reader of this shape.
    if (s.lock) back.lock = s.lock;
    else delete back.lock;
    return back;
  });
}

/**
 * Films the point remembers that the library no longer holds.
 *
 * A restore cannot bring these back — their titles were never stored here — so
 * the number exists to be SAID rather than to be fixed. Restoring a point taken
 * before you removed a film gives you back everything except that film, and
 * silently is the wrong way to do it.
 */
export function missingFrom(point: RestorePoint, films: readonly Film[]): number {
  const have = new Set(films.map((f) => f.id));
  return point.films.filter((s) => !have.has(s.id)).length;
}

/** Forget one point — after it has been used, or when it is no longer true. */
export function dropPoint(id: string): void {
  save(loadPoints().filter((p) => p.id !== id));
}

/** Forget all of them. Called by the full wipe, which owns every key. */
export function clearPoints(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY());
  } catch {
    /* nothing to do */
  }
}
