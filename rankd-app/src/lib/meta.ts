import type { Film } from "./types";

// Extra film detail fetched on demand from TMDb (via /api/film, which keeps the
// key server-side). Deliberately NOT part of Film: Film is the persisted record
// and this is derived, re-fetchable data — no reason to bloat localStorage with
// it or to let a stale synopsis outlive a cache bust.

export interface FilmMeta {
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
