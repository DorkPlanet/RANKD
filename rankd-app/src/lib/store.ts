import type { Film } from "./types";
import { migrateLock } from "./lock";
import { SEED_FILMS } from "./seed";
import { markDirty } from "./syncState";

// Local-first persistence. No backend yet — the master library lives in
// localStorage, seeded on first run. (Accounts/sync arrive in a later phase.)
const KEY = "rankd-app-v1";

export function loadFilms(): Film[] {
  if (typeof window === "undefined") return SEED_FILMS;
  try {
    const raw = localStorage.getItem(KEY);
    // Migrated on the way in, so every reader downstream sees `lock` and the
    // legacy `confirmed` flag exists nowhere except this one line.
    if (raw) return (JSON.parse(raw) as Film[]).map(migrateLock);
  } catch {
    // ignore corrupt/absent storage — fall through to seed
  }
  return SEED_FILMS;
}

// Guests are stripped HERE rather than at each call site.
//
// A person run puts borrowed films — ones you have never seen — into the pile,
// and the pile is `RankState.films`, which is what every write hands to this
// function. Two call sites already remembered to filter them (`onFilms` and
// `onMeta` in the duel screen); the climb added a third, and "remember to
// filter" is a rule that only matters at the moment it is forgotten. One choke
// point means no path can persist a film the user never logged, whatever it
// does upstream. See `guest` in lib/types.ts.
export function saveFilms(films: Film[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(films.filter((f) => !f.guest)));
    markDirty();
  } catch {
    // storage full / disabled — nothing we can do, and nothing to fall back to
  }
}

export function resetFilms(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

/**
 * Is this library still the untouched starter set?
 *
 * Sync needs to know whether a browser holds anything WORTH KEEPING, which is
 * not the same question as whether the key exists. A fresh install shows the
 * seed immediately and the credits sweep writes it to storage within seconds —
 * so by the time anyone signs in, the key is there and a naive check calls it a
 * real library. On a new phone that produced a conflict chooser offering "10
 * films" against "861 films": a frightening question with an obvious answer,
 * asked on the one device that had nothing to lose.
 *
 * Three conditions, all required. The ids must be exactly the seed's, nothing
 * may be placed, and nothing may have been duelled — so a library that merely
 * STARTED as the seed stops counting as untouched the moment any judgement
 * lands on it, which is the point at which it becomes worth protecting.
 */
export function isUntouchedSeed(films: readonly Film[]): boolean {
  if (films.length !== SEED_FILMS.length) return false;
  if (films.some((f) => f.lock !== undefined || (f.duels ?? 0) > 0)) return false;
  const seeded = new Set(SEED_FILMS.map((f) => f.id));
  return films.every((f) => seeded.has(f.id));
}

/** Does this browser hold a library sync should treat as real? */
export function hasRealLibrary(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(KEY) === null) return false;
  return !isUntouchedSeed(loadFilms());
}
