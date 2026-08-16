// Cards for things nobody ranked on purpose.
//
// Every other card in the app is drawn from a SNAPSHOT — a run that ended, or a
// saved list whose order froze at save time (see `data.ts`, and `lists.ts` for
// why the freeze matters). These are the opposite, and deliberately so.
//
// ── Why a live view is not a curated run ───────────────────────────────────
//
// King of the Hill over a tier already writes `score` and `lock`. The master
// list IS the app's answer for that tier, so ranking the same films again to
// produce a shareable order would be a second answer to a settled question, and
// the two would disagree the moment either changed. The order is already
// decided; what was missing was any way to LOOK at it.
//
// So these are read-only projections over `rankedFilms`, computed at the moment
// you open them and never stored. That is also why they cannot be saved: a saved
// copy would freeze at today and be wrong after the next duel, while claiming on
// its face to be your top ten. `isLiveSubject` in `subject.ts` is the guard.
//
// The floor is two films, matching `SavedListSheet` and the tier card in
// `SessionEnd`. One entry is not a ranking.

import { rankedFilms } from "../ladder";
import { isPlaced } from "../lock";
import { ORDERED_TIERS, type Rating } from "../tiers";
import { cardDataFromFilms } from "./data";
import { isLiveSubject, type RankSubject } from "../subject";
import type { CardData } from "./types";
import type { Film } from "../types";

/** How many entries a live card shows. Ten is what "Top 10" promises. */
export const LIVE_CARD_SIZE = 10;
/** Below this there is no order worth looking at. */
export const MIN_LIVE_CARD = 2;

/**
 * The films a live subject is a view OF, best first.
 *
 * Placed films only. An unranked film sits at its tier's seed score, so
 * including them would fill a "top ten" with whatever the import happened to
 * list first and present it as an opinion the user never gave.
 */
export function liveFilms(films: readonly Film[], subject: RankSubject): Film[] {
  const placed = films.filter((f) => !f.guest && isPlaced(f));
  const scope =
    subject.kind === "tier" ? placed.filter((f) => f.rating === subject.rating) : placed;
  return rankedFilms(scope).slice(0, LIVE_CARD_SIZE);
}

/** A live card, or null when there is not enough order to draw one. */
export function liveCard(films: readonly Film[], subject: RankSubject): CardData | null {
  if (!isLiveSubject(subject)) return null;
  const top = liveFilms(films, subject);
  if (top.length < MIN_LIVE_CARD) return null;
  return cardDataFromFilms(subject, top);
}

export interface LiveView {
  subject: RankSubject;
  films: Film[];
}

/**
 * Every live view this library can currently support, best tier first.
 *
 * Overall leads because it is the one the whole app is building toward; the
 * tiers follow in star order. A tier with nothing placed in it is omitted
 * rather than shown empty — the shelf is a list of things you HAVE, and an
 * empty slot on it would read as a chore.
 */
export function liveViews(films: readonly Film[]): LiveView[] {
  const out: LiveView[] = [];
  const overall = liveFilms(films, { kind: "overall" });
  if (overall.length >= MIN_LIVE_CARD) out.push({ subject: { kind: "overall" }, films: overall });
  for (const rating of ORDERED_TIERS) {
    const subject: RankSubject = { kind: "tier", rating: rating as Rating };
    const top = liveFilms(films, subject);
    if (top.length >= MIN_LIVE_CARD) out.push({ subject, films: top });
  }
  return out;
}
