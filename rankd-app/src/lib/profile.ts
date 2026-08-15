// Who the library belongs to.
//
// Nothing here stores an image — only ever a reference to one. A banner is a
// film id and a still URL; an avatar is a URL too. The poster art is already in
// the library, uploads live in blob storage, and the whole profile costs a few
// hundred bytes instead of competing with 861 films for the same 5MB of
// localStorage. Adding `avatarUrl` did not change that rule, it used it.

import type { Film } from "./types";
import { isPlaced } from "./lock";
import type { Rating } from "./tiers";
import { markDirty } from "./syncState";

const KEY = "rankd-profile-v1";

export interface Profile {
  name: string;
  bio: string;
  /**
   * An uploaded picture, hosted in blob storage. See `lib/avatar.ts`.
   *
   * Wins over everything else when set, because it is the only one the user
   * chose deliberately. Falls back to the account photo from Google, and then to
   * the initial — see `avatarOf`.
   */
  avatarUrl?: string;
  avatarFilmId?: string;
  bannerFilmId?: string;
  // A frame from a scene, not a poster — posters are the library's currency and
  // seeing one more of them at the top of your own profile goes stale fast. Held
  // as a plain URL, so the whole profile stays a few hundred bytes.
  bannerStill?: string;
  // Undefined means "follow the ranking" — the top four placed films, kept
  // current automatically. An array means you've pinned your own and the
  // ranking no longer decides.
  favouriteIds?: string[];
  /**
   * Saved rankings you chose to show, newest pin last, capped at `MAX_PINNED`.
   *
   * Ids rather than copies: a pinned ranking is the SAME list you can open from
   * the shelf, so renaming or deleting it has to be felt in one place. A pin
   * naming a list that has since been deleted is simply skipped when rendering,
   * which is why nothing needs to clean up after `deleteList`.
   */
  pinnedListIds?: string[];
}

/** Three is "a couple" with room to breathe, and it keeps the row one line. */
export const MAX_PINNED = 3;

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
    markDirty();
  } catch {
    // storage full — the library matters more than the profile, so drop it
  }
}

// A film chosen by id, or a sensible fallback: the best-placed film with
// artwork. A profile should look like something on the day it's created.
/**
 * Which picture to draw for someone, in priority order.
 *
 * Three sources, and the order is the whole point:
 *
 *  1. An UPLOAD. The only one the user deliberately chose, so it outranks
 *     everything — including a Google photo that arrived later on a new sign-in.
 *  2. The ACCOUNT photo, which `provisionUser` already stores. Free, and better
 *     than a letter for anyone who has signed in and not thought about it.
 *  3. The INITIAL. Always available, needs no network and no account, and is
 *     what a signed-out user has always had.
 *
 * Returned as a discriminated shape rather than a URL-or-null so the caller
 * cannot forget the letter case and render an empty circle.
 */
export type Avatar = { kind: "image"; url: string } | { kind: "initial"; letter: string };

export function avatarOf(profile: Profile, accountImage?: string | null): Avatar {
  if (profile.avatarUrl) return { kind: "image", url: profile.avatarUrl };
  if (accountImage) return { kind: "image", url: accountImage };
  return { kind: "initial", letter: profile.name.trim().charAt(0).toUpperCase() || "?" };
}

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

export interface TopThings {
  director?: PersonStat;
  actors: PersonStat[];
  genre?: PersonStat;
  subgenre?: PersonStat;
  coverage: number;
}

const ACTOR_SLOTS = 4;

export function topPeople(films: Film[]): TopThings {
  const directors = new Map<string, number[]>();
  const actors = new Map<string, number[]>();
  const genres = new Map<string, number[]>();
  const keywords = new Map<string, number[]>();
  let coverage = 0;

  for (const f of films) {
    if (!f.director && !f.cast?.length && !f.genres?.length) continue;
    coverage++;
    const add = (m: Map<string, number[]>, name: string) =>
      m.set(name, [...(m.get(name) ?? []), f.rating]);
    if (f.director) add(directors, f.director);
    for (const c of f.cast ?? []) add(actors, c);
    for (const g of f.genres ?? []) add(genres, g);
    for (const k of f.keywords ?? []) add(keywords, k);
  }

  // Best average first; a longer body of work breaks a tie. `least` guards the
  // subgenre case: keywords include broad tags like "based on a novel" that
  // attach to hundreds of films and say nothing about taste, so a subgenre has
  // to be narrow enough to actually mean something.
  const rank = (m: Map<string, number[]>, least = MIN_FILMS, most = Infinity): PersonStat[] =>
    [...m.entries()]
      .filter(([, rs]) => rs.length >= least && rs.length <= most)
      .map(([name, rs]) => ({ name, count: rs.length, avg: rs.reduce((a, b) => a + b, 0) / rs.length }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);

  return {
    director: rank(directors)[0],
    actors: rank(actors).slice(0, ACTOR_SLOTS),
    genre: rank(genres)[0],
    // A keyword on more than a fifth of the library is a label, not a taste.
    subgenre: rank(keywords, 3, Math.max(3, Math.round(films.length / 5)))[0],
    coverage,
  };
}

// ── What kind of viewer you are ───────────────────────────────────────────
//
// The list enumerates; this characterises. None of these restate the ranking —
// they describe the person who made it, which is the only thing the profile can
// say that the list can't. Everything is derived, nothing is stored, and every
// one of them has to survive an empty library without producing a NaN.

export interface Fingerprint {
  homeTier?: Rating; // the tier you own most of
  genre?: { name: string; count: number };
  decade?: { label: string; count: number };
  generosity?: { mean: number; label: string };
  duels: number;
}

const LIBRARY_MIDPOINT = 2.75; // halfway up the half-star scale

// Takes the fields it actually reads rather than a whole `Film`, so a share card
// can characterise a saved ranking's entries without inventing an `id` and a
// `score` for rows that have neither. Every existing caller still passes `Film[]`.
export function fingerprint(
  films: readonly Pick<Film, "rating" | "year" | "genres" | "duels">[],
): Fingerprint {
  const duels = films.reduce((n, f) => n + (f.duels ?? 0), 0);
  if (films.length === 0) return { duels };

  const topOf = <T,>(counts: Map<T, number>) =>
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  const tiers = new Map<Rating, number>();
  const genres = new Map<string, number>();
  const decades = new Map<string, number>();
  let total = 0;

  for (const f of films) {
    tiers.set(f.rating, (tiers.get(f.rating) ?? 0) + 1);
    total += f.rating;
    for (const g of f.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1);
    const y = parseInt(f.year ?? "", 10);
    if (!Number.isNaN(y)) {
      const d = `${Math.floor(y / 10) * 10}s`;
      decades.set(d, (decades.get(d) ?? 0) + 1);
    }
  }

  const mean = total / films.length;
  const g = topOf(genres);
  const d = topOf(decades);

  return {
    homeTier: topOf(tiers)?.[0],
    genre: g && { name: g[0], count: g[1] },
    decade: d && { label: d[0], count: d[1] },
    generosity: {
      mean,
      label: mean > LIBRARY_MIDPOINT + 0.35 ? "generous" : mean < LIBRARY_MIDPOINT - 0.35 ? "harsh" : "even-handed",
    },
    duels,
  };
}

export interface Superlative {
  label: string;
  value: string;
  note?: string;
}

// Facts, not rankings. Each one is a single film or a single number, so none of
// them can turn into another version of the list.
export function superlatives(films: Film[]): Superlative[] {
  const out: Superlative[] = [];
  const withYear = films.filter((f) => /^\d{4}$/.test(f.year ?? ""));

  const oldest = withYear.sort((a, b) => Number(a.year) - Number(b.year))[0];
  if (oldest) out.push({ label: "Oldest", value: oldest.title, note: oldest.year });

  const years = new Map<string, number>();
  for (const f of withYear) years.set(f.year!, (years.get(f.year!) ?? 0) + 1);
  const busiest = [...years.entries()].sort((a, b) => b[1] - a[1])[0];
  if (busiest) out.push({ label: "Biggest year", value: busiest[0], note: `${busiest[1]} films` });

  const longest = films.filter((f) => f.runtime).sort((a, b) => b.runtime! - a.runtime!)[0];
  if (longest) {
    const h = Math.floor(longest.runtime! / 60);
    out.push({ label: "Longest", value: longest.title, note: `${h}h ${longest.runtime! % 60}m` });
  }

  const mostFought = films.filter((f) => f.duels).sort((a, b) => b.duels! - a.duels!)[0];
  if (mostFought) {
    const n = mostFought.duels!;
    out.push({ label: "Most argued over", value: mostFought.title, note: `${n} duel${n === 1 ? "" : "s"}` });
  }

  return out;
}

export interface AutoCollection {
  title: string;
  blurb: string;
  films: Film[];
}

// Collections that fall out of the ranking rather than being curated. They're
// the same shape user-made lists will be, so when those arrive they join this
// row and nothing about the display has to change.
//
// `ranked` must already be sorted best-first — every collection is a filter over
// it, so they inherit the order for free.
const MIN_COLLECTION = 3;

export function autoCollections(ranked: Film[], print: Fingerprint, top: TopThings): AutoCollection[] {
  const out: AutoCollection[] = [];
  const take = (title: string, blurb: string, films: Film[]) => {
    if (films.length >= MIN_COLLECTION) out.push({ title, blurb, films: films.slice(0, 25) });
  };

  if (print.genre) {
    take(
      `Your best ${print.genre.name}`,
      `The ${print.genre.name} films you rate highest.`,
      ranked.filter((f) => f.genres?.includes(print.genre!.name)),
    );
  }
  if (top.subgenre) {
    take(
      top.subgenre.name,
      `Everything you own tagged ${top.subgenre.name}.`,
      ranked.filter((f) => f.keywords?.includes(top.subgenre!.name)),
    );
  }
  if (top.director) {
    take(
      top.director.name,
      "Their whole filmography in your library.",
      ranked.filter((f) => f.director === top.director!.name),
    );
  }
  if (print.decade) {
    const from = parseInt(print.decade.label, 10);
    take(
      `The ${print.decade.label}`,
      `Your best of the decade you own most of.`,
      ranked.filter((f) => {
        const y = parseInt(f.year ?? "", 10);
        return !Number.isNaN(y) && y >= from && y < from + 10;
      }),
    );
  }
  return out;
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
  return ranked.filter(isPlaced).slice(0, 4);
}
