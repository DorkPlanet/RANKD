// The shuffled page's order: what the evidence says, tiers ignored.
//
// The thing worth testing is precisely the thing the tiered list CANNOT do.
// Score bands never overlap — 5★ is 9001..10000, 4★ is 7001..8000 — so a plain
// score sort can never put a 4★ above a 5★, however one-sided the duels were.
// If this file's central test can be made to pass by sorting on `score`, the
// feature does not exist.

import { describe, expect, it } from "vitest";
import { buildBeliefOrder, buildContinuousOrder, buildList } from "@/lib/list";
import type { Belief } from "@/lib/bayes";
import type { Film } from "@/lib/types";
import type { Rating } from "@/lib/tiers";
import { seedScore } from "@/lib/tiers";

/** A placed film. A soft lock is what the shuffled page is made of. */
const film = (id: string, rating: Rating, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  rating,
  score: seedScore(rating),
  lock: "soft",
  ...over,
});

const beliefs = (of: Record<string, number>): Map<string, Belief> =>
  new Map(Object.entries(of).map(([id, mean]) => [id, { mean, spread: 0.5 }]));

describe("buildBeliefOrder", () => {
  it("puts a low-tier film above a high-tier one when the evidence says so", () => {
    // THE test. `underdog` is 3★ and `favourite` is 5★, so their score bands
    // cannot overlap and the tiered list is obliged to draw the 5★ first. The
    // duels say otherwise, and this page is where that is allowed to show.
    const films = [film("favourite", 5), film("underdog", 3)];
    const out = buildBeliefOrder(films, beliefs({ underdog: 9.4, favourite: 6.1 }));
    expect(out.map((r) => r.film.id)).toEqual(["underdog", "favourite"]);
  });

  it("does not touch the master list it is a view over", () => {
    // Read-only is the whole safety argument: the disagreement is information,
    // not a write. The tiered model must be unmoved by any of this.
    const films = [film("favourite", 5), film("underdog", 3)];
    buildBeliefOrder(films, beliefs({ underdog: 9.4, favourite: 6.1 }));
    const tiered = buildList(films);
    expect(tiered.sections.map((s) => s.tier)).toEqual([5, 3]);
    expect(films.map((f) => f.score)).toEqual([seedScore(5), seedScore(3)]);
  });

  it("carries the SAME rank numbers the tiered page shows", () => {
    // A number means "position in the master order" on both pages, or the two
    // screens contradict each other about what a number is. Only the ORDER
    // differs — which is exactly how a reader sees the model disagreeing.
    const films = [film("a", 5), film("b", 3)];
    const flat = buildBeliefOrder(films, beliefs({ b: 9.9, a: 1 }));
    const tiered = buildList(films);
    const rankOf = (id: string) =>
      tiered.sections.flatMap((s) => s.placed).find((r) => r.film.id === id)!.rank;
    for (const row of flat) expect(row.rank).toBe(rankOf(row.film.id));
  });

  it("leaves out films with no position", () => {
    // An unplaced film's belief is still its seed, so including it would sort a
    // whole untouched tier into the middle of the answer on its stars alone.
    const films = [film("placed", 4), film("never", 5, { lock: undefined })];
    const out = buildBeliefOrder(films, beliefs({ placed: 8, never: 10 }));
    expect(out.map((r) => r.film.id)).toEqual(["placed"]);
  });

  it("falls back to the seed for a film the fit never reached", () => {
    // `rankByBelief` seeds at `rating * 2`, so a film missing from the map still
    // sorts sensibly rather than sinking to the bottom as an implicit zero.
    const films = [film("low", 2), film("high", 5)];
    const out = buildBeliefOrder(films, beliefs({}));
    expect(out.map((r) => r.film.id)).toEqual(["high", "low"]);
  });

  it("is stable when two films are equally believed", () => {
    // Equal means would otherwise swap places between renders, which reads as
    // the list shuffling itself while you look at it.
    const films = [film("bravo", 4), film("alpha", 4)];
    const order = () =>
      buildBeliefOrder(films, beliefs({ alpha: 8, bravo: 8 })).map((r) => r.film.id);
    expect(order()).toEqual(order());
  });

  it("is empty when nothing has been placed", () => {
    expect(buildBeliefOrder([film("x", 4, { lock: undefined })], beliefs({}))).toEqual([]);
  });
});

// ── The whole library, for the screen that cuts it into tiers ──────────────
//
// `buildContinuousOrder` differs from `buildBeliefOrder` in exactly two ways,
// and both are the point: it includes unplaced films, and it numbers positions
// rather than borrowing the master rank. The tests below pin both, and the last
// one pins that adding it changed nothing about the page above.
describe("buildContinuousOrder", () => {
  it("includes unplaced films, because the cuts rate every film", () => {
    // `buildBeliefOrder` leaves them out for a good reason. Here a list missing
    // a third of the library would produce an export missing a third of it.
    const films = [film("placed", 4), film("never", 5, { lock: undefined })];
    const out = buildContinuousOrder(films, beliefs({ placed: 8, never: 10 }));
    expect(out.map((r) => r.film.id)).toEqual(["never", "placed"]);
  });

  it("numbers positions 1..N with no gaps", () => {
    // A gap is information everywhere else in the app. Here it would be a lie:
    // somebody about to say "the top forty are 5-star" needs forty rows and
    // "#40" to be the same place.
    const films = [
      film("a", 5),
      film("b", 4, { lock: undefined }),
      film("c", 3),
      film("d", 2, { lock: undefined }),
    ];
    const out = buildContinuousOrder(films, beliefs({}));
    expect(out.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });

  it("orders by the evidence, not by the tier band", () => {
    const films = [film("favourite", 5), film("underdog", 3)];
    const out = buildContinuousOrder(films, beliefs({ underdog: 9.4, favourite: 6.1 }));
    expect(out.map((r) => r.film.id)).toEqual(["underdog", "favourite"]);
  });

  it("does not touch the library it is a view over", () => {
    const films = [film("favourite", 5), film("underdog", 3)];
    const before = JSON.stringify(films);
    buildContinuousOrder(films, beliefs({ underdog: 9.4, favourite: 6.1 }));
    expect(JSON.stringify(films)).toBe(before);
  });

  it("leaves buildBeliefOrder's contract alone", () => {
    // The shuffled page still excludes unplaced films.
    const films = [film("placed", 4), film("never", 5, { lock: undefined })];
    expect(buildBeliefOrder(films, beliefs({})).map((r) => r.film.id)).toEqual(["placed"]);
  });
});
