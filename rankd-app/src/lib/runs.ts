// The climb you were in the middle of, kept across closing the app.
//
// Scores and locks were never at risk — those are written as you go. What was
// lost with the tab is the working state: the pile's order, which film was
// climbing, and which one it was about to face.
//
// ── Tier climbs only ───────────────────────────────────────────────────────
//
// · King of the Hill is stored: every film is in the library, so ids rebuild it.
// · A CURATED run is now stored too, under its own key and in its own shape.
//   It could not share this one: it can borrow films you have never seen, and a
//   guest exists nowhere but in that run — so ids rebuild nothing and the whole
//   `Film` has to be written. See `saveCuratedRun` at the foot of this file.
// · Fast Shuffle has no pile and no end, so there is nothing to resume.
//
// ── Device-local, forever ──────────────────────────────────────────────────
//
// Excluded from the synced payload when accounts land, and a server would not
// make it easier: an unfinished pile is working state, not a judgement, and
// `reconcile.ts` refuses to invent an answer when two devices disagree — which a
// half-climb here and a different half-climb there is exactly a case of.
//
// Excluded from the file backup for the same reason: a backup carries what you
// decided, and this is what you had not decided yet.

import type { RankSubject } from "./subject";
import type { Film, PlacementSession } from "./types";
import { keyFor } from "./medium";

// ── Why the key below is a function and not a constant ─────────────────────
//
// `const KEY = keyFor("…")` would be evaluated once, at module load. Next
// renders client components on the SERVER first, where there is no
// `localStorage` and `currentMedium()` therefore answers with the default — so a
// const would bake in "film" for that pass. The browser bundle evaluates the
// module again and would get it right, which makes this the kind of bug that
// shows up in one server-rendered frame and in no test whatsoever.
//
// A function asks at the moment of use, when the answer is knowable, and costs
// a map lookup: `currentMedium` caches after its first read.

// Per medium. An in-flight run names ids from one library, so a run resumed
// under the other medium would point at records that are not there — and the
// curated key holds whole `Film` objects, guests included. See lib/medium.ts.
const KEY = () => keyFor("rankd-run-v1");
const CURATED_KEY = () => keyFor("rankd-run-curated-v1");

/**
 * Is this a run worth keeping, and one we can rebuild from ids alone?
 *
 * `crossTier` is the flag a curated run carries, and it is the exact reason to
 * refuse: those pull in guest films.
 *
 * A promotion attempt is refused too. It is a few duels against a neighbouring
 * tier, and the run it interrupted is held on `resumeAfter` — so storing it
 * would mean either dropping that (resuming into a climb with no way back) or
 * serialising a session inside a session for a state that lasts three duels.
 * Clearing instead means a promotion abandoned by closing the tab is simply not
 * offered again, and the climb underneath it is what gets restored on the next
 * open, which is the more valuable half by a wide margin.
 */
export const isResumable = (s: PlacementSession | null): boolean =>
  !!s && !s.crossTier && !s.promotionQueue;

/** Every film the session names, so a resume cannot point at nothing. */
const idsOf = (s: PlacementSession): string[] => [
  ...s.confirmed,
  ...s.unconfirmed,
  ...(s.contenderId ? [s.contenderId] : []),
  ...(s.challengerId ? [s.challengerId] : []),
  // Gathered groups are part of the session and resume with it, so their members
  // are checked like any other id. A cluster naming a film the library no longer
  // holds would leave the engine computing a block that spans a hole in the pile.
  ...(s.clusters ?? []).flat(),
];

/**
 * Keep the run, or clear the stored one when there is nothing worth keeping.
 *
 * Called on every commit, so it is the one place that decides. Passing a session
 * this cannot resume CLEARS rather than leaves the old one behind: a stale climb
 * offered after you started a director run would be a resume into a game you had
 * already left.
 *
 * A promotion attempt is the one case that stores something OTHER than what it
 * was handed. Clearing outright would be wrong for the reason above turned
 * around: the attempt is three duels, but the climb it interrupted can be an
 * hour of work sitting on `resumeAfter`, and closing the tab mid-attempt would
 * take that down with it. So the interrupted run is what gets written. Losing
 * the attempt itself costs nothing — it is offered again the moment that film
 * tops its tier.
 */
export function saveRun(session: PlacementSession | null): void {
  if (typeof window === "undefined") return;
  try {
    const keep = session?.promotionQueue ? (session.resumeAfter ?? null) : session;
    if (!isResumable(keep)) return void localStorage.removeItem(KEY());
    localStorage.setItem(KEY(), JSON.stringify(keep));
  } catch {
    // Storage full or disabled. The run is still playable in memory; it just
    // will not survive the tab, which is exactly where this started.
  }
}

/**
 * The stored run, if it still makes sense against this library.
 *
 * Every id is checked, because the library moves underneath: films can be
 * removed from the info card, and a restored backup can replace the lot. A
 * session naming a film that no longer exists would hand `ladder.ts` a pile with
 * a hole in it, and the engine is entitled to assume its ids resolve.
 *
 * Anything unreadable, unresumable or stale returns null and is forgotten, so a
 * bad record can never wedge the app on a run it cannot start.
 */
export function loadRun(films: readonly Film[]): PlacementSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return null;
    const s = JSON.parse(raw) as PlacementSession;
    if (!isResumable(s) || !Array.isArray(s.unconfirmed) || !Array.isArray(s.confirmed)) {
      localStorage.removeItem(KEY());
      return null;
    }
    const have = new Set(films.map((f) => f.id));
    if (!idsOf(s).every((id) => have.has(id))) {
      localStorage.removeItem(KEY());
      return null;
    }
    // A climb needs something left to climb. One film cannot duel.
    if (s.unconfirmed.length < 2 && !s.needsConfirm) {
      localStorage.removeItem(KEY());
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY());
  } catch {
    // Nothing to do; `loadRun` validates anyway.
  }
}

// ── Curated runs ────────────────────────────────────────────────────────────
//
// A director, an actor or a genre, ranked against itself. Stored apart from the
// climb above, and the reason is the guests.
//
// A climb is rebuildable from ids because every film in it is in your library.
// A curated run can BORROW — a director's work you have never seen is pulled in
// for the run and never persisted anywhere else — so an id list would come back
// pointing at films that exist in no library on earth. The whole objects go in.
//
// ── What that costs, since it is the reason this was deferred ───────────────
//
// A borrowed film is a title, a year, a poster URL and some credits: on the
// order of a kilobyte. A generous director run borrows a few dozen, so the
// record is tens of kilobytes against a ~5MB budget shared with the library and
// the log. Worth measuring if runs ever get bigger; not worth avoiding now.
//
// ── Device-local, like the climb ────────────────────────────────────────────
//
// Same reasoning, and it applies harder. An unfinished pile is working state
// rather than a judgement, `reconcile.ts` refuses to invent an answer when two
// devices disagree, and a curated run additionally holds films the OTHER device
// has never heard of. Neither key is in `SYNC_KEYS` and neither belongs in a
// backup: a backup carries what you decided, and this is what you had not.

export interface CuratedRun {
  session: PlacementSession;
  subject: RankSubject;
  /** Whole films, not ids — a guest exists nowhere else. See above. */
  guests: Film[];
}

/**
 * Keep the curated run, or clear it when there is nothing worth keeping.
 *
 * The mirror of `saveRun`, including the clear-on-unresumable rule: a stored
 * director run offered after you moved to a tier climb would resume you into a
 * game you had already left.
 *
 * The test is the exact inverse of `isResumable`'s first clause. A curated
 * session IS `crossTier` — that flag is what makes it one — so this refuses
 * anything that is not.
 */
export function saveCuratedRun(run: CuratedRun | null): void {
  if (typeof window === "undefined") return;
  try {
    const s = run?.session;
    const keep = !!s && s.crossTier && !s.promotionQueue && s.unconfirmed.length >= 2;
    if (!keep) return void localStorage.removeItem(CURATED_KEY());
    localStorage.setItem(CURATED_KEY(), JSON.stringify(run));
  } catch {
    // Storage full or disabled. Playable in memory either way.
  }
}

/**
 * The stored curated run, if it still makes sense.
 *
 * Validated against the library PLUS its own guests, which is the whole
 * difference from `loadRun`: a guest is not in `films` and never will be, so
 * checking ids against the library alone would throw away every run that
 * borrowed anything — which is most of them.
 */
export function loadCuratedRun(films: readonly Film[]): CuratedRun | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CURATED_KEY());
    if (!raw) return null;
    const run = JSON.parse(raw) as CuratedRun;
    const s = run?.session;
    const shaped =
      !!s &&
      !!run.subject &&
      Array.isArray(run.guests) &&
      Array.isArray(s.unconfirmed) &&
      Array.isArray(s.confirmed) &&
      s.crossTier === true;
    if (!shaped) {
      localStorage.removeItem(CURATED_KEY());
      return null;
    }
    const have = new Set([...films.map((f) => f.id), ...run.guests.map((f) => f.id)]);
    if (!idsOf(s).every((id) => have.has(id))) {
      localStorage.removeItem(CURATED_KEY());
      return null;
    }
    // A climb needs something left to climb. One film cannot duel.
    if (s.unconfirmed.length < 2 && !s.needsConfirm) {
      localStorage.removeItem(CURATED_KEY());
      return null;
    }
    return run;
  } catch {
    return null;
  }
}

export function clearCuratedRun(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CURATED_KEY());
  } catch {
    // Nothing to do; `loadCuratedRun` validates anyway.
  }
}
