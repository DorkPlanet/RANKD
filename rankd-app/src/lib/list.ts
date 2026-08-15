// Turning the library into the thing the duels were for: a ranking you can read.
//
// The honest-number problem, and why this file exists. `score` is re-spread by
// writeScores on every confirm, and it re-spreads the WHOLE tier pool — so after
// the first confirm in a tier, all 173 of its films hold distinct scores while
// most have never been duelled. A distinct score is not an earned position.
//
// So a LOCK — not a score — is what earns a number here. Both kinds count: a
// hard lock is a placement the user committed to, a soft one is the model's,
// granted once the evidence settled the film. Both mean "this position is
// established"; they differ only in who established it, and in whether the model
// is still allowed to revise it (see lib/lock.ts).

import type { Film } from "./types";
import { isPlaced } from "./lock";
import { rankedFilms } from "./ladder";
import { ORDERED_TIERS, type Rating } from "./tiers";

export interface RankedFilm {
  film: Film;
  rank: number; // 1-based, across the whole library
}

export interface TierSection {
  tier: Rating;
  placed: RankedFilm[]; // confirmed, best first, carrying their overall rank
  unplaced: Film[]; // never confirmed — no number is claimed for these
  total: number;
}

export interface ListModel {
  sections: TierSection[];
  placedCount: number;
  total: number;
}

// A number is a film's position in the WHOLE library, not among the handful that
// happen to be placed. Counting only placed films made a half-star film read as
// "#2" — second best you own — when it only meant second of fifteen confirmed so
// far. Ranking against everything means the displayed numbers have gaps (only
// placed films show one), and each gap is an unplaced film you can see sitting
// right there. Tier bands never overlap, so a plain score sort is already
// tier-correct: every 4★ outranks every 3.5★ without special-casing.
export function buildList(films: Film[]): ListModel {
  const ranks = new Map<string, number>();
  rankedFilms(films)
    // Equal scores would otherwise swap places between renders; title is stable.
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .forEach((f, i) => {
      if (isPlaced(f)) ranks.set(f.id, i + 1);
    });

  const byTier = new Map<Rating, Film[]>();
  for (const f of films) {
    const t = f.rating as Rating;
    byTier.set(t, [...(byTier.get(t) ?? []), f]);
  }

  const sections: TierSection[] = [];
  for (const tier of ORDERED_TIERS) {
    const inTier = byTier.get(tier);
    if (!inTier?.length) continue; // an empty tier is nothing to show
    const placed = inTier
      .filter((f) => ranks.has(f.id))
      .map((f) => ({ film: f, rank: ranks.get(f.id)! }))
      .sort((a, b) => a.rank - b.rank);
    // By score, with A-Z breaking ties.
    //
    // ── Why this used to be alphabetical, and why it can't stay that way ─────
    //
    // The original rule was A-Z, on the grounds that an unplaced film's score is
    // provisional: `writeScores` spreads [confirmed, unconfirmed] across the
    // tier band on every confirm, so an unranked film's number is a by-product
    // of somebody else's climb rather than a judgement about it. Sorting by that
    // asserts an order the duels never established. All true, and it was the
    // right call for the app that existed when it was written.
    //
    // Rough Cut broke the premise. It writes score and DELIBERATELY writes no
    // lock, because putting a film in the top third is not committing to a
    // position. So every film it touches stays unplaced, lands here, and had its
    // one real decision sorted away: a user who carefully dealt a tier into
    // upper, middle and lower opened their list and found it alphabetical. The
    // scores were correct the whole time. This block was throwing them out.
    //
    // Between the two failures, discarding a decision the user actually made is
    // the worse one. Nothing here claims a ranking anyway — this block sits under
    // an UN-RNKD divider and shows no numbers, which is exactly what distinguishes
    // it from `placed` above.
    //
    // The tiebreak is what makes this safe rather than merely better: `seedScore`
    // is `tierMid`, so every film in a tier nobody has touched holds an identical
    // score and falls through to A-Z. An untouched library reads exactly as it
    // did before. Order only appears once something has actually happened.
    const unplaced = inTier
      .filter((f) => !ranks.has(f.id))
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    sections.push({ tier, placed, unplaced, total: inTier.length });
  }

  return { sections, placedCount: ranks.size, total: films.length };
}

// Search abandons the tier grouping — when you're hunting one film, sections are
// just noise between you and it. Placed films first (they have real positions),
// then the rest alphabetically.
export function searchList(model: ListModel, query: string): (RankedFilm | Film)[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (t: string) => t.toLowerCase().includes(q);
  const placed = model.sections
    .flatMap((s) => s.placed)
    .filter((r) => hit(r.film.title))
    .sort((a, b) => a.rank - b.rank);
  const unplaced = model.sections
    .flatMap((s) => s.unplaced)
    .filter((f) => hit(f.title))
    .sort((a, b) => a.title.localeCompare(b.title));
  return [...placed, ...unplaced];
}

export const isRanked = (row: RankedFilm | Film): row is RankedFilm =>
  (row as RankedFilm).film !== undefined;
