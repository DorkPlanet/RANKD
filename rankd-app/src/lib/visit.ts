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
