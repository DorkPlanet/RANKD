import type { Film } from "./types";
import { migrateLock } from "./lock";
import { isSandbox } from "./sandbox";
import { SEED_FILMS } from "./seed";
import { markDirty } from "./syncState";

// Local-first persistence. The master library lives in localStorage and is
// mirrored to an account when there is one (see sync.ts).
const KEY = "rankd-app-v1";

/**
 * The library, or nothing.
 *
 * ── Why a new browser is EMPTY ─────────────────────────────────────────────
 *
 * This used to return `SEED_FILMS`, so opening the app for the first time
 * handed you ten films somebody else had chosen and rated. People read that as
 * their library and could not tell which part was theirs — a wrong default
 * dressed as a starter kit.
 *
 * A real user arrives with a library to import or with nothing, and both are
 * fine. Nothing is a legitimate state the screens now say out loud, and the
 * import is the onboarding. The seed films still exist, but as the tutorial's
 * cast — they are displayed, never written, and never yours.
 *
 * An unreadable payload also returns nothing rather than the sample set.
 * Silently replacing a corrupt library with somebody else's films would look
 * exactly like the data loss it is.
 */
export function loadFilms(): Film[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    // Migrated on the way in, so every reader downstream sees `lock` and the
    // legacy `confirmed` flag exists nowhere except this one line.
    if (raw) return (JSON.parse(raw) as Film[]).map(migrateLock);
  } catch {
    // ignore corrupt/absent storage
  }
  return [];
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
  // The tutorial drives the real screens over the sample films. They write like
  // any other run; nothing they write is yours. See lib/sandbox.ts.
  if (isSandbox()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(films.filter((f) => !f.guest)));
    markDirty();
  } catch {
    // storage full / disabled — nothing we can do, and nothing to fall back to
  }
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
/**
 * The ten films this app used to hand every new browser.
 *
 * Frozen, and deliberately not derived from anything. They are no longer the
 * seed set and no build will ever write them again — but devices that ran the
 * old build are still holding them, and the check below is the only thing
 * standing between one of those devices and a conflict chooser offering "ten
 * films" against the account it just signed into.
 *
 * Dropping this list would not fail a test. It would reintroduce, for existing
 * users only, the exact bug `isUntouchedSeed` was written to prevent — which is
 * why it is a list of strings and not a lookup into `seed.ts`.
 */
const LEGACY_SEED_IDS = [
  "the-godfather-1972",
  "dune-2021",
  "inception-2010",
  "the-dark-knight-2008",
  "interstellar-2014",
  "la-la-land-2016",
  "ex-machina-2014",
  "sicario-2015",
  "gone-girl-2014",
  "drive-2011",
] as const;

export function isUntouchedSeed(films: readonly Film[]): boolean {
  // Nothing at all is not "an untouched sample" — it is a browser with no
  // library, which every caller already handles by its own route.
  if (films.length === 0) return false;
  if (films.some((f) => f.lock !== undefined || (f.duels ?? 0) > 0)) return false;

  const matches = (ids: readonly string[]) => {
    if (films.length !== ids.length) return false;
    const set = new Set<string>(ids);
    return films.every((f) => set.has(f.id));
  };

  return matches(SEED_FILMS.map((f) => f.id)) || matches(LEGACY_SEED_IDS);
}

/** Does this browser hold a library sync should treat as real? */
export function hasRealLibrary(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(KEY) === null) return false;
  return !isUntouchedSeed(loadFilms());
}
