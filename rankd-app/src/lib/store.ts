import type { Film } from "./types";
import { migrateLock } from "./lock";
import { markDirty } from "./syncState";
import { isWiped } from "./wiped";

// Local-first persistence. The master library lives in localStorage and is
// mirrored to an account when there is one (see sync.ts).
const KEY = "rankd-app-v1";

/**
 * The library, or nothing.
 *
 * ── Why a new browser is EMPTY ─────────────────────────────────────────────
 *
 * This used to return a set of sample films, so opening the app for the first time
 * handed you ten films somebody else had chosen and rated. People read that as
 * their library and could not tell which part was theirs — a wrong default
 * dressed as a starter kit.
 *
 * A real user arrives with a library to import or with nothing, and both are
 * fine. Nothing is a legitimate state the screens say out loud, and the import
 * is the onboarding. The teaching happens on the reader's OWN films, the first
 * time they arrive at a screen with something on it — see lib/tour.ts.
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
  // A wiped document is on its way to a reload, and the callers still running
  // are holding the library it just deleted. See `wiped.ts`.
  if (isWiped()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(films.filter((f) => !f.guest)));
    markDirty();
  } catch {
    // storage full / disabled — nothing we can do, and nothing to fall back to
  }
}

/**
 * The ten films this app used to hand every new browser.
 *
 * Frozen, and deliberately a list of strings rather than a lookup into a module.
 * No build will ever write them again — a new library is empty — but devices
 * that ran the old build are still holding them, and this is the only thing
 * standing between one of those devices and a conflict chooser offering "ten
 * films" against the account it just signed into.
 *
 * Deleting this would not fail a test today. It would reintroduce, for existing
 * users only, the exact bug `isUntouchedSeed` exists to prevent. It can go once
 * nobody is plausibly still holding them.
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

/**
 * Is this library nothing but the old starter set?
 *
 * Sync needs to know whether a browser holds anything WORTH KEEPING, which is
 * not the same question as whether the key exists. The old build showed ten
 * sample films immediately and the credits sweep wrote them to storage within
 * seconds — so by the time anyone signed in, the key was there and a naive
 * check called it a real library. On a new phone that produced a conflict
 * chooser offering "10 films" against "861 films": a frightening question with
 * an obvious answer, asked on the one device that had nothing to lose.
 *
 * Two conditions, both required. The ids must be exactly that set, and nothing
 * may be placed or duelled — so a library that merely STARTED as the sample
 * stops counting the moment any judgement lands on it, which is the point at
 * which it becomes worth protecting.
 */
export function isUntouchedSeed(films: readonly Film[]): boolean {
  // Nothing at all is not "an untouched sample" — it is a browser with no
  // library, which every caller already handles by its own route.
  if (films.length === 0) return false;
  if (films.length !== LEGACY_SEED_IDS.length) return false;
  if (films.some((f) => f.lock !== undefined || (f.duels ?? 0) > 0)) return false;

  const set = new Set<string>(LEGACY_SEED_IDS);
  return films.every((f) => set.has(f.id));
}

/** Does this browser hold a library sync should treat as real? */
export function hasRealLibrary(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(KEY) === null) return false;
  return !isUntouchedSeed(loadFilms());
}
