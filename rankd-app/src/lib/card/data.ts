"use client";

// Turning a finished ranking into what a card draws.
//
// The one rule worth stating: a card is built from a SNAPSHOT, never from a live
// query. `entries` carry their own titles, years, posters and star ratings, and
// the stats are computed once, here — so re-exporting a ranking a year later
// draws the same picture even if half those films have since left the library or
// been re-rated. `lib/lists.ts` freezes the order for the same reason.

import { pickInsight } from "../insight";
import { fingerprint } from "../profile";
import { subjectEyebrow, subjectKey, subjectTitle, type RankSubject } from "../subject";
import type { CardData, CardEntry, CardStats } from "./types";
import type { Film } from "../types";

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
  return {
    subject,
    title: subjectTitle(subject),
    eyebrow: subjectEyebrow(subject),
    entries: films.map(entryFrom),
    ...(subject.kind === "director" || subject.kind === "actor"
      ? subject.portrait
        ? { portrait: subject.portrait }
        : {}
      : {}),
    stats: statsFor(films),
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
