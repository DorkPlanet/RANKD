// Starting a curated run, whoever asked for it.
//
// ── What this replaced ─────────────────────────────────────────────────────
//
// There were two ways to begin a curated run and they had almost nothing in
// common on the page. A PERSON run arrived at `DuelScreen` as three separate
// props — `personRun`, `personGuests`, `personPortrait` — and was started by an
// effect watching one of them. A GENRE run originated inside the screen and was
// started by a direct call. Both then did the same three things: pick a pool,
// order it by belief, and hand `startRun` an explicit `only` list with
// `crossTier`.
//
// The duplication was not the real cost. The real cost was that "only one
// curated run is ever pending" was true only because nothing had yet set two,
// and nothing anywhere enforced it — the handover flagged exactly this, and
// noted that resume would have made it three reaching for `state.session`. Now
// there is one request, one pool selector and one start, so the invariant is
// the shape of the data rather than a thing to remember.
//
// ── What a curated run writes ──────────────────────────────────────────────
//
// Nothing. No score, no lock, no duel count, no evidence row. That is what
// makes it safe to rank Mann against Mann without rewriting the master list,
// and it is why these are the only runs that can be `crossTier`. See
// `ladder.ts`.

import { beliefsFor } from "./beliefs";
import { filmsInGenre } from "./genres";
import { rankByBelief } from "./people";
import { type RankSubject } from "./subject";
import type { Judgement } from "./log";
import type { Film } from "./types";

/**
 * A curated run somebody has asked for but which has not started yet.
 *
 * One object, so two of them cannot be pending at once. `guests` are films
 * borrowed for the run that are not in the library — a person's work you have
 * never seen. They are merged into the pile and never persisted; `saveFilms`
 * strips them on the way out.
 */
export interface RunRequest {
  subject: RankSubject;
  guests?: readonly Film[];
  /** Genre runs are capped by the picker. Absent means "the whole pool". */
  limit?: number;
}

/**
 * The films a curated subject is a run OVER.
 *
 * A live subject returns nothing, deliberately. A tier or the overall top ten
 * is already ordered by the master list, so a run over one would be a second,
 * contradicting answer — the exact thing `isLiveSubject` exists to prevent.
 * Returning an empty pool means the caller's own "not enough to duel" guard
 * refuses it, rather than needing its own special case.
 */
export function poolForSubject(films: readonly Film[], subject: RankSubject): Film[] {
  // Switched exhaustively rather than filtered by `isLiveSubject` first: this is
  // the one place that has to have an answer for every kind, so adding a kind
  // should fail the build here rather than silently return nothing.
  switch (subject.kind) {
    case "tier":
    case "overall":
      return [];
    case "genre":
      return filmsInGenre(films, subject.name);
    case "director":
      // Rebuilt from the subject rather than carried as a `Person`, which would
      // drag a `count` through the request that nothing here can use — and
      // which would be stale by the time the run started anyway.
      return films.filter((f) => f.director === subject.name);
    case "actor":
      return films.filter((f) => (f.cast ?? []).includes(subject.name));
  }
}

/**
 * The pile a request becomes, in the order it will be climbed.
 *
 * BELIEF order, which is the only ordering in the app that spans star ratings —
 * so the climb begins from the best guess the model has rather than from stars.
 * That is what keeps it short: a film meets progressively stronger opponents.
 *
 * Guests are merged BY ID, never appended. An updater must be safe to run twice
 * on the same input (React does exactly that in development), and a blind concat
 * put every borrowed film in the pile a second time — a 19-film filmography
 * started as a 35-film climb against duplicates of itself.
 */
export function pileFor(
  films: readonly Film[],
  request: RunRequest,
  log: readonly Judgement[],
): { all: Film[]; order: Film[] } {
  const have = new Set(films.map((f) => f.id));
  const all = [...films, ...(request.guests ?? []).filter((g) => !have.has(g.id))];
  const ranked = rankByBelief(poolForSubject(all, request.subject), beliefsFor(all, log));
  return { all, order: request.limit ? ranked.slice(0, request.limit) : ranked };
}
