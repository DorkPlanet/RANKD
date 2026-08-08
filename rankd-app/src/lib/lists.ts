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

import type { Film } from "./types";

const KEY = "rankd-lists-v1";

export interface SavedEntry {
  id: string;
  /** Kept so a row survives its film leaving the library. */
  title: string;
  year?: string;
  poster?: string;
  /** Borrowed for the run that made this list — it was never in the library. */
  guest?: boolean;
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
    const parsed = JSON.parse(raw) as SavedList[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // corrupt or unavailable storage is an empty shelf, not a crash
  }
}

function writeLists(lists: SavedList[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(lists));
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
      ...(f.year ? { year: f.year } : {}),
      ...(f.poster ? { poster: f.poster } : {}),
      ...(f.guest ? { guest: true } : {}),
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
