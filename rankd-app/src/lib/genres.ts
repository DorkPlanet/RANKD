// Films by the kind of thing they are.
//
// The mirror of `people.ts`, and it works the same way and carries the same
// caveat: `genres` arrive on the TMDb response that fetches the artwork, so a
// film only counts once its metadata has landed. The credits sweep in
// `AppShell` is what makes that converge without you having to scroll the list.
//
// ── Why a genre run borrows nothing ────────────────────────────────────────
//
// A director run can pull in films you haven't seen, because a filmography is
// finite and the gap in it is interesting — "what have I missed of Michael
// Mann" is a real question with a bounded answer. A genre has no such shape:
// TMDb's "Drama" is tens of thousands of films, so borrowed ones would be
// chosen by global popularity rather than by anything about you. So a genre run
// ranks what you own, and nothing else.
//
// (The version of this that WOULD work is a subgenre — "zombie films" rather
// than "horror" — because a keyword is narrow enough to have a real edge.
// `topPeople` in profile.ts already derives subgenres from `f.keywords`. Noted
// as the obvious next move, not built.)

import type { Film } from "./types";

export interface GenreTally {
  name: string;
  /** How many films in the library carry it. */
  count: number;
}

/** Every genre the library knows about, commonest first. */
export function genresIn(films: readonly Film[]): GenreTally[] {
  const tally = new Map<string, number>();
  for (const f of films) {
    for (const g of f.genres ?? []) tally.set(g, (tally.get(g) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The library's films in this genre. Order is the caller's business. */
export const filmsInGenre = (films: readonly Film[], genre: string): Film[] =>
  films.filter((f) => f.genres?.includes(genre));

/** Fewer than this and there is nothing to rank. */
export const MIN_GENRE_RUN = 2;
