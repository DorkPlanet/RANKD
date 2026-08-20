// Things worth saying about a library, as sentences rather than measurements.
//
// ── Why the first version of this was dull, kept because it is the rule ────
//
// It reported percentages: you pick the longer film 61% of the time, you rank at
// 11pm, you changed your mind about twelve pairs. Every one was true, correctly
// de-biased, and completely inert — because a percentage describes a TENDENCY
// and names nothing. There is no film in it, no person, nothing to picture and
// nothing to disagree with.
//
// So the rule here is: **a note must name something.** A film, a director, an
// actor, a genre, a decade, or a figure startling enough to be a thing in itself.
// If the sentence would survive having its number changed, it is not a note.
//
// The second rule is that a note must be able to be WRONG about you — that is
// what makes it worth reading. "You own more Spielberg than anyone but you rank
// Carpenter higher" invites an argument. "You rank at 11pm" does not.

import { genresIn } from "./genres";
import { rankedFilms } from "./ladder";
import { isPlaced } from "./lock";
import type { Judgement } from "./log";
import { starsFor } from "./tiers";
import type { Film } from "./types";

/**
 * One observation, split so the named thing can be set apart from the words.
 *
 * Three fields rather than a formatted string, because the subject is gilded on
 * screen and drawn differently on a share card, and a caller that has to find
 * the interesting part by searching the sentence for it will eventually get it
 * wrong.
 */
export interface Note {
  /** A stable key, so a caller can pin or exclude one by name. */
  id: string;
  before: string;
  /** The film, person, genre or figure this note is actually about. */
  subject: string;
  after: string;
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

const hhmm = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const decadeOf = (f: Film): string | null =>
  /^\d{4}$/.test(f.year ?? "") ? `${Math.floor(Number(f.year) / 10) * 10}s` : null;

/** Everything watched, in minutes, over the films whose runtime is known. */
export function minutesWatched(films: readonly Film[]): { minutes: number; known: number } {
  let minutes = 0;
  let known = 0;
  for (const f of films) {
    if (!f.runtime) continue;
    minutes += f.runtime;
    known += 1;
  }
  return { minutes, known };
}

/**
 * The genre you own most of and have ranked least of.
 *
 * A blind spot rather than a favourite: the interesting thing is the gap between
 * how much of something you have and how much of it you have actually placed.
 * Ranked by the SIZE of that gap, so a genre you own forty of and have settled
 * two of beats one you own six of and have settled none.
 */
function blindSpot(films: readonly Film[]): Note | null {
  let worst: { name: string; own: number; done: number } | null = null;
  for (const g of genresIn(films)) {
    if (g.count < 8) continue; // too small to be a blind spot, just a gap
    const mine = films.filter((f) => f.genres?.includes(g.name));
    const done = mine.filter(isPlaced).length;
    const gap = mine.length - done;
    if (!worst || gap > worst.own - worst.done) worst = { name: g.name, own: mine.length, done };
  }
  if (!worst || worst.own - worst.done < 5) return null;
  return {
    id: "blind-spot",
    before: `You own ${plural(worst.own, `${worst.name.toLowerCase()} film`)} and have ranked`,
    subject: worst.done === 0 ? "none" : String(worst.done),
    after: worst.done === 0 ? "of them." : "of them.",
  };
}

/**
 * The shortest film at your top rating.
 *
 * Reads as a rule you did not know you had. Only worth saying when the floor is
 * high enough to be a preference rather than an accident — a 78-minute five-star
 * film means you simply do not have this trait, and the note stays quiet.
 */
function noShortMasterpieces(films: readonly Film[]): Note | null {
  const rated = films.filter((f) => f.runtime && f.rating >= 4.5);
  if (rated.length < 8) return null;
  const shortest = Math.min(...rated.map((f) => f.runtime!));
  if (shortest < 95) return null;
  return {
    id: "no-short",
    before: `Nothing you rated ${starsFor(rated[0].rating)} is shorter than`,
    subject: hhmm(shortest),
    after: ".",
  };
}

/**
 * The actor you have spent most of your life watching.
 *
 * Hours, not film count, which is the whole joke: a person can be a small part
 * of your library and a large part of your year.
 */
function mostHours(films: readonly Film[]): Note | null {
  const { minutes } = minutesWatched(films);
  if (minutes < 60 * 24) return null;
  const tally = new Map<string, number>();
  for (const f of films) {
    if (!f.runtime || !f.cast?.length) continue;
    // Top billing only. A tenth-billed appearance is not who you watched.
    for (const name of f.cast.slice(0, 4)) tally.set(name, (tally.get(name) ?? 0) + f.runtime);
  }
  let best: [string, number] | null = null;
  for (const row of tally) if (!best || row[1] > best[1]) best = row;
  if (!best || best[1] < 60 * 8) return null;
  const days = Math.round(minutes / 60 / 24);
  const hours = Math.round(best[1] / 60);
  return {
    id: "most-hours",
    before: `Of your ${plural(days, "day")} of film,`,
    subject: `${plural(hours, "hour")}`,
    after: `were ${best[0]}.`,
  };
}

/** The decade your best films come from, when it is not the decade you own most of. */
function topTenDecade(films: readonly Film[]): Note | null {
  const top = rankedFilms(films.filter(isPlaced)).slice(0, 10);
  if (top.length < 10) return null;
  const tally = new Map<string, number>();
  for (const f of top) {
    const d = decadeOf(f);
    if (d) tally.set(d, (tally.get(d) ?? 0) + 1);
  }
  let best: [string, number] | null = null;
  for (const row of tally) if (!best || row[1] > best[1]) best = row;
  if (!best || best[1] < 4) return null;

  // Only interesting when the top ten disagrees with the shelf.
  const owned = new Map<string, number>();
  for (const f of films) {
    const d = decadeOf(f);
    if (d) owned.set(d, (owned.get(d) ?? 0) + 1);
  }
  let commonest: [string, number] | null = null;
  for (const row of owned) if (!commonest || row[1] > commonest[1]) commonest = row;
  if (commonest && commonest[0] === best[0]) return null;

  return {
    id: "top-ten-decade",
    before: `${best[1]} of your top ten are from the`,
    subject: best[0],
    after: commonest ? `. Most of your library is ${commonest[0]}.` : ".",
  };
}

/** The oldest film that made it into the top of your order. */
function oldestUpTop(films: readonly Film[]): Note | null {
  const top = rankedFilms(films.filter(isPlaced)).slice(0, 50);
  const dated = top.filter((f) => /^\d{4}$/.test(f.year ?? ""));
  if (dated.length < 10) return null;
  const oldest = dated.reduce((a, b) => (Number(a.year) <= Number(b.year) ? a : b));
  return {
    id: "oldest-up-top",
    before: `The oldest thing in your top ${top.length} is`,
    subject: oldest.title,
    after: `, from ${oldest.year}.`,
  };
}

/**
 * You own more of one director and rank another higher.
 *
 * The clearest "your shelf disagrees with your taste" note available, and it
 * only fires when the two are actually different people.
 */
function ownVersusRank(films: readonly Film[]): Note | null {
  const placed = films.filter(isPlaced);
  const owned = new Map<string, number>();
  for (const f of films) if (f.director) owned.set(f.director, (owned.get(f.director) ?? 0) + 1);
  let most: [string, number] | null = null;
  for (const row of owned) if (!most || row[1] > most[1]) most = row;
  if (!most || most[1] < 4) return null;

  const scores = new Map<string, { sum: number; n: number }>();
  for (const f of placed) {
    if (!f.director) continue;
    const row = scores.get(f.director) ?? { sum: 0, n: 0 };
    row.sum += f.score;
    row.n += 1;
    scores.set(f.director, row);
  }
  let best: [string, number] | null = null;
  for (const [name, row] of scores) {
    if (row.n < 3) continue;
    const mean = row.sum / row.n;
    if (!best || mean > best[1]) best = [name, mean];
  }
  if (!best || best[0] === most[0]) return null;
  return {
    id: "own-vs-rank",
    before: `You own more ${most[0]} than anyone. You rank`,
    subject: best[0],
    after: "higher.",
  };
}

/** Your longest film, and whether it earned its length. */
function longestFilm(films: readonly Film[]): Note | null {
  const withRuntime = films.filter((f) => f.runtime);
  if (withRuntime.length < 20) return null;
  const longest = withRuntime.reduce((a, b) => (a.runtime! >= b.runtime! ? a : b));
  if (longest.runtime! < 150) return null;
  const order = rankedFilms(films.filter(isPlaced));
  const at = order.findIndex((f) => f.id === longest.id);
  return {
    id: "longest",
    before: `Your longest film is ${longest.title}, at`,
    subject: hhmm(longest.runtime!),
    after: at >= 0 && at < 50 ? `. It is number ${at + 1}.` : ".",
  };
}

/**
 * The film Rankd could never settle on.
 *
 * NAMED FOR WHAT IT MEASURES. The matchmaker serves the pair it can least
 * predict, so a high duel count is the model's uncertainty and not yours —
 * calling it "most argued over" would dress an algorithm's property up as a
 * reader's. It survives the cull because it names a film.
 */
function neverSettled(films: readonly Film[], log: readonly Judgement[]): Note | null {
  if (log.length < 40) return null;
  const byId = new Map(films.map((f) => [f.id, f]));
  const count = new Map<string, number>();
  for (const j of log) {
    if (byId.has(j.a)) count.set(j.a, (count.get(j.a) ?? 0) + 1);
    if (byId.has(j.b)) count.set(j.b, (count.get(j.b) ?? 0) + 1);
  }
  let best: [string, number] | null = null;
  for (const row of count) if (!best || row[1] > best[1]) best = row;
  if (!best || best[1] < 8) return null;
  return {
    id: "never-settled",
    before: "Rankd asked about",
    subject: byId.get(best[0])!.title,
    after: `${best[1]} times before it was sure.`,
  };
}

/**
 * Films you chose over something you had rated higher.
 *
 * Only possible in a cross-tier duel, which since Random went happens only in
 * curated runs — so this is often zero and correctly says nothing. Names the
 * film rather than counting the occasions, which is the whole point of this file.
 */
function againstYourOwnStars(films: readonly Film[], log: readonly Judgement[]): Note | null {
  const byId = new Map(films.map((f) => [f.id, f]));
  const wins = new Map<string, number>();
  for (const j of log) {
    if (j.o === "draw") continue;
    const a = byId.get(j.a);
    const b = byId.get(j.b);
    if (!a || !b) continue;
    const won = j.o === "a" ? a : b;
    const lost = won === a ? b : a;
    if (won.rating < lost.rating) wins.set(won.id, (wins.get(won.id) ?? 0) + 1);
  }
  let best: [string, number] | null = null;
  for (const row of wins) if (!best || row[1] > best[1]) best = row;
  if (!best || best[1] < 3) return null;
  return {
    id: "against-stars",
    before: `You have picked ${byId.get(best[0])!.title} over`,
    subject: plural(best[1], "film"),
    after: "you rated higher.",
  };
}

/**
 * Everything worth saying, in the order it is worth saying it.
 *
 * Each note refuses under its own floor rather than reaching for something to
 * say, so a thin library shows two lines instead of eight bad ones. The order is
 * fixed rather than shuffled: these are read down, and a page that reorders
 * itself between visits reads as noise.
 */
export function notesFor(films: readonly Film[], log: readonly Judgement[]): Note[] {
  return [
    mostHours(films),
    blindSpot(films),
    topTenDecade(films),
    ownVersusRank(films),
    againstYourOwnStars(films, log),
    oldestUpTop(films),
    noShortMasterpieces(films),
    longestFilm(films),
    neverSettled(films, log),
  ].filter((n): n is Note => n !== null);
}
