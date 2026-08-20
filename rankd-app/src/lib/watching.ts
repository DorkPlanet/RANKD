// How you actually watch, as opposed to what you own.
//
// ── The test every line here has to pass ───────────────────────────────────
//
// `superlatives` in `profile.ts` reports the oldest film, the biggest year and
// the longest runtime. All true, all uninteresting, and all computable by
// anybody holding your Letterboxd export. That is the flaw the taste chart had
// before it moved to settled positions, one level down.
//
// So a stat belongs here only if it needs something the export does not carry:
// the duel log, or the runtimes and countries this app fetched itself.
//
// ── And the bias that killed the obvious version ───────────────────────────
//
// The duel log is not a random sample. King of the Hill picks opponents by score
// proximity, tier size decides how many rows a tier generates, Rough Cut writes
// no rows at all, and Fast Shuffle deliberately serves the pair it can least
// predict. Any stat shaped like "how often did X win" inherits all of that.
//
// The way through is to only ask questions the matchmaker has no opinion about.
// Nothing in pairing knows a film's runtime, its year or its country, so those
// comparisons are effectively random with respect to selection and mean what
// they appear to mean. Where a figure IS biased — `leastRead` below — it is
// named for what it actually measures rather than dressed up as taste.

import type { Judgement } from "./log";
import type { Film } from "./types";

/** Both films in a duel, when the library still holds them. */
const pairOf = (byId: Map<string, Film>, j: Judgement): [Film, Film] | null => {
  const a = byId.get(j.a);
  const b = byId.get(j.b);
  return a && b ? [a, b] : null;
};

/** The film the reader chose, or null for a draw. */
const winnerOf = (j: Judgement, a: Film, b: Film): Film | null =>
  j.o === "a" ? a : j.o === "b" ? b : null;

/**
 * Everything watched, in minutes.
 *
 * Runtime only, and only where it is known — a film whose artwork has not been
 * fetched has no runtime and is left out rather than guessed at with an average,
 * which would make the headline figure quietly wrong for a new library.
 * `known` is returned so the caller can say so instead of implying completeness.
 */
export function timeWatched(films: readonly Film[]): { minutes: number; known: number; total: number } {
  let minutes = 0;
  let known = 0;
  for (const f of films) {
    if (!f.runtime) continue;
    minutes += f.runtime;
    known += 1;
  }
  return { minutes, known, total: films.length };
}

/**
 * Do you pick the longer film?
 *
 * The matchmaker has no idea how long anything is, so length is effectively
 * random across duels and this measures what it looks like it measures. Draws
 * and equal-length pairs are excluded: neither is a preference about runtime.
 *
 * `null` under a floor, because a percentage off nine duels is not a trait.
 */
export const MIN_FOR_TRAIT = 25;

export function runtimeBias(
  films: readonly Film[],
  log: readonly Judgement[],
): { longer: number; of: number } | null {
  const byId = new Map(films.map((f) => [f.id, f]));
  let longer = 0;
  let of = 0;
  for (const j of log) {
    const pair = pairOf(byId, j);
    if (!pair) continue;
    const [a, b] = pair;
    if (!a.runtime || !b.runtime || a.runtime === b.runtime) continue;
    const won = winnerOf(j, a, b);
    if (!won) continue;
    of += 1;
    if (won.runtime === Math.max(a.runtime, b.runtime)) longer += 1;
  }
  return of >= MIN_FOR_TRAIT ? { longer, of } : null;
}

/**
 * Pairs you have answered both ways.
 *
 * Counted per PAIR rather than per row, so a film you flip-flopped on three
 * times is one changed mind and not three. Draws are ignored — a draw is not a
 * position to contradict.
 */
export function changedYourMind(log: readonly Judgement[]): number {
  const seen = new Map<string, Set<string>>();
  for (const j of log) {
    if (j.o === "draw") continue;
    const key = j.a < j.b ? `${j.a}:${j.b}` : `${j.b}:${j.a}`;
    const winner = j.o === "a" ? j.a : j.b;
    const winners = seen.get(key);
    if (winners) winners.add(winner);
    else seen.set(key, new Set([winner]));
  }
  let flipped = 0;
  for (const winners of seen.values()) if (winners.size > 1) flipped += 1;
  return flipped;
}

/**
 * Times you chose a film you had rated LOWER than the one it faced.
 *
 * Only possible in a cross-tier duel, which since Random was removed happens
 * only in curated runs — so this may be a small number or none at all. Reported
 * honestly rather than padded: a library that has never contradicted its own
 * stars should say zero, not go looking for a way to say something.
 */
export function overruledYourStars(films: readonly Film[], log: readonly Judgement[]): number {
  const byId = new Map(films.map((f) => [f.id, f]));
  let n = 0;
  for (const j of log) {
    const pair = pairOf(byId, j);
    if (!pair) continue;
    const [a, b] = pair;
    const won = winnerOf(j, a, b);
    if (!won) continue;
    const lost = won === a ? b : a;
    if (won.rating < lost.rating) n += 1;
  }
  return n;
}

/** A film's decade as a label, or null when the year is missing or malformed. */
const decadeOf = (f: Film): string | null =>
  /^\d{4}$/.test(f.year ?? "") ? `${Math.floor(Number(f.year) / 10) * 10}s` : null;

/**
 * Which decade wins when two of them meet.
 *
 * Same clean footing as runtime: nothing in pairing knows a film's year. Only
 * decades that have actually faced each other appear, and only the matchup with
 * the most evidence is returned — every pairing at once is a table nobody reads.
 */
export function decadeClash(
  films: readonly Film[],
  log: readonly Judgement[],
): { won: string; lost: string; wins: number; of: number } | null {
  const byId = new Map(films.map((f) => [f.id, f]));
  const tally = new Map<string, { a: string; b: string; aWins: number; of: number }>();
  for (const j of log) {
    const pair = pairOf(byId, j);
    if (!pair) continue;
    const [fa, fb] = pair;
    const da = decadeOf(fa);
    const db = decadeOf(fb);
    if (!da || !db || da === db) continue;
    const won = winnerOf(j, fa, fb);
    if (!won) continue;
    const [lo, hi] = da < db ? [da, db] : [db, da];
    const key = `${lo}|${hi}`;
    const row = tally.get(key) ?? { a: lo, b: hi, aWins: 0, of: 0 };
    row.of += 1;
    if (decadeOf(won) === lo) row.aWins += 1;
    tally.set(key, row);
  }
  let best: { won: string; lost: string; wins: number; of: number } | null = null;
  for (const row of tally.values()) {
    if (row.of < MIN_FOR_TRAIT) continue;
    const aLeads = row.aWins * 2 >= row.of;
    const candidate = {
      won: aLeads ? row.a : row.b,
      lost: aLeads ? row.b : row.a,
      wins: aLeads ? row.aWins : row.of - row.aWins,
      of: row.of,
    };
    if (!best || candidate.of > best.of) best = candidate;
  }
  return best;
}

/**
 * The hour you rank in most, 0-23, and how much of your ranking happens there.
 *
 * Behaviour rather than taste, so no bias to reason about. Local hours, because
 * "you rank at 11pm" is a claim about your evening and not about UTC.
 */
export function whenYouRank(log: readonly Judgement[]): { hour: number; share: number } | null {
  if (log.length < MIN_FOR_TRAIT) return null;
  const hours = new Array<number>(24).fill(0);
  for (const j of log) hours[new Date(j.t).getHours()] += 1;
  let hour = 0;
  for (let h = 1; h < 24; h++) if (hours[h] > hours[hour]) hour = h;
  return { hour, share: hours[hour] / log.length };
}

/** Gaps longer than this end a sitting. */
export const SITTING_GAP_MS = 20 * 60 * 1000;

/**
 * The most duels answered in one unbroken sitting.
 *
 * A sitting ends at a gap of twenty minutes, which is long enough to survive
 * looking a film up and short enough that tomorrow is never the same session.
 * The log is sorted first: rows arrive in order today, but a merged log from two
 * devices interleaves by id and this must not read that as one long evening.
 */
export function longestSitting(log: readonly Judgement[]): number {
  if (log.length === 0) return 0;
  const times = log.map((j) => j.t).sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < times.length; i++) {
    run = times[i] - times[i - 1] <= SITTING_GAP_MS ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * The film that has been asked about most.
 *
 * NAMED FOR WHAT IT MEASURES, deliberately. The matchmaker serves the pair it
 * can least predict, so a high duel count says the model could not get a read on
 * this film — it does not say you were torn, and calling it "most argued over"
 * would be dressing a property of the algorithm up as a property of the reader.
 */
export function leastRead(films: readonly Film[], log: readonly Judgement[]): { film: Film; duels: number } | null {
  const byId = new Map(films.map((f) => [f.id, f]));
  const count = new Map<string, number>();
  for (const j of log) {
    if (byId.has(j.a)) count.set(j.a, (count.get(j.a) ?? 0) + 1);
    if (byId.has(j.b)) count.set(j.b, (count.get(j.b) ?? 0) + 1);
  }
  let bestId: string | null = null;
  for (const [id, n] of count) if (!bestId || n > count.get(bestId)!) bestId = id;
  if (!bestId) return null;
  const film = byId.get(bestId)!;
  return { film, duels: count.get(bestId)! };
}

/** One country, and how much of the library came from it. */
export interface CountryCount {
  code: string;
  films: number;
}

/**
 * Where the library was made, commonest first.
 *
 * A co-production counts once for EACH country on it, so the totals deliberately
 * exceed the film count — the question is "has your viewing touched this place",
 * not "which single country owns this film", and picking one would silently
 * erase the smaller partner every time.
 *
 * `known` is separate from the library size because country arrives with the
 * artwork and a fresh import has none of it. A caller that shows a share must
 * divide by `known`, or a half-swept library reads as though most of what you
 * watch came from nowhere.
 */
export function countriesOf(films: readonly Film[]): { list: CountryCount[]; known: number } {
  const tally = new Map<string, number>();
  let known = 0;
  for (const f of films) {
    if (!f.countries?.length) continue;
    known += 1;
    for (const code of new Set(f.countries)) tally.set(code, (tally.get(code) ?? 0) + 1);
  }
  const list = [...tally.entries()]
    .map(([code, n]) => ({ code, films: n }))
    .sort((a, b) => b.films - a.films || a.code.localeCompare(b.code));
  return { list, known };
}
