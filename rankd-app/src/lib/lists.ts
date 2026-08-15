// Rankings you decided to keep.
//
// ── Why a saved list stores films and not a query ───────────────────────────
//
// The tempting version is a live view: save "Michael Mann, director" and
// re-derive the order whenever it is opened. It would be smaller, it would never
// go stale, and it would be wrong. A saved list is a thing the user MADE — they
// sat through the duels and settled on that order. Re-deriving it means the list
// silently rearranges itself the next time the model learns something, and the
// #1 they chose is one belief update away from being someone else's. Worse, it
// could not hold a guest film at all: those are borrowed for a session and are
// not in the library to re-derive from.
//
// So the order FREEZES at save time. (Decision taken; see HANDOVER.md.) A list
// is a snapshot of an answer, not a standing query.
//
// Titles ride along with the ids for the same reason. A list naming a film that
// was later removed from the library should still be readable — losing the film
// costs its poster, not the row. `hydrate` is where the two are reconciled.

import type { RankSubject } from "./subject";
import type { Rating } from "./tiers";
import type { Film } from "./types";

const KEY = "rankd-lists-v1";
/**
 * v1 was a bare `SavedList[]`. v2 wraps it so entries can carry the fields a
 * card needs to redraw itself — `rating` above all, without which `statsFor`
 * and `pickInsight` have nothing to work from and a saved list cannot re-render
 * its own picture. Old payloads are migrated in memory on read and rewritten on
 * the next save; nothing is lost, and a v1 entry simply has no rating until its
 * film is found in the library.
 */
const VERSION = 2;

interface Stored {
  v: number;
  lists: SavedList[];
}

export interface SavedEntry {
  id: string;
  /** Kept so a row survives its film leaving the library. */
  title: string;
  year?: string;
  poster?: string;
  /** Borrowed for the run that made this list — it was never in the library. */
  guest?: boolean;
  /**
   * The star rating at save time, and the field that makes a list re-exportable.
   *
   * `statsFor` and `pickInsight` both read it, so without it a saved list could
   * be displayed but never redrawn as its card. Optional only because v1 entries
   * predate it; `filmsOf` falls back to the library and skips what it cannot
   * honestly reconstruct rather than inventing a rating.
   */
  rating?: Rating;
  /** Also for the card: the genre and decade stats, and the insight line. */
  genres?: string[];
  director?: string;
}

export interface SavedList {
  id: string;
  name: string;
  /** Where it came from, for the subtitle: "Michael Mann · director". */
  source?: string;
  /** ISO date, so a list can say when its answer was true. */
  savedAt: string;
  /** Frozen at save time, best first. */
  entries: SavedEntry[];
}

export function loadLists(): SavedList[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // v1 was the bare array. Migrated in memory; the next save writes v2.
    if (Array.isArray(parsed)) return parsed as SavedList[];
    const stored = parsed as Stored;
    return Array.isArray(stored?.lists) ? stored.lists : [];
  } catch {
    return []; // corrupt or unavailable storage is an empty shelf, not a crash
  }
}

function writeLists(lists: SavedList[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, lists } satisfies Stored));
  } catch {
    // storage full or disabled — nothing to fall back to
  }
}

/**
 * Freeze an order as a named list. Newest first, since the one you just made is
 * the one you want to see.
 *
 * `films` is taken in the order it is given — that order IS the list, and
 * sorting it here would throw away the only thing the run produced.
 */
export function saveList(
  name: string,
  films: readonly Film[],
  { source }: { source?: string } = {},
): SavedList {
  const list: SavedList = {
    // Date plus a random tail: two lists saved in the same millisecond is not a
    // real scenario, but two saved in the same session with the same name is,
    // and the id is what tells them apart when one is deleted.
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Untitled list",
    ...(source ? { source } : {}),
    savedAt: new Date().toISOString(),
    entries: films.map((f) => ({
      id: f.id,
      title: f.title,
      rating: f.rating,
      ...(f.year ? { year: f.year } : {}),
      ...(f.poster ? { poster: f.poster } : {}),
      ...(f.guest ? { guest: true } : {}),
      ...(f.genres?.length ? { genres: f.genres } : {}),
      ...(f.director ? { director: f.director } : {}),
    })),
  };
  writeLists([list, ...loadLists()]);
  return list;
}

export function deleteList(id: string): void {
  writeLists(loadLists().filter((l) => l.id !== id));
}

export function renameList(id: string, name: string): void {
  writeLists(loadLists().map((l) => (l.id === id ? { ...l, name: name.trim() || l.name } : l)));
}

/**
 * A saved list as rows to render: the library's current film where it still has
 * one, and the frozen entry where it does not.
 *
 * The ORDER is never re-derived — only the artwork and the star rating are
 * refreshed. A poster that arrived after the list was saved should show; a film
 * that climbed since should not move.
 */
export function hydrate(list: SavedList, films: readonly Film[]): { entry: SavedEntry; film?: Film }[] {
  const byId = new Map(films.map((f) => [f.id, f]));
  return list.entries.map((entry) => ({ entry, film: byId.get(entry.id) }));
}

/**
 * The list as `Film`s, in its frozen order, for redrawing the card.
 *
 * Prefers the library's film so a poster or a credit that arrived since the save
 * still shows. Falls back to the stored entry for anything the library no longer
 * has — a removed film, or a guest that was never in it.
 *
 * Entries that can produce NEITHER are dropped rather than guessed at. That only
 * happens for a v1 list whose film has also left the library, where the rating
 * was never recorded and inventing one would put a number on the card that
 * nobody chose. The caller is told how many were dropped so it can say so.
 */
export function filmsOf(
  list: SavedList,
  library: readonly Film[],
): { films: Film[]; dropped: number } {
  const byId = new Map(library.map((f) => [f.id, f]));
  const films: Film[] = [];
  let dropped = 0;

  for (const e of list.entries) {
    const live = byId.get(e.id);
    if (live) {
      films.push(live);
      continue;
    }
    if (e.rating === undefined) {
      dropped++;
      continue;
    }
    films.push({
      id: e.id,
      title: e.title,
      rating: e.rating,
      score: 0, // the ORDER is the array's, never the score's — see the header
      ...(e.year ? { year: e.year } : {}),
      ...(e.poster ? { poster: e.poster } : {}),
      ...(e.genres ? { genres: e.genres } : {}),
      ...(e.director ? { director: e.director } : {}),
      ...(e.guest ? { guest: true } : {}),
    });
  }
  return { films, dropped };
}

/**
 * What the list was OF, rebuilt from what was stored about it.
 *
 * `source` is `subjectEyebrow`'s output ("Director" / "Actor" / "Genre"), so the
 * kind reads straight back off it. Anything else — a list saved before sources
 * existed, or a tier, which is never a saved list — has no subject, and the
 * caller shows the ranking without offering a card.
 */
export function subjectOf(list: SavedList): RankSubject | null {
  switch ((list.source ?? "").toLowerCase()) {
    case "director":
      return { kind: "director", name: list.name };
    case "actor":
      return { kind: "actor", name: list.name };
    case "genre":
      return { kind: "genre", name: list.name };
    default:
      return null;
  }
}
