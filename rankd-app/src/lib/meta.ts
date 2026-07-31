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
export async function backfillPosters(
  films: Film[],
  onFound: (id: string, poster: string) => void,
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
    if (meta.poster) onFound(film.id, meta.poster);
    if (!cached) await new Promise((r) => setTimeout(r, gapMs));
  }
}

