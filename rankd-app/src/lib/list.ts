// Turning the library into the thing the duels were for: a ranking you can read.
//
// The honest-number problem, and why this file exists. `score` is re-spread by
// writeScores on every confirm, and it re-spreads the WHOLE tier pool — so after
// the first confirm in a tier, all 173 of its films hold distinct scores while
// most have never been duelled. A distinct score is not an earned position.
// `confirmed` is the only marker that means a user actually placed a film, so
// that — not score — is what decides whether a film gets a number here.

import type { Film } from "./types";
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
      if (f.confirmed) ranks.set(f.id, i + 1);
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
    // Alphabetical, deliberately. These films have provisional scores that look
    // like an order but aren't one — sorting by them would assert a ranking the
    // duels never established. A-Z claims nothing and makes a film findable in a
    // block of a hundred.
    const unplaced = inTier
      .filter((f) => !ranks.has(f.id))
      .sort((a, b) => a.title.localeCompare(b.title));
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
