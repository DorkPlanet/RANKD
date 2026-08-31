// Where a ranking has got to, and what would move it on.
//
// ── Why this exists ────────────────────────────────────────────────────────
//
// The home screen used to ask a question — "Start ranking" opening a menu of
// four modes — and the reader had no way to answer it. Rough Cut, King of the
// Hill, Fast Shuffle and Curator are one line of blurb each; nothing said which
// one THIS library needs, or that they are stages of one process rather than
// four things to choose between. Reported as "what the hell do I pick?".
//
// So the screen stops asking and starts saying. This works out which stage a
// library is at and which tool answers it, and the button goes straight there.
//
// ── The pipeline it encodes ────────────────────────────────────────────────
//
// Fast Shuffle is the only mode that works across the WHOLE library: it fits a
// model over your duels and places films provisionally, cheaply, a few at a
// time. Rough Cut is tier-scoped — it deals one star rating into three piles —
// and its last action is starting a King of the Hill run over one of them. So
// the order is not four peers, it is:
//
//     loosen the whole list  ->  cut a tier into piles  ->  climb a pile
//
// with Curator sitting outside it entirely, because it changes nothing.
//
// ── Derived, never stored ──────────────────────────────────────────────────
//
// Every input is already on the films or in the log. Nothing here is written
// down, so there is no stage to migrate, nothing to get out of step with the
// library, and a restored backup lands at the right stage without being told.

import { isHard, isPlaced } from "./lock";
import type { Judgement } from "./log";
import { libraryProgress } from "./progress";
import { ORDERED_TIERS, type Rating } from "./tiers";
import type { Film } from "./types";

export type Stage = "empty" | "untouched" | "loosening" | "cutting" | "refining" | "settled";

/** Which tool answers this stage. `null` when there is nothing to do. */
export type NextMode = "import" | "shuffle" | "roughcut" | "koth" | null;

export interface RankingState {
  stage: Stage;
  next: NextMode;
  /** The tier the suggested run should open on, when the mode is tier-scoped. */
  tier?: Rating;
  /** Counts the screen can report without recomputing them. */
  total: number;
  placed: number;
  settled: number;
  /** Films with no position at all. */
  unplaced: number;
}

/**
 * Enough of a library placed to be worth refining rather than broadening.
 *
 * Two thirds rather than everything: waiting for a full sweep would leave a
 * reader with 800 films stuck on "keep shuffling" for hours, and the last third
 * of a shuffle pass is its least valuable part — the model is confident about
 * those films precisely because nothing has contradicted it.
 */
const MOSTLY_PLACED = 2 / 3;

/**
 * The tier worth cutting next: the one with the most films still unsettled.
 *
 * Unsettled, not unplaced. A tier full of the model's provisional guesses is
 * exactly what Rough Cut and a climb are for; a tier already hard-locked by hand
 * is finished whatever the model thinks. Ties break toward the better rating,
 * because `ORDERED_TIERS` runs best-first and the films you care most about are
 * the ones worth settling first.
 */
export function busiestTier(films: readonly Film[]): Rating | undefined {
  let best: Rating | undefined;
  let bestCount = 0;
  for (const tier of ORDERED_TIERS) {
    const n = films.filter((f) => f.rating === tier && !isHard(f)).length;
    if (n > bestCount) {
      best = tier;
      bestCount = n;
    }
  }
  // Two films is the floor for a climb and three for a cut; below that there is
  // nothing a tier-scoped run could do with it.
  return bestCount >= 3 ? best : undefined;
}

/**
 * What this library needs next.
 *
 * `log` is only used for coverage, so passing an empty one during the first
 * render before it loads reports "untouched" rather than throwing — which is the
 * right answer to show for a beat, and it corrects itself when the log lands.
 */
export function rankingState(films: readonly Film[], log: readonly Judgement[]): RankingState {
  const { total, hard, soft } = libraryProgress(films, log);
  const placed = hard + soft;
  const unplaced = total - placed;
  const tier = busiestTier(films);
  const base = { total, placed, settled: hard, unplaced };

  if (total === 0) return { ...base, stage: "empty", next: "import" };

  // Everything committed by hand: there is no next run, only the list.
  if (hard === total) return { ...base, stage: "settled", next: null };

  // Nothing has a position yet. The whole library needs loosening, and only Fast
  // Shuffle works at that scale.
  if (placed === 0) return { ...base, stage: "untouched", next: "shuffle" };

  if (placed / total < MOSTLY_PLACED) return { ...base, stage: "loosening", next: "shuffle" };

  // Placed, but mostly by the model rather than by hand. A cut is the cheapest
  // way to turn a tier of guesses into piles small enough to climb.
  //
  // No tier big enough to cut means the work left is scattered thin, which a
  // climb handles and a cut cannot.
  if (hard < placed / 2 && tier !== undefined) {
    return { ...base, stage: "cutting", next: "roughcut", tier };
  }

  return { ...base, stage: "refining", next: "koth", ...(tier !== undefined ? { tier } : {}) };
}

/**
 * The line under the headline: what is actually left.
 *
 * Counts rather than percentages, deliberately. "68% ranked" is a score and
 * invites nothing; "23 still to place" is a number of decisions, which is the
 * unit the reader works in and the only one that gets smaller as they play.
 */
export function stateDetail(s: RankingState, one: string, many: string): string {
  const n = (count: number, word: string) => `${count.toLocaleString()} ${count === 1 ? one : word}`;
  switch (s.stage) {
    case "empty":
      return "";
    case "settled":
      return `Every ${one} settled by hand`;
    case "untouched":
      return `${n(s.total, many)} waiting`;
    case "loosening":
      return `${n(s.unplaced, many)} still to place`;
    case "cutting":
      return `${n(s.placed - s.settled, many)} placed but not settled`;
    case "refining":
      return `${n(s.total - s.settled, many)} left to settle`;
  }
}

/** What the button says. */
export function stateAction(s: RankingState): string {
  switch (s.stage) {
    case "empty":
      return "Import";
    case "settled":
      return "See your list";
    case "untouched":
      return "Start ranking";
    default:
      return "Continue ranking";
  }
}

/**
 * One line naming the tool, so the button is never a mystery box.
 *
 * The reader is being sent somewhere without choosing it, and the least this can
 * do is say where. It also teaches the pipeline by attrition: play for a while
 * and the same three names come round in the same order, which is the shape the
 * modes actually have.
 */
export function stateWhy(s: RankingState, one: string): string {
  switch (s.next) {
    case "import":
      return "";
    case "shuffle":
      return "Fast Shuffle — two at a time, no commitment";
    case "roughcut":
      return "Rough Cut — split a tier into piles";
    case "koth":
      return `King of the Hill — settle the close calls`;
    default:
      return `Nothing left to decide. Every ${one} is where you put it.`;
  }
}

/** Films still worth a decision, best-tier first — for the empty-ish states. */
export function unsettledCount(films: readonly Film[]): number {
  return films.filter((f) => !isHard(f)).length;
}

/** Placed at all, by anything. Re-exported so callers need one import. */
export const placedCount = (films: readonly Film[]): number => films.filter(isPlaced).length;
