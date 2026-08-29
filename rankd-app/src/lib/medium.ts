// Which medium the app is currently about.
//
// ── The premise ────────────────────────────────────────────────────────────
//
// Films and books are ranked by the same engine and share no list. `ladder.ts`,
// `bayes.ts` and `matchmaker.ts` know about ids and ratings, not films — so the
// ranking needs nothing from this file. What is film-specific is the metadata
// source, the artwork, and every piece of copy. This is where that stops being
// hardcoded.
//
// ── Why one active medium rather than a filter ─────────────────────────────
//
// The alternative was one library with a `medium` field on each record and a
// filter at every read. That is a rule you have to remember at fifty call sites,
// and the app is built on the assumption that `loadFilms()` returns YOUR LIST —
// the tier counts, the profile, the taste chart and the duel pool all take it
// whole. A filter forgotten anywhere shows books inside a film ranking.
//
// So the medium switches the STORE instead. One variable decides which
// localStorage key every per-medium module reads, and nothing downstream has to
// know the concept exists. Forgetting to filter is not possible because there is
// nothing to filter.
//
// ── Films keep their keys, exactly ─────────────────────────────────────────
//
// `keyFor("rankd-app-v1")` returns `rankd-app-v1` under film and
// `rankd-app-v1:book` under book. Film is the unsuffixed case ON PURPOSE: every
// device already holding a library keeps it byte-for-byte, there is no
// migration, and a build that shipped this cannot lose anybody's films. The
// suffix costs books nothing — they have no existing data to be compatible with.
//
// `wipeEverything` walks keys by the `rankd-` prefix, so suffixed keys are
// already covered by it and by the file backup's own prefix rules.
//
// ── Read once, at module scope ─────────────────────────────────────────────
//
// Every per-medium module names its key in a module-level `const`. Turning those
// into functions of a value that could change under them would mean a store
// whose key depends on when you asked. So the medium is resolved ONCE per
// document and switching reloads — which is what `sync.ts` and `importBackup`
// already do for the same reason: every screen reads its store at mount, and
// changing what that store is underneath a live app leaves it showing a library
// that is no longer the one selected.

const MEDIUM_KEY = "rankd-medium-v1";

export const MEDIA = ["film", "book"] as const;
export type Medium = (typeof MEDIA)[number];

export const DEFAULT_MEDIUM: Medium = "film";

const isMedium = (v: unknown): v is Medium => MEDIA.includes(v as Medium);

// Resolved on first ask and never again for the life of the document. `null`
// means "not yet asked", which is distinct from "asked and found nothing" —
// the latter resolves to the default and is then cached like any other answer.
let active: Medium | null = null;

/**
 * The medium every store in this document belongs to.
 *
 * Total: unreadable or absent storage is `film`, which is the medium that
 * already has data. Falling back to `book` on a bad read would show an empty
 * library to somebody with 861 films in it.
 */
export function currentMedium(): Medium {
  if (active) return active;
  if (typeof window === "undefined") return DEFAULT_MEDIUM;
  try {
    const raw = localStorage.getItem(MEDIUM_KEY);
    active = isMedium(raw) ? raw : DEFAULT_MEDIUM;
  } catch {
    active = DEFAULT_MEDIUM;
  }
  return active;
}

/**
 * Switch medium, then reload.
 *
 * The reload is not laziness — see the header. It is the same move `pull()` and
 * `importBackup` make, and for a stronger reason: they replace the contents of a
 * store, where this replaces which store is being read at all. Every screen
 * holds its library in state from mount, every in-flight sweep holds one in a
 * closure, and `saveFilms` would write the film library into the book key.
 *
 * Switching to the medium already active does nothing rather than reloading, so
 * a stray tap on the current medium is not a page refresh.
 */
export function setMedium(m: Medium): void {
  if (typeof window === "undefined") return;
  if (currentMedium() === m) return;
  try {
    localStorage.setItem(MEDIUM_KEY, m);
  } catch {
    // Storage disabled. Reloading would land back on the old medium, so the
    // honest thing is to change nothing rather than to appear to.
    return;
  }
  window.location.reload();
}

/**
 * This medium's name for a storage key.
 *
 * Called at module scope by the stores that are per-medium. The ones that are
 * NOT — brightness, prefs, the tour, the account, sync bookkeeping — call
 * nothing and keep their plain key, because they describe the reader rather than
 * the reader's library.
 */
export function keyFor(base: string): string {
  return currentMedium() === "film" ? base : `${base}:${currentMedium()}`;
}

/** Every medium's name for a key, so a wipe or a backup can reach all of them. */
export const allKeysFor = (base: string): string[] =>
  MEDIA.map((m) => (m === "film" ? base : `${base}:${m}`));
