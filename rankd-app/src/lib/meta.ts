import type { Film } from "./types";

// Extra film detail fetched on demand from TMDb (via /api/film, which keeps the
// key server-side). Deliberately NOT part of Film: Film is the persisted record
// and this is derived, re-fetchable data — no reason to bloat localStorage with
// it or to let a stale synopsis outlive a cache bust.

export interface FilmMeta {
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
}

// One in-flight request per film, shared across callers, kept for the session.
const cache = new Map<string, Promise<FilmMeta>>();

export function fetchMeta(film: Film): Promise<FilmMeta> {
  const hit = cache.get(film.id);
  if (hit) return hit;

  const params = new URLSearchParams({ title: film.title });
  if (film.year) params.set("year", film.year);

  const req = fetch(`/api/film?${params}`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({})); // an unreachable API just means a thinner card, not a crash

  cache.set(film.id, req);
  return req;
}

// A CSV import brings in titles and ratings but no artwork, and the duel is
// unplayable without posters. Walk the films that need one, oldest request
// first, reporting each so the caller can persist as it goes — a long import
// shouldn't lose everything if the tab closes halfway.
//
// Throttled and sequential on purpose: this can be hundreds of films, and
// hammering TMDb in parallel is how you get rate-limited.
// Worth fetching? Artwork is the obvious reason, but a film fetched before
// credits were stored has a poster and no director — without this, those films
// would never learn who made them.
// Two different urgencies, and conflating them was a bug: a missing poster is a
// hole on screen, while missing credits are a detail nobody is looking at. When
// both queued at the same priority, 374 films that already had artwork were
// re-fetched for their keywords ahead of films showing a grey box — so posters
// visibly stopped arriving.
//
// `noMatch` stops the other trap: a film TMDb can't find never gains a poster,
// so it would qualify forever and be asked about again every single session.
export const needsPoster = (f: Film): boolean => !f.poster && !f.noMatch;

export const needsMeta = (f: Film): boolean =>
  !f.noMatch && (!f.poster || !f.director || !f.genres || !f.keywords);

// Fold a fetched response into the stored film. Only the fields worth persisting
// are taken — synopsis, runtime and genres stay derived, since they'd bloat
// localStorage and can go stale, but who made a film does not change.
export function withMeta(film: Film, meta: FilmMeta): Film {
  // An empty response means TMDb has no film by that title and year. Recorded so
  // the queue stops asking about it every session forever.
  const empty = !meta.poster && !meta.director && !meta.genres?.length;
  return {
    ...film,
    noMatch: empty || film.noMatch,
    poster: meta.poster ?? film.poster,
    director: meta.director ?? film.director,
    cast: meta.cast?.length ? meta.cast : film.cast,
    genres: meta.genres?.length ? meta.genres : film.genres,
    keywords: meta.keywords?.length ? meta.keywords : film.keywords,
    runtime: meta.runtime ?? film.runtime,
  };
}

// Reports the whole response, not just the poster. Director and cast ride along
// on the same request, and discarding them meant the app could never find a film
// by who made it without paying for all 828 fetches a second time.
export async function backfillPosters(
  films: Film[],
  onFound: (id: string, meta: FilmMeta) => void,
  shouldStop: () => boolean,
  gapMs = 120,
): Promise<void> {
  for (const film of films) {
    if (shouldStop()) return;
    // Only pace REAL requests. The caller re-runs this after every duel to
    // re-prioritise, and sleeping between films already in the cache meant
    // waiting out the whole tier again before reaching anything new.
    const cached = cache.has(film.id);
    const meta = await fetchMeta(film);
    if (meta.poster || meta.director || meta.cast?.length || meta.genres?.length) {
      onFound(film.id, meta);
    }
    if (!cached) await new Promise((r) => setTimeout(r, gapMs));
  }
}

