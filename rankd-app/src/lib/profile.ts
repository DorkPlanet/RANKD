// Who the library belongs to.
//
// Nothing here stores an image. A banner and an avatar are just films you've
// picked, referenced by id — the poster art is already in the library, and the
// whole profile costs a few hundred bytes instead of competing with 828 films
// for the same 5MB of localStorage.

import type { Film } from "./types";

const KEY = "rankd-profile-v1";

export interface Profile {
  name: string;
  bio: string;
  avatarFilmId?: string;
  bannerFilmId?: string;
  // Undefined means "follow the ranking" — the top four placed films, kept
  // current automatically. An array means you've pinned your own and the
  // ranking no longer decides.
  favouriteIds?: string[];
}

export const EMPTY_PROFILE: Profile = { name: "You", bio: "" };

export function loadProfile(): Profile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Profile) };
  } catch {
    // corrupt or unavailable — a default profile is always better than nothing
  }
  return EMPTY_PROFILE;
}

export function saveProfile(p: Profile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage full — the library matters more than the profile, so drop it
  }
}

// A film chosen by id, or a sensible fallback: the best-placed film with
// artwork. A profile should look like something on the day it's created.
export function pickFilm(films: Film[], id: string | undefined, ranked: Film[]): Film | undefined {
  if (id) {
    const chosen = films.find((f) => f.id === id);
    if (chosen) return chosen;
  }
  return ranked.find((f) => f.poster);
}

export interface PersonStat {
  name: string;
  count: number;
  avg: number; // mean star rating across their films in your library
}

// Whose films you rate highest.
//
// Scored on star ratings rather than on placements, deliberately. Requiring a
// confirmed placement would be the purer measure, but with fifteen films settled
// out of eight hundred it would read as empty for months — and a star rating is
// still your own judgement, it just arrived with the import instead of from a
// duel. Two films minimum, so one lucky five-star doesn't crown anybody.
//
// Only films that know their credits can contribute and credits arrive with
// artwork, so this is always a view of part of the library. `coverage` comes
// back alongside so the screen can admit that rather than imply otherwise.
const MIN_FILMS = 2;

export function topPeople(films: Film[]): {
  director?: PersonStat;
  actor?: PersonStat;
  coverage: number;
} {
  const directors = new Map<string, number[]>();
  const actors = new Map<string, number[]>();
  let coverage = 0;

  for (const f of films) {
    if (!f.director && !f.cast?.length) continue;
    coverage++;
    const add = (m: Map<string, number[]>, name: string) =>
      m.set(name, [...(m.get(name) ?? []), f.rating]);
    if (f.director) add(directors, f.director);
    for (const c of f.cast ?? []) add(actors, c);
  }

  const best = (m: Map<string, number[]>): PersonStat | undefined =>
    [...m.entries()]
      .filter(([, rs]) => rs.length >= MIN_FILMS)
      .map(([name, rs]) => ({ name, count: rs.length, avg: rs.reduce((a, b) => a + b, 0) / rs.length }))
      // Best average first; a longer body of work breaks a tie.
      .sort((a, b) => b.avg - a.avg || b.count - a.count)[0];

  return { director: best(directors), actor: best(actors), coverage };
}

// Favourites follow the ranking until you say otherwise. Pinned ids are resolved
// in the order you pinned them, not in rank order — the point of pinning is that
// you decided the order.
export function favouriteFilms(profile: Profile, films: Film[], ranked: Film[]): Film[] {
  if (profile.favouriteIds?.length) {
    return profile.favouriteIds
      .map((id) => films.find((f) => f.id === id))
      .filter((f): f is Film => !!f);
  }
  return ranked.filter((f) => f.confirmed).slice(0, 4);
}
