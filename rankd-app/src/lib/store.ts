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
