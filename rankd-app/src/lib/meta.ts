import type { Film } from "./types";
import { currentMedium } from "./medium";

// Extra detail fetched on demand from the metadata service for the current
// medium — TMDb for films, Google Books plus Open Library for books — via
// /api/film, which keeps the keys server-side. Deliberately NOT part of Film:
// Film is the persisted record and this is derived, re-fetchable data — no
// reason to bloat localStorage with it or to let a stale synopsis outlive a
// cache bust.

export interface FilmMeta {
  /**
   * Which TMDb film this is.
   *
   * The one field here that IS worth persisting, against the rule above,
   * because it is the answer to "which film did we decide this was" — and once
   * a person has corrected a bad match, that answer must survive. See
   * `pinnedMeta` in types.ts.
   */
  tmdbId?: number;
  /**
   * The book equivalents of `tmdbId`, and they carry the same argument: this is
   * the answer to "which record did we decide this was", and once a person has
   * corrected a bad match that answer must survive. See `bookId` in types.ts.
   */
  bookId?: string;
  isbn?: string;
  poster?: string;
  synopsis?: string;
  /** Minutes for a film, pages for a book. `lengthLabel` says which. */
  runtime?: number;
  genres?: string[];
  /** The director, or — for a book — the author. See `asFilmMeta` in the route. */
  director?: string;
  writer?: string;
  cinematographer?: string;
  composer?: string;
  cast?: string[];
  keywords?: string[];
  countries?: string[];
  language?: string;
}

// One in-flight request per film, shared across callers, kept for the session.
const cache = new Map<string, Promise<FilmMeta>>();

export function fetchMeta(film: Film): Promise<FilmMeta> {
  const hit = cache.get(film.id);
  if (hit) return hit;

  const params = new URLSearchParams({ title: film.title });
  if (film.year) params.set("year", film.year);
  // ── Two extras a book search needs and a film search does not ────────────
  //
  // `medium` picks which service answers. `author` is sent because it is the
  // signal that separates a novel from its study guide, and `bestBook` weights
  // it accordingly — a title-only book search returns SparkNotes far too often
  // to be relied on. It is only ever present when a stored record already knows
  // it, which after the first sweep is nearly all of them.
  //
  // Sent for films too when known, where the route simply ignores it. A
  // conditional here would be a second place that has to agree with the route
  // about which medium wants what.
  if (currentMedium() !== "film") params.set("medium", currentMedium());
  if (film.director) params.set("author", film.director);

  // ── A FAILURE is not an answer, and is not remembered as one ─────────────
  //
  // This cache exists so one record is asked about once per session. That is
  // right for an answer and wrong for a failure: a rate-limited response would
  // otherwise be cached as "we asked, there is nothing", and the record would
  // wear no artwork for the rest of the session even after the limit cleared.
  //
  // Not hypothetical. Google Books answers 429 to unauthenticated requests from
  // an ordinary IP — measured, every query — so on a deployment with no key
  // this is the common path rather than the rare one. `guard.ts` records the
  // same failure from the other side, where a 429 was cached as an answer and
  // "posters stopped and stayed stopped until a reload".
  //
  // The empty object is still what the CALLER gets, because a thinner card is
  // the right way for this to fail. Only the remembering changes.
  const req = fetch(`/api/film?${params}`)
    .then((r) => {
      if (r.ok) return r.json();
      cache.delete(film.id);
      return {};
    })
    .catch(() => {
      cache.delete(film.id);
      return {};
    });

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
// `pinnedMeta` is the third trap and the newest. Once a person has said which
// film this is, asking TMDb by title again could only find its way back to the
// wrong one — so a corrected film is finished, whatever fields it is missing.
// See `pinnedMeta` in types.ts.
export const needsPoster = (f: Film): boolean => !f.poster && !f.noMatch && !f.pinnedMeta;

// ── Which fields COUNT as complete, per medium ─────────────────────────────
//
// This looks like a detail and is the difference between a book library that
// settles and one that re-fetches itself forever.
//
// The film tests below ask for `keywords` and `countries`. Neither exists for a
// book and neither ever will: Google Books has one flat `categories` list and no
// production country, so a book that has been fetched perfectly still fails
// `!f.keywords` — which means `needsMeta` stays true, the sweep re-queues it
// every session, and 400 books hammer Google forever while `adds` correctly
// reports that nothing changed each time. Silent, endless, and invisible because
// the library never visibly breaks.
//
// So the question "is this record finished" is asked per medium, of the fields
// that medium can actually supply. Artwork and the maker are the two both have.
const wanted = (): ((f: Film) => boolean) =>
  currentMedium() === "book"
    ? // `bookId` is the one that lets an ALREADY-IMPORTED book heal.
      //
      // A Goodreads import fills in the title, the author and a poster URL
      // built from the ISBN, and for most books that URL renders as a blank —
      // Open Library serves a 1x1 GIF with a 200 for a cover it does not have.
      // Every other test here passes on such a book, so it would never be asked
      // about again and would wear an empty frame permanently.
      //
      // Nothing but a real metadata fetch sets `bookId`, so requiring it means
      // every imported book gets exactly one pass through `coverFor` — which
      // verifies the artwork and replaces it when it is missing — and then
      // settles. See `coverFor` in lib/books.ts.
      (f) => !f.poster || !f.director || !f.genres || !f.bookId
    : (f) => !f.poster || !f.director || !f.genres || !f.keywords || !f.countries;

export const needsMeta = (f: Film): boolean => !f.noMatch && !f.pinnedMeta && wanted()(f);

// Who made it, and what kind of thing it is.
//
// This is the field set that decides whether a film can be FOUND — by director,
// by actor, by genre — as opposed to merely displayed. A film with artwork and
// no credits looks complete on the list screen and is invisible to every one of
// those questions, which is why the gap went unnoticed for so long.
export const needsCredits = (f: Film): boolean =>
  !f.noMatch &&
  !f.pinnedMeta &&
  // `countries` is asked for only where it exists. Same trap as `needsMeta`:
  // a book can never satisfy it, so including it unconditionally would keep
  // every finished book permanently in the credits queue.
  (!f.director || !f.genres || (currentMedium() === "film" && !f.countries));

// Fold a fetched response into the stored film. Only the fields worth persisting
// are taken — synopsis, runtime and genres stay derived, since they'd bloat
// localStorage and can go stale, but who made a film does not change.
export function withMeta(film: Film, meta: FilmMeta, pinned = false): Film {
  // ── A correction REPLACES; a backfill only fills gaps ──────────────────────
  //
  // Two whole objects rather than one with a conditional spread. The fallbacks
  // in the backfill case exist so an unhelpful response cannot wipe fields the
  // app already had — and that is exactly wrong for a correction, where what is
  // stored belongs to a DIFFERENT film and keeping any of it leaves the card
  // half one film and half another: the new poster over the old director.
  //
  // Written out twice because the two rules disagree about nearly every field,
  // and a spread that overrides half of them reads as though they mostly agree.
  if (pinned) {
    return {
      ...film,
      tmdbId: meta.tmdbId ?? film.tmdbId,
      // Both identifiers, unconditionally. A correction is a REPLACEMENT, so a
      // book id left over from the wrong volume would keep pointing at it.
      bookId: meta.bookId,
      isbn: meta.isbn,
      pinnedMeta: true,
      // Cleared: a film that could not be found by title has just been found by
      // hand, and leaving the flag would tell every reader it is still
      // unmatched — including the queue, which would then skip it forever.
      noMatch: false,
      // Cleared with everything else. A correction means this is a DIFFERENT
      // book, so a cover chosen for the old one is not a preference to carry
      // over — it is the wrong book's artwork.
      pinnedArt: false,
      poster: meta.poster,
      director: meta.director,
      cast: meta.cast,
      genres: meta.genres,
      keywords: meta.keywords,
      runtime: meta.runtime,
      countries: meta.countries,
      language: meta.language,
    };
  }

  // An empty response means TMDb has no film by that title and year. Recorded so
  // the queue stops asking about it every session forever.
  const empty = !meta.poster && !meta.director && !meta.genres?.length;
  return {
    ...film,
    tmdbId: meta.tmdbId ?? film.tmdbId,
    bookId: meta.bookId ?? film.bookId,
    isbn: meta.isbn ?? film.isbn,
    noMatch: empty || film.noMatch,
    // ── A pinned cover is the one field a backfill may not touch ───────────
    //
    // Without this the sweep would quietly undo the choice: `meta.poster` is
    // whatever `coverFor` picked, which is precisely the answer the user
    // rejected. They would watch their cover revert and have no idea why —
    // the same failure `pinnedMeta` exists to prevent, one field down.
    poster: film.pinnedArt ? film.poster : (meta.poster ?? film.poster),
    director: meta.director ?? film.director,
    cast: meta.cast?.length ? meta.cast : film.cast,
    genres: meta.genres?.length ? meta.genres : film.genres,
    keywords: meta.keywords?.length ? meta.keywords : film.keywords,
    runtime: meta.runtime ?? film.runtime,
    countries: meta.countries?.length ? meta.countries : film.countries,
    language: meta.language ?? film.language,
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
    // ── Only report a CHANGE ─────────────────────────────────────────────────
    //
    // `onFound` is not cheap at the other end. Every call lands in a `setState`
    // that runs `saveFilms`, which is a full `JSON.stringify` and a synchronous
    // `localStorage.setItem` of the entire library — around half a megabyte on a
    // real one.
    //
    // The old test was "did the response contain anything at all", which is true
    // for every film that already has its artwork and credits. So walking a
    // fully-swept pool rewrote the whole library once per film and changed
    // nothing whatsoever each time.
    //
    // Fast Shuffle is where that bites: its queue is the whole POOL, where King
    // of the Hill only ever backfills the pile it is playing. On a warm cache
    // there is no pacing either (see below), so hundreds of half-megabyte writes
    // ran back to back with nothing yielding between them — which locks the
    // device, not merely the tab. Reported 21 Aug 2026: one swipe into Fast
    // Shuffle and the phone stopped, every time, while King of the Hill was fine.
    if (adds(film, meta)) onFound(film.id, meta);
    // ── Yield on EVERY film, cached or not ───────────────────────────────────
    //
    // The pause used to be skipped entirely for a cache hit, on the reasoning
    // above — which is sound about network pacing and wrong about the event
    // loop. With a warm cache this loop never awaited anything real, so it ran
    // as one uninterrupted block over the entire pool and the main thread had no
    // chance to paint or handle a tap in between.
    //
    // A zero-delay `setTimeout` is still a macrotask, so the thread gets a turn.
    // The cached path stays effectively free; it just stops being greedy.
    await new Promise((r) => setTimeout(r, cached ? 0 : gapMs));
  }
}

/**
 * Whether this response would actually change the film.
 *
 * Deliberately checks the fields `withMeta` fills rather than comparing whole
 * objects: `withMeta` only ever fills gaps in the backfill case, so a response
 * that repeats what is already stored produces an identical film and a pointless
 * write of the whole library.
 */
function adds(film: Film, meta: FilmMeta): boolean {
  // A pinned cover can never be "added", so a response whose ONLY news is
  // artwork must not trigger a write. Left out, every sweep over a pinned
  // record would rewrite the whole library to change nothing — which is the
  // half-megabyte-per-film write that locked the device once already.
  if (film.pinnedArt && !film.poster) return false;
  return (
    (!!meta.poster && !film.poster && !film.pinnedArt) ||
    (!!meta.director && !film.director) ||
    (!!meta.cast?.length && !film.cast?.length) ||
    (!!meta.genres?.length && !film.genres?.length) ||
    (!!meta.keywords?.length && !film.keywords?.length) ||
    (!!meta.countries?.length && !film.countries?.length) ||
    (!!meta.language && !film.language) ||
    (!!meta.runtime && !film.runtime) ||
    (!!meta.tmdbId && !film.tmdbId) ||
    (!!meta.bookId && !film.bookId) ||
    (!!meta.isbn && !film.isbn)
  );
}

