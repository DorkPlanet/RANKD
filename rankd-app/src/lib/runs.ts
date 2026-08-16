// The climb you were in the middle of, kept across closing the app.
//
// Scores and locks were never at risk — those are written as you go. What was
// lost with the tab is the working state: the pile's order, which film was
// climbing, and which one it was about to face.
//
// ── Tier climbs only ───────────────────────────────────────────────────────
//
// · King of the Hill is stored: every film is in the library, so ids rebuild it.
// · A CURATED run is not. It can borrow films you have never seen, and guests
//   exist nowhere but in that run, so resuming one needs whole `Film` objects
//   rather than ids. See the handover's roadmap.
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

import type { Film, PlacementSession } from "./types";

const KEY = "rankd-run-v1";

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
    if (!isResumable(keep)) return void localStorage.removeItem(KEY);
    localStorage.setItem(KEY, JSON.stringify(keep));
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
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as PlacementSession;
    if (!isResumable(s) || !Array.isArray(s.unconfirmed) || !Array.isArray(s.confirmed)) {
      localStorage.removeItem(KEY);
      return null;
    }
    const have = new Set(films.map((f) => f.id));
    if (!idsOf(s).every((id) => have.has(id))) {
      localStorage.removeItem(KEY);
      return null;
    }
    // A climb needs something left to climb. One film cannot duel.
    if (s.unconfirmed.length < 2 && !s.needsConfirm) {
      localStorage.removeItem(KEY);
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
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; `loadRun` validates anyway.
  }
}
