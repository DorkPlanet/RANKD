"use client";

// Turning a finished ranking into what a card draws.
//
// The one rule worth stating: a card is built from a SNAPSHOT, never from a live
// query. `entries` carry their own titles, years, posters and star ratings, and
// the stats are computed once, here — so re-exporting a ranking a year later
// draws the same picture even if half those films have since left the library or
// been re-rated. `lib/lists.ts` freezes the order for the same reason.

import { cachedMe } from "../account";
import { genresIn } from "../genres";
import { pickInsight } from "../insight";
import { decadesIn, fingerprint } from "../profile";
import { subjectEyebrow, subjectKey, subjectTitle, type RankSubject } from "../subject";
import { axisLabel, tasteAxes, tasteShape } from "../taste";
import { ORDERED_TIERS, starsFor, tierCounts } from "../tiers";
import type { CardCharts, CardData, CardEntry, CardStats } from "./types";
import type { Film } from "../types";

/** How many bars a chart may show before it stops being readable on a phone. */
const MAX_BARS = 5;
/** Below this a distribution is not a distribution, it is a fact. */
const MIN_SLICES = 2;

/**
 * The distributions a design may plot, or nothing.
 *
 * ── Each chart withholds itself ────────────────────────────────────────────
 *
 * Every one of these returns `undefined` rather than a degenerate shape, and
 * the guards are the interesting part of this function:
 *
 *  · The TASTE radar needs at least three axes. `tasteAxes` already refuses a
 *    genre with fewer than `MIN_FOR_AXIS` placed films, so on a filmography —
 *    nineteen films, two genres between them — it returns one or two and the
 *    radar correctly does not exist. A two-axis radar is a line.
 *  · GENRES, DECADES and TIERS need at least two buckets. One bar at full width
 *    says "all of them", which the stat strip already says in words and in less
 *    space.
 *
 * Guests are counted here, deliberately and consistently with `statsFor`: these
 * describe the LIST — what this is a ranking of — rather than describing you.
 * The average star rating is the one number that is about you, and it is the one
 * that excludes them.
 */
export function chartsFor(films: readonly Film[]): CardCharts | undefined {
  const charts: CardCharts = {};

  const axes = tasteAxes(films);
  if (axes.length >= 3) {
    const shape = tasteShape(films, axes);
    const taste = axes
      .filter((genre) => shape[genre] !== undefined)
      .map((genre) => ({ label: axisLabel(genre), value: shape[genre] }));
    // `tasteShape` applies the same minimum again over its own population, so
    // the count can fall below three between the two calls. Checked after.
    if (taste.length >= 3) charts.taste = taste;
  }

  const genres = genresIn(films).slice(0, MAX_BARS);
  if (genres.length >= MIN_SLICES) {
    charts.genres = genres.map((g) => ({ label: g.name, count: g.count }));
  }

  const decades = decadesIn(films).slice(0, MAX_BARS);
  if (decades.length >= MIN_SLICES) charts.decades = decades;

  // High to low rather than commonest first: a tier chart read out of star order
  // is not a chart of a scale, it is a bar chart that happens to use stars.
  const counts = tierCounts(films);
  const tiers = ORDERED_TIERS.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => ({
    label: starsFor(t),
    count: counts.get(t)!,
  }));
  if (tiers.length >= MIN_SLICES) charts.tiers = tiers;

  return Object.keys(charts).length ? charts : undefined;
}

export const entryFrom = (f: Film): CardEntry => ({
  title: f.title,
  ...(f.year ? { year: f.year } : {}),
  ...(f.poster ? { poster: f.poster } : {}),
  ...(f.guest ? { guest: true } : { rating: f.rating }),
});

/** The date a card is stamped with, in the one format every design uses. */
export const dateLabel = (d: Date = new Date()): string =>
  d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

/**
 * The numbers a design may show.
 *
 * Guests are excluded from everything rating-based and everything genre-based.
 * They are seeded at 3★ because the model needs somewhere to start on a film you
 * have never seen — counting that as a rating would drag an average toward the
 * middle using films you have no opinion of, and would report the seed back to
 * you as though it were your own judgement.
 */
export function statsFor(films: readonly Film[]): CardStats {
  const mine = films.filter((f) => !f.guest);
  // Two populations, deliberately.
  //
  // The AVERAGE is about you, so it may only count films you have actually
  // seen. The GENRE and the DECADE are about the list — "what is this a ranking
  // of" — so they count every film in it, borrowed ones included.
  //
  // Getting this wrong was visible on the card: the stat was computed over the
  // three seen films and said ACTION while the insight, computed over all
  // nineteen, said ten of them were drama. Two true statements that read as a
  // contradiction, side by side on the same picture. Whatever the split is, both
  // must be drawn from the same set.
  const you = fingerprint(mine);
  const list = fingerprint(films);
  return {
    films: films.length,
    ...(mine.length ? { avgRating: you.generosity?.mean } : {}),
    ...(list.genre ? { topGenre: list.genre.name } : {}),
    ...(list.decade ? { topDecade: list.decade.label } : {}),
  };
}

export function cardDataFromFilms(
  subject: RankSubject,
  films: readonly Film[],
  extra: { insight?: string; dateLabel?: string } = {},
): CardData {
  // ── The byline, read here rather than threaded through four screens ───────
  //
  // Four places build a card — the run summary, a saved list, the tier picker
  // and the live profile card — and not one of them holds `me`. Passing it down
  // all four would mean four prop chains for one string that is already sitting
  // in this browser's storage. `cachedMe` is synchronous, shape-checked, and
  // already guards `typeof window === "undefined"`, so a card built on a server
  // simply has no byline rather than throwing.
  const handle = cachedMe()?.handle ?? null;

  return {
    subject,
    title: subjectTitle(subject),
    eyebrow: subjectEyebrow(subject),
    ...(handle ? { handle } : {}),
    entries: films.map(entryFrom),
    ...(subject.kind === "director" || subject.kind === "actor"
      ? subject.portrait
        ? { portrait: subject.portrait }
        : {}
      : {}),
    stats: statsFor(films),
    ...(() => {
      const charts = chartsFor(films);
      return charts ? { charts } : {};
    })(),
    // Seeded on the subject, not on anything random: all three designs must
    // print the SAME claim, and a card must say the same thing in the preview
    // and in the file you downloaded from it.
    ...(() => {
      const line = extra.insight ?? pickInsight(films, subject, subjectKey(subject));
      return line ? { insight: line } : {};
    })(),
    dateLabel: extra.dateLabel ?? dateLabel(),
  };
}
