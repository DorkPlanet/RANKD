// Talking to TMDb, without being a route.
//
// ── Why this left the route file ───────────────────────────────────────────
//
// `detailOf` lived inside `app/api/film/route.ts` and was module-private, which
// was correct while the only caller was that handler. It is not any more: a
// seeding script has to build a canon from TMDb, and it cannot go through
// `/api/film` to do it. `app/api/guard.ts` refuses any request with neither an
// `Origin` nor a `Referer` header, which is exactly what a script or a cron
// invocation looks like, so the app's own proxy would 403 its own job.
//
// This is the same move `bestMatch` made into `tmdbMatch.ts`, for the same
// reason its header gives: a route file may only export HTTP handlers, so
// anything a second caller needs has to live in `lib/`.
//
// ── One note about caching ─────────────────────────────────────────────────
//
// `fetch(url, { next: { revalidate } })` is a Next.js extension. Inside the app
// it uses the data cache; in a plain Node script that option is simply ignored
// and every call goes to the network. That is harmless, and it is written down
// here so nobody assumes a seeding run is cached and is surprised when it takes
// two minutes.

import type { Candidate } from "./tmdbMatch";

const BASE = "https://api.themoviedb.org/3";
const DAY = 60 * 60 * 24;

export interface FilmMeta {
  /** Which TMDb film this actually is. Kept so a correction can be pinned. */
  tmdbId?: number;
  poster?: string;
  synopsis?: string;
  runtime?: number;
  genres?: string[];
  director?: string;
  writer?: string;
  cinematographer?: string;
  composer?: string;
  cast?: string[];
  keywords?: string[];
  /** ISO 3166-1 codes for where it was made. Usually one, sometimes a co-production. */
  countries?: string[];
  /** ISO 639-1 code for the language it was shot in. */
  language?: string;
}

interface CrewMember {
  job?: string;
  name?: string;
}

/**
 * Everything worth keeping about one TMDb film, by its id.
 *
 * Split out because there are now several ways to arrive at an id — guessed from
 * a title, chosen by a person correcting a bad guess, or listed by a discovery
 * query — and all of them want exactly the same response. Duplicating the field
 * mapping would have meant a corrected film quietly carrying a different set of
 * fields from a matched one.
 */
export async function detailOf(id: number, key: string): Promise<FilmMeta | null> {
  const detail = new URL(`${BASE}/movie/${id}`);
  detail.searchParams.set("api_key", key);
  // Keywords are the closest thing TMDb has to subgenres — slasher, giallo,
  // found footage — since its genre list is 19 flat labels with no children.
  detail.searchParams.set("append_to_response", "credits,keywords");

  const res = await fetch(detail, { next: { revalidate: DAY } });
  if (!res.ok) return null;
  const d = await res.json();

  const crew: CrewMember[] = d.credits?.crew ?? [];
  const byJob = (...jobs: string[]) => crew.find((c) => jobs.includes(c.job ?? ""))?.name;

  return {
    tmdbId: d.id,
    // Imported films arrive with no artwork, so the poster comes back too.
    poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : undefined,
    synopsis: d.overview || undefined,
    runtime: d.runtime || undefined,
    genres: (d.genres ?? []).map((g: { name: string }) => g.name),
    director: byJob("Director"),
    writer: byJob("Screenplay", "Writer", "Story"),
    cinematographer: byJob("Director of Photography"),
    composer: byJob("Original Music Composer", "Music"),
    cast: (d.credits?.cast ?? []).slice(0, 10).map((c: { name: string }) => c.name),
    keywords: (d.keywords?.keywords ?? []).slice(0, 10).map((k: { name: string }) => k.name),
    // Where it was made and what it was shot in. Both ride along on the same
    // response as the poster, so this costs no extra request, only the bytes.
    countries: (d.production_countries ?? []).map((c: { iso_3166_1: string }) => c.iso_3166_1),
    language: d.original_language || undefined,
  };
}

/** One film as a discovery query lists it, before any detail call. */
export interface DiscoveredFilm {
  tmdbId: number;
  /** TMDb's English display title. The one Letterboxd also carries. */
  title: string;
  /** Four digits, or "" when TMDb has no release date at all. */
  year: string;
  voteAverage: number;
  voteCount: number;
}

/**
 * Search a title, then keep the best guess.
 *
 * The year is deliberately NOT sent to TMDb. As a query parameter it is a hard
 * filter, so a film whose TMDb release year is one off the one we hold comes
 * back empty. It is far more useful as a tie-breaker, which is what `bestMatch`
 * does with it.
 */
export async function searchMovies(title: string, key: string): Promise<Candidate[]> {
  const search = new URL(`${BASE}/search/movie`);
  search.searchParams.set("api_key", key);
  search.searchParams.set("query", title);
  search.searchParams.set("include_adult", "false");

  const res = await fetch(search, { next: { revalidate: DAY } });
  if (!res.ok) return [];
  return ((await res.json())?.results ?? []) as Candidate[];
}

/**
 * One page of the highest-rated films above a vote floor.
 *
 * ── Why `/discover` and not `/movie/top_rated` ─────────────────────────────
 *
 * `top_rated` applies its own weighting with a vote floor around 300, and
 * measured against a real 861-film library that produces a list where 47% of the
 * top thousand has under 1500 votes: `Accidental Partners` at 359 votes
 * outranking The Godfather. It is a leaderboard of enthusiasm, not a canon.
 *
 * `/discover` with an explicit `vote_count.gte` puts the floor where it can be
 * argued about. See `scripts/` for the measured comparison and for why the floor
 * is era-adjusted rather than flat: old films have fewer TMDb votes because
 * fewer people log them, and a flat floor collapses pre-1980 from 300 films to
 * 82.
 *
 * TMDb caps `/discover` paging at 500 pages, and every page is 20 films.
 */
export async function discoverPage(
  key: string,
  opts: { page: number; minVotes: number; from?: string; to?: string },
): Promise<DiscoveredFilm[]> {
  const url = new URL(`${BASE}/discover/movie`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("sort_by", "vote_average.desc");
  url.searchParams.set("include_adult", "false");
  url.searchParams.set("vote_count.gte", String(opts.minVotes));
  url.searchParams.set("page", String(opts.page));
  if (opts.from) url.searchParams.set("primary_release_date.gte", opts.from);
  if (opts.to) url.searchParams.set("primary_release_date.lte", opts.to);

  const res = await fetch(url, { next: { revalidate: DAY } });
  if (!res.ok) throw new Error(`TMDb ${res.status} on discover page ${opts.page}`);
  const body = await res.json();

  return (body?.results ?? []).map(
    (m: {
      id: number;
      title: string;
      release_date?: string;
      vote_average: number;
      vote_count: number;
    }) => ({
      tmdbId: m.id,
      title: m.title,
      // Sliced rather than parsed. `slugId` wants the four digits as a string,
      // and a missing release date has to stay empty rather than become "NaN",
      // which would end up inside a film id and never match anybody.
      year: (m.release_date ?? "").slice(0, 4),
      voteAverage: m.vote_average,
      voteCount: m.vote_count,
    }),
  );
}
