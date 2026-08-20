// Starting over without starting from nothing.
//
// The thing people want back is the RANKING, not the library. Importing 861
// films took a Letterboxd export and twenty minutes of poster fetching, and the
// star ratings are judgements made long before this app existed — so a reset
// that threw those away would be punishing the user for wanting to rethink the
// part they actually made here.
//
// ── Why this has to take the log with it ───────────────────────────────────
//
// `withdrawSoftLocks` in shuffle.ts looks like it should be enough, and it is
// not. Soft locks are granted from BELIEFS, and beliefs are fitted from the
// evidence log — so withdrawing them and leaving the log in place means the
// model re-places every one of those films on the next fit. The comment on that
// function says so plainly: switching back "restores everything from the same
// duels rather than starting over."
//
// That makes it a good "turn the model's opinions off" and a useless "let me
// rank these again". The second needs the duels gone, which is why the two are
// offered as separate acts with different weight — and why the destructive one
// says out loud what it destroys.

import { seedScore } from "./tiers";
import type { Film } from "./types";
import { markWiped } from "./wiped";

/**
 * Every film back to unranked, keeping the film itself.
 *
 * Kept: the film, its artwork, its credits, and the star rating — everything
 * that came from the import or from TMDb.
 *
 * Cleared: `lock` (both kinds), `score` back to the tier's midpoint, and the
 * duel count. The score matters as much as the lock — leaving the old numbers
 * behind would mean an "unranked" library that still sorted itself into last
 * session's order the moment anything read it.
 */
/**
 * Wipe this browser back to a first open — films, ranking, evidence, profile,
 * saved lists, tours, preferences, the lot.
 *
 * Distinct from "Clear my ranking", which deliberately keeps your library. This
 * is for seeing the app as a new user sees it, which nothing else could do:
 * every existing reset preserves the one thing a first open does not have.
 *
 * Only `rankd-` keys, so nothing belonging to another app on the same origin is
 * touched. Sync bookkeeping goes too — leaving it would tell the next sign-in
 * this browser had already pushed a library it no longer holds.
 *
 * The caller reloads. Every screen reads the library once at mount, so clearing
 * storage underneath a live app leaves it showing a library that no longer
 * exists — the same reason `importBackup` and `pull` reload.
 *
 * ── Why this sets a flag ───────────────────────────────────────────────────
 *
 * `location.reload()` does not stop the page. Timers keep firing and in-flight
 * fetches keep resolving until the navigation actually commits, and two of them
 * write the whole library back: the credits sweep in `AppShell` flushes
 * `saveFilms(pending)` when its backfill settles, and the duel screen's poster
 * backfill does the same per film. Both hold the PRE-wipe library in a closure,
 * and the sweep's stop flag is only set by an effect cleanup that a reload never
 * runs. So the wipe cleared storage and then something quietly refilled it.
 *
 * Rather than chase every caller, the wipe raises a one-way flag (`wiped.ts`)
 * and the write paths that matter — `saveFilms` in `store.ts`, `markDirty` in
 * `syncState.ts`, `push`/`pull` in `sync.ts` — check it. One guard, and it
 * cannot be forgotten by the next thing that writes through them.
 */
export function wipeEverything(): void {
  if (typeof window === "undefined") return;
  // Raised before storage is touched, not after: a write racing the loop below
  // is exactly the case this exists to stop.
  markWiped();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("rankd-")) localStorage.removeItem(key);
    }
    // Sittings are per-tab and would otherwise survive as stale baselines.
    // BOTH of them: `visit.ts` reads its own and returns the existing recap
    // early, so leaving it meant the freshly emptied browser never opened a
    // first sitting in the tab that wiped it.
    sessionStorage.removeItem("rankd-sitting-v1");
    sessionStorage.removeItem("rankd-visit-sitting-v1");
  } catch {
    // Storage disabled. There is nothing stored to clear either.
  }
}

/**
 * Delete the account's copy as well, so signing in again does not hand the
 * library straight back.
 *
 * Throws on failure, and the caller must NOT wipe locally if it does: a browser
 * emptied while the mirror survives is precisely the state that pulls itself
 * back, which is the bug this whole path exists to fix. Better to leave
 * everything as it was and say so.
 */
export async function wipeAccount(): Promise<void> {
  const [library, lists] = await Promise.all([
    fetch("/api/library", { method: "DELETE" }),
    fetch("/api/lists?all=1", { method: "DELETE" }),
  ]);
  // 401 is a success here, not a failure: it means nobody is signed in, so
  // there is no account copy to delete and the local wipe is the whole job.
  for (const res of [library, lists]) {
    if (!res.ok && res.status !== 401) throw new Error("The account copy couldn't be deleted.");
  }
}

export function resetRanking(films: readonly Film[]): Film[] {
  return films.map((f) => {
    const next: Film = { ...f, score: seedScore(f.rating) };
    delete next.lock;
    delete next.duels;
    return next;
  });
}
