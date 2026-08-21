// What has happened since you were last here.
//
// ── The honest version of "what's new" ─────────────────────────────────────
//
// Rankd is single-player and has no background process, so nothing whatsoever
// changes while the app is closed. A literal "since you were away" panel would
// be empty every single time, forever — which is a worse kind of flat than
// having no panel at all.
//
// So what this actually reports is the SHAPE OF YOUR LAST SESSION: "last time
// you were here — 24 duels, 6 films settled". That is real motion, it is true,
// and it is the thing a returning visitor has actually missed seeing, because
// the app has never once told them what a session amounted to.
//
// The same shape carries friends' activity when accounts land. A delta between
// two snapshots is a delta whoever produced it.
//
// ── Why it advances per SITTING, not per view ──────────────────────────────
//
// If the marker moved every time you looked at the profile, opening it twice
// would show a recap and then nothing, and once the profile becomes the landing
// screen it would be wiped on arrival every single time — the feature would
// erase its own subject. Advancing once per sitting means the recap describes
// the previous sitting and stays put however often you look at it.

import { achievements } from "./achievements";
import { isHard } from "./lock";
import { tasteAxes, tasteShape } from "./taste";
import type { Film } from "./types";

const KEY = "rankd-visit-v1";
/** Marks the sitting that has already advanced the marker. Per-tab, like a sitting. */
const SITTING_KEY = "rankd-visit-sitting-v1";

export interface Snapshot {
  at: string;
  films: number;
  /** Films the user committed to — hard locks only, as everywhere else. */
  settled: number;
  duels: number;
  badges: number;
  /**
   * The taste shape when this sitting began, for the chart's before/after.
   *
   * OPTIONAL, and every reader must cope without it. Records written before this
   * field existed have no shape, and so does a first sitting — in both cases the
   * chart simply draws one polygon instead of two, which is the correct answer
   * to "compared with what?" rather than a degraded one.
   *
   * A snapshot, not a running total, so it advances once per sitting like
   * everything else here. That is what makes "what tonight's ranking did" a
   * question with an answer.
   */
  shape?: Record<string, number>;
}

export interface VisitRecord {
  /** Where things stood at the start of the PREVIOUS sitting. */
  prev?: Snapshot;
  /** Where things stood at the start of this one. */
  current: Snapshot;
}

export function snapshotOf(films: readonly Film[], logRows: number): Omit<Snapshot, "at"> {
  return {
    films: films.length,
    settled: films.filter(isHard).length,
    duels: logRows,
    badges: achievements(films as Film[]).filter((b) => b.got).length,
    // Axes come from the library rather than from this snapshot, so a shape
    // taken now stays comparable with one taken later even as films are placed.
    shape: tasteShape(films, tasteAxes(films)),
  };
}

export function readVisit(): VisitRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VisitRecord) : null;
  } catch {
    return null;
  }
}

/**
 * Open a sitting: roll `current` into `prev` and take a fresh snapshot, but only
 * once per tab session. Every later call in the same sitting is a no-op, so the
 * recap does not move under the reader.
 */
export function openVisit(now: Omit<Snapshot, "at">): VisitRecord | null {
  if (typeof window === "undefined") return null;
  const snapshot: Snapshot = { ...now, at: new Date().toISOString() };
  try {
    const existing = readVisit();
    if (sessionStorage.getItem(SITTING_KEY)) return existing;
    sessionStorage.setItem(SITTING_KEY, "1");
    const next: VisitRecord = { prev: existing?.current, current: snapshot };
    localStorage.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    // Storage disabled. No recap, and nothing else breaks.
    return null;
  }
}
