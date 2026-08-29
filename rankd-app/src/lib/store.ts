import type { Film } from "./types";
import { migrateLock } from "./lock";
import { markDirty } from "./syncState";
import { isWiped } from "./wiped";
import { keyFor, allKeysFor } from "./medium";

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

// Local-first persistence. The master library lives in localStorage and is
// mirrored to an account when there is one (see sync.ts).
//
// One key PER MEDIUM. Films keep `rankd-app-v1` exactly, so no existing library
// moves and there is nothing to migrate; books live under a suffixed key of
// their own. See lib/medium.ts for why the medium switches which store is read
// rather than filtering one shared list.
const KEY = () => keyFor("rankd-app-v1");

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
    const raw = localStorage.getItem(KEY());
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
    localStorage.setItem(KEY(), JSON.stringify(films.filter((f) => !f.guest)));
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

/**
 * Does this browser hold a library sync should treat as real?
 *
 * ── ANY medium, not the one currently on screen ────────────────────────────
 *
 * This asked `KEY()`, which is the ACTIVE medium's key, and that produced an
 * infinite reload loop the moment anybody switched to books:
 *
 *   1. Switching to books leaves `rankd-app-v1:book` absent — nothing has
 *      written it yet.
 *   2. This returned false, so `reconcile` was told the browser holds no
 *      library at all.
 *   3. With a library on the server that means "a new phone, take the account's
 *      copy" — an unambiguous `pull`.
 *   4. `pull()` ends in `window.location.reload()`.
 *   5. The app reopens still in books, the book library is still empty, and it
 *      is step 2 again. Splash screen, forever, with no way back to the header
 *      to switch out of it.
 *
 * Films never hit this because `saveFilms` writes their key on the first run,
 * so it exists even when it holds `[]`.
 *
 * The mistake was answering a question narrower than the one being asked. Sync
 * spans every medium — `SYNC_KEYS` carries both libraries — so what it needs to
 * know is whether this browser holds anything worth protecting ANYWHERE, not
 * whether the medium being looked at happens to have something in it.
 *
 * Per-medium semantics are otherwise unchanged: an absent key is nothing, the
 * legacy sample set is nothing (see `isUntouchedSeed`), and a present key is a
 * real library. Only the OR across mediums is new, so a film-only browser gets
 * exactly the answer it got before.
 */
export function hasRealLibrary(): boolean {
  if (typeof window === "undefined") return false;

  return allKeysFor("rankd-app-v1").some((key) => {
    const raw = localStorage.getItem(key);
    // Absent is nothing. Present-but-empty is deliberately NOT nothing: that is
    // a browser the app has run on, which is the state that kept films out of
    // the loop above, and narrowing it here would put them in it.
    if (raw === null) return false;

    // The legacy sample set only ever existed for films, so it is the only
    // medium that can be "present but not worth protecting".
    if (key !== "rankd-app-v1") return true;
    try {
      return !isUntouchedSeed((JSON.parse(raw) as Film[]).map(migrateLock));
    } catch {
      // Unreadable is not the same as absent. Something is stored here, and
      // claiming otherwise invites the pull that overwrites it.
      return true;
    }
  });
}
