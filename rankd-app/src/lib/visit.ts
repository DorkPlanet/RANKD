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

export interface VisitDelta {
  duels: number;
  settled: number;
  films: number;
  badges: number;
  /** When the previous sitting began. */
  since: string;
}

/**
 * What changed between two snapshots, or null if there is nothing worth saying.
 *
 * Returns null rather than a row of zeros. "0 duels, 0 settled" is not a recap,
 * it is an accusation, and it is what a first-time visitor would otherwise be
 * greeted with.
 *
 * Negative deltas are floored at zero: resetting the ranking (see lib/reset.ts)
 * moves every one of these counts DOWN, and "-154 duels" is not a thing anyone
 * should read on their own profile.
 */
export function deltaOf(record: VisitRecord): VisitDelta | null {
  const { prev, current } = record;
  if (!prev) return null;
  const delta: VisitDelta = {
    duels: Math.max(0, current.duels - prev.duels),
    settled: Math.max(0, current.settled - prev.settled),
    films: Math.max(0, current.films - prev.films),
    badges: Math.max(0, current.badges - prev.badges),
    since: prev.at,
  };
  const nothing = !delta.duels && !delta.settled && !delta.films && !delta.badges;
  return nothing ? null : delta;
}

/**
 * The four counts, taken the same way everywhere else takes them.
 *
 * A function rather than an object literal at the call site, so "settled means
 * HARD locks" is enforced by code instead of promised by a comment — the same
 * rule `achievements.ts` states about itself, for the same reason: a soft lock
 * the model granted is not something the user did last Tuesday.
 *
 * `duels` is the number of ROWS IN THE LOG, which is the number of head-to-heads
 * actually fought. It is deliberately not `fingerprint().duels`, which sums a
 * per-film counter that `settle` increments on BOTH sides of every duel. The
 * number this recap reports must be the one the player watched go up: RunStatus
 * says "24 duels this sitting" from the same log rows, so next time this can say
 * "last time — 24 duels" and mean it.
 */
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

/**
 * The recap as a sentence: "24 duels · 6 settled".
 *
 * Only non-zero parts appear. A sitting spent entirely on duels should not have
 * "0 settled" appended to it as though something were missing — `deltaOf` has
 * already guaranteed at least one part is non-zero, so this never returns "".
 *
 * `·` rather than commas because that is the separator `RunStatus` uses for the
 * live version of this exact line. One vocabulary, not three.
 */
export function recapLine(delta: VisitDelta): string {
  const parts: string[] = [];
  const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
  if (delta.duels) parts.push(plural(delta.duels, "duel"));
  if (delta.settled) parts.push(`${delta.settled} settled`);
  if (delta.films) parts.push(`${plural(delta.films, "film")} added`);
  if (delta.badges) parts.push(plural(delta.badges, "badge"));
  return parts.join(" · ");
}

/**
 * When that sitting was — "yesterday", "3 days ago".
 *
 * Counted in CALENDAR days, not 24-hour blocks. Someone who played at 11pm and
 * came back at 9am has been away nine hours, and every one of them means
 * "yesterday" rather than "earlier today". Rounding the difference between two
 * local midnights also survives daylight saving, where a day is 23 or 25 hours.
 *
 * It gets vaguer as it gets older on purpose: the point of the line is to place
 * the recap in memory, and past a fortnight nobody is counting days.
 */
export function agoLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";

  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(then)) / 86_400_000);

  if (days <= 0) return "earlier today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  const weeks = Math.floor(days / 7);
  if (weeks === 1) return "last week";
  if (days < 60) return `${weeks} weeks ago`;

  const months = Math.round(days / 30);
  return `${months} months ago`;
}

/** Read the record without touching it. */
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
