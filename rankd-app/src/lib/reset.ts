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
 */
export function wipeEverything(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("rankd-")) localStorage.removeItem(key);
    }
    // A sitting is per-tab and would otherwise survive as a stale baseline.
    sessionStorage.removeItem("rankd-sitting-v1");
  } catch {
    // Storage disabled. There is nothing stored to clear either.
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
