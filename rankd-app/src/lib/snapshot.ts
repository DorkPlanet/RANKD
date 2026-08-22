// What another person is allowed to read.
//
// ── This is a PROJECTION, and that is the whole architecture ───────────────
//
// `POTENTIAL-FEATURES.md` said the library blob would have to become relational
// as soon as "a social feature where another person reads your data" existed.
// That moment arrived, and the blob stayed, because the rule was written before
// anybody knew what the social layer would actually need.
//
// It needs this: a rank-ordered list of film ids and a handful of numbers the
// client already computes for its own profile. For a real 861-film library that
// is about 28KB against the blob's 468KB. Nothing here is a second copy of the
// library; it is an ANSWER derived from it.
//
// So the division is: your library is what you are DOING, and it stays local,
// synchronous and private. A snapshot is what you are SHOWING, and it is the
// only thing that leaves the device for somebody else's eyes.
//
// ── Derived, never authoritative ───────────────────────────────────────────
//
// It is pushed and never pulled. Nothing reads it back to rebuild anything, and
// nothing may ever start doing so: the library is the truth, and a snapshot is
// a stale opinion about it from up to one debounce ago. If the two disagree,
// the snapshot is wrong.

import { isHard, isPlaced } from "./lock";
import {
  fingerprint,
  superlatives,
  topPeople,
  type Fingerprint,
  type PersonStat,
  type Superlative,
} from "./profile";
import type { Film } from "./types";

/**
 * One placed film, as the comparison maths needs it.
 *
 * Single-letter keys, and not for cleverness. This array is the bulk of the
 * payload and it is JSON, so the key names are repeated once per film: at 861
 * films, `"i"` against `"id"` and `"r"` against `"rank"` is the difference
 * between roughly 28KB and 45KB, for a structure no human reads.
 */
export interface SnapshotEntry {
  /**
   * `slugId` from lib/importCsv.ts, which is `title-year` slugified.
   *
   * CROSS-USER STABLE, and that is what makes comparison possible without a
   * global film table: two people who both own Heat (1995) produce the same id
   * with no coordination and no server round trip.
   */
  i: string;
  /** 1-based position among placed films, best first. */
  r: number;
  /** The tier-band score, 1 to 10000. See lib/tiers.ts. */
  s: number;
  /**
   * Held firmly?
   *
   * `1` when the reader CONFIRMED this placement themselves (`isHard`), rather
   * than the model having settled it for them. A comparison that weights every
   * position equally treats a shrug the same as a conviction, and the whole
   * point of a disagreement is that both people meant it.
   */
  t: 0 | 1;
}

/** A film with enough on it to draw, for the profile rather than the maths. */
export interface SnapshotFilm {
  id: string;
  title: string;
  year?: string;
  poster?: string;
  rating: number;
  /**
   * Only so a public profile can fetch a frame from it for the banner.
   *
   * Deliberately NOT the artwork itself. Two backdrops per profile render, cached
   * for a day server-side, is far cheaper than two TMDb calls on every sync push
   * while somebody is mid-run. Absent for a film TMDb never matched, which the
   * banner treats as "no frame" and falls back from.
   */
  tmdbId?: number;
}

/**
 * Everything a public profile puts on screen.
 *
 * Kept apart from `entries` on purpose. The entries are a rank order and stay
 * as small as possible because every one of them is carried; this is a fixed
 * handful of things with titles and artwork attached, and it does not grow with
 * the library.
 */
export interface SnapshotSummary {
  /** The films they would show you. Not the whole order, just the top of it. */
  topFilms: SnapshotFilm[];
  directors: PersonStat[];
  actors: PersonStat[];
  genre?: PersonStat;
  /**
   * Their best-placed film in that genre, purely so the genre card on a public
   * profile has artwork to sit on.
   *
   * A genre is the one thing a profile says about somebody that has no picture
   * of its own: a director has a face, a film has a poster, a genre is a word.
   * Borrowing the poster of the film they rate highest inside it is the only
   * honest image available, and it is a film they chose rather than stock art.
   *
   * Optional, and absent is a real state: a library with no credits yet has no
   * genre either. Added after the format existed, which costs nothing because a
   * snapshot is rebuilt whole on every push.
   */
  genreFilm?: SnapshotFilm;
  fingerprint: Fingerprint;
  superlatives: Superlative[];
}

export interface Snapshot {
  entries: SnapshotEntry[];
  /** Everything in the library, placed or not. The number people quote. */
  filmCount: number;
  duelCount: number;
  summary: SnapshotSummary;
}

/** Mean of a list of ratings. Only ever called on a non-empty one. */
const avgOf = (rs: readonly number[]): number => rs.reduce((a, b) => a + b, 0) / rs.length;

/** How many films the profile shows. Ten is a top ten. */
const TOP_FILMS = 10;

/**
 * Build the answer.
 *
 * Pure, and takes plain arrays rather than reading storage, so it runs on the
 * client where the library already is and can be tested without a browser.
 *
 * ── Only PLACED films are ranked ───────────────────────────────────────────
 *
 * `entries` is a rank order, and an unplaced film has no position to report: it
 * carries the tier midpoint it was seeded with, which is a placeholder and not
 * a judgement. Including them would put hundreds of films at identical scores
 * into the middle of everybody's order and quietly make two strangers look
 * alike. `filmCount` still counts the whole library, because "865 films" is a
 * true and useful thing to say about somebody.
 */
export function buildSnapshot(films: readonly Film[], logRows: number): Snapshot {
  // Guests belong to somebody else's filmography and are never in the library
  // (`saveFilms` keeps them out), but a caller could hand us a live run's
  // array. Dropped here so a borrowed film can never be published as yours.
  const own = films.filter((f) => !f.guest);

  const placed = own
    .filter(isPlaced)
    .slice()
    // Highest score first. Ties broken by title so the order is stable across
    // rebuilds: without it, two films on the same score can swap places between
    // pushes and produce a different snapshot from an unchanged library.
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

  const entries: SnapshotEntry[] = placed.map((film, index) => ({
    i: film.id,
    r: index + 1,
    s: film.score,
    t: isHard(film) ? 1 : 0,
  }));

  const people = topPeople(own);

  // ── The genre is picked BY COUNT, not by rating ──────────────────────────
  //
  // `topPeople.genre` is the best-RATED genre: `rank()` sorts on average and
  // uses count only to break a tie. That is right for the directors and actors
  // it sits beside, and wrong for this card, which says "their genre" and prints
  // a film count next to it.
  //
  // The two disagree more often than you would think. A library with eleven
  // well-liked documentaries and forty horror films reports Documentary, and its
  // owner says, correctly, that horror is their genre by the numbers. Reported
  // from a real profile, 22 Aug 2026.
  //
  // So this counts. `fingerprint.genre` already picks the same way and is the
  // "you keep returning to" line on the owner's own profile, which means the two
  // surfaces now agree about somebody instead of naming different genres.
  const genreCounts = new Map<string, number[]>();
  for (const film of own) {
    for (const g of film.genres ?? []) {
      genreCounts.set(g, [...(genreCounts.get(g) ?? []), film.rating]);
    }
  }
  const topGenre = [...genreCounts.entries()]
    // Most films first. Average breaks a tie, so between two genres you have
    // watched equally the one you like more wins.
    .sort((a, b) => b[1].length - a[1].length || avgOf(b[1]) - avgOf(a[1]))
    .map(([name, ratings]) => ({ name, count: ratings.length, avg: avgOf(ratings) }))[0];

  // The best-placed film carrying that genre. `placed` is already sorted best
  // first, so the first hit is the answer and there is nothing to compare.
  const genreFilm = topGenre
    ? placed.find((f) => f.genres?.includes(topGenre.name))
    : undefined;

  return {
    entries,
    filmCount: own.length,
    duelCount: logRows,
    summary: {
      topFilms: placed.slice(0, TOP_FILMS).map((f) => ({
        id: f.id,
        title: f.title,
        year: f.year,
        poster: f.poster,
        rating: f.rating,
        tmdbId: f.tmdbId,
      })),
      directors: people.directors,
      actors: people.actors,
      genre: topGenre,
      genreFilm: genreFilm
        ? {
            id: genreFilm.id,
            title: genreFilm.title,
            year: genreFilm.year,
            poster: genreFilm.poster,
            rating: genreFilm.rating,
            tmdbId: genreFilm.tmdbId,
          }
        : undefined,
      fingerprint: fingerprint(own),
      superlatives: superlatives(own),
    },
  };
}

/**
 * Is this snapshot worth sending?
 *
 * A library with nothing placed in it has no order to publish and nothing to
 * compare against, so it would be a row of zeroes on a page and a participant
 * in nobody's agreement score. Sending it anyway is not harmful, only pointless,
 * and skipping keeps empty accounts out of every future discovery query for
 * free.
 */
export function worthPublishing(snapshot: Snapshot): boolean {
  return snapshot.entries.length > 0;
}
