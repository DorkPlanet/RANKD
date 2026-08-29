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
import { isHard, isPlaced } from "./lock";
import { rankedFilms } from "./ladder";
import { ORDERED_TIERS, type Rating } from "./tiers";
import { rankByBelief } from "./people";
import type { Belief } from "./bayes";

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
  /** Has a number, however it got one. The umbrella count, reported as "ranked". */
  placedCount: number;
  /**
   * You committed to this one. A HARD lock, always <= placedCount.
   *
   * Split out because the difference between the two is the only thing on the
   * list a reader could not work out for themselves, and until now the app
   * never counted it anywhere. See the legend in `ListScreen`.
   */
  settledCount: number;
  total: number;
}

// A number is a film's position in the WHOLE library, not among the handful that
// happen to be placed. Counting only placed films made a half-star film read as
// "#2" — second best you own — when it only meant second of fifteen confirmed so
// far. Ranking against everything means the displayed numbers have gaps (only
// placed films show one), and each gap is an unplaced film you can see sitting
// right there. Tier bands never overlap, so a plain score sort is already
// tier-correct: every 4★ outranks every 3.5★ without special-casing.
/**
 * Every placed film's number in the master order, exactly as the list draws it.
 *
 * Exported so the film card can show the SAME number rather than working out its
 * own. `overallRank` in `ladder.ts` is NOT this number: it has no title
 * tiebreak and it numbers unplaced films too, so a card using that helper would
 * disagree with the list on ties and confidently contradict the screen the
 * reader just came from.
 */
export function rankMap(films: Film[]): Map<string, number> {
  const ranks = new Map<string, number>();
  rankedFilms(films)
    // Equal scores would otherwise swap places between renders; title is stable.
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .forEach((f, i) => {
      if (isPlaced(f)) ranks.set(f.id, i + 1);
    });
  return ranks;
}

/**
 * The shuffled page's order: what the EVIDENCE says, tiers ignored.
 *
 * ── Why this exists, and why it is not `buildList` ────────────────────────
 *
 * `buildList` groups by tier and that is correct for everything else in the
 * app: a star rating is a judgement the user made, and the locked page is a
 * record of judgements. But Fast Shuffle's whole premise is that the model has
 * an opinion of its own, and a tier band is a wall it may never climb —
 * 5★ = 9001..10000, 4★ = 7001..8000, so a 4★ the evidence rates above
 * everything you own still draws below the worst of your 5★s.
 *
 * That is the app hiding its own answer. The model's belief is a single
 * continuous scale seeded at `rating * 2` and moved by duels, so it can and
 * does say "this 3★ beats those 4★s" — and until now there was nowhere that
 * showed it.
 *
 * ── Read-only, and that is the point ──────────────────────────────────────
 *
 * Nothing here writes. No score moves, no lock changes, no rating is touched.
 * It is a VIEW over `beliefsFor`, which is what makes it safe to disagree with
 * the master list: the disagreement is the information.
 *
 * The rank numbers are still `rankMap`'s — the film's position in the master
 * order — so a row means the same thing on both pages and the two screens can
 * never contradict each other about what a number is. The ORDER differs; the
 * numbers do not, which is exactly how a reader sees that the model disagrees.
 *
 * Unplaced films are left out. They have no evidence behind them, so their
 * belief is still the seed, and including them would sort a whole untouched
 * tier into the middle of the answer on the strength of its star rating alone.
 */
export function buildBeliefOrder(
  films: Film[],
  beliefs: Map<string, Belief>,
): RankedFilm[] {
  const ranks = rankMap(films);
  return rankByBelief(
    films.filter((f) => ranks.has(f.id)),
    beliefs,
  ).map((film) => ({ film, rank: ranks.get(film.id)! }));
}

export function buildList(films: Film[]): ListModel {
  const ranks = rankMap(films);

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

  return {
    sections,
    placedCount: ranks.size,
    settledCount: films.reduce((n, f) => (isHard(f) ? n + 1 : n), 0),
    total: films.length,
  };
}

// Search abandons the tier grouping — when you're hunting one film, sections are
// just noise between you and it. Placed films first (they have real positions),
// then the rest alphabetically.
export function searchList(model: ListModel, query: string): (RankedFilm | Film)[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hit = (t: string | undefined) => !!t && t.toLowerCase().includes(q);
  // One bar, three things it can be. The user's ask, and the reason it is one
  // bar rather than a row of filter buttons: nobody arriving at a search field
  // wants to first declare what KIND of thing they are about to type. They know
  // "Fincher" is a director; the field can work that out too.
  //
  // Credits ride in on the same TMDb response as the poster (see the header of
  // `types.ts`), so this costs no extra request — only films whose artwork has
  // been fetched are searchable by person, which degrades quietly rather than
  // wrongly: a film with no credits yet simply does not match a director query.
  const matches = (f: Film): boolean =>
    hit(f.title) || hit(f.director) || (f.cast ?? []).some(hit);
  const placed = model.sections
    .flatMap((s) => s.placed)
    .filter((r) => matches(r.film))
    .sort((a, b) => a.rank - b.rank);
  const unplaced = model.sections
    .flatMap((s) => s.unplaced)
    .filter(matches)
    .sort((a, b) => a.title.localeCompare(b.title));
  return [...placed, ...unplaced];
}
