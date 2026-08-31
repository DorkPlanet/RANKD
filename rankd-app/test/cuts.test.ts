// Cutting one continuous order into tiers by hand.
//
// The first test in here is the reason the feature is allowed to write to the
// library at all. Everything else in the app treats a star rating as the
// primary key and re-imposes tier bands on every write — so a mode that hands
// the ordering to the user is only safe while the result still satisfies the
// invariant `list.ts` depends on: bands never overlap, and a plain score sort
// is already tier-correct. If `preserves the order it was given` ever fails,
// the master list and the cut screen have started disagreeing about what the
// user's library looks like, and the fix is not to change the assertion.

import { describe, expect, it } from "vitest";
import {
  BOOK_TIERS,
  MAX_PER_TIER,
  applyCuts,
  boundaries,
  cutAt,
  evenCuts,
  normalise,
  tierOfIndex,
  tiersFor,
} from "@/lib/cuts";
import { ORDERED_TIERS, tierMax, tierMin, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

/** A library in a known continuous order, best first. */
const library = (n: number, over: (i: number) => Partial<Film> = () => ({})): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `f${String(i).padStart(4, "0")}`,
    title: `film ${i}`,
    rating: 3 as Rating,
    score: 5000,
    ...over(i),
  }));

const TEN = ORDERED_TIERS;

describe("normalise", () => {
  it("always sums to the library size", () => {
    const cases: number[][] = [
      [10, 10, 10],
      [-5, 1e9, 0.7],
      [],
      [500],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    ];
    for (const c of cases) {
      const out = normalise(c, 200, 10);
      expect(out).toHaveLength(10);
      expect(out.reduce((a, b) => a + b, 0)).toBe(200);
      expect(out.every((n) => Number.isInteger(n) && n >= 0)).toBe(true);
    }
  });

  it("gives the remainder to the last tier, not a middle one", () => {
    // A middle tier absorbing it would silently move every cut beneath it.
    const out = normalise([10, 10, 10], 100, 3);
    expect(out).toEqual([10, 10, 80]);
  });

  it("never promises more films than are left", () => {
    const out = normalise([1000, 1000, 1000], 5, 3);
    expect(out).toEqual([5, 0, 0]);
  });

  it("handles an empty library", () => {
    expect(normalise([4, 4], 0, 2)).toEqual([0, 0]);
  });
});

describe("evenCuts", () => {
  it("splits as evenly as it can and still totals", () => {
    const out = evenCuts(861, 10);
    expect(out.reduce((a, b) => a + b, 0)).toBe(861);
    // 86 each, and the last carries the remainder.
    expect(out.slice(0, 9).every((n) => n === 86)).toBe(true);
  });
});

describe("boundaries", () => {
  it("gives the index each tier starts at", () => {
    expect(boundaries([3, 2, 4])).toEqual([0, 3, 5]);
  });
});

describe("tierOfIndex", () => {
  it("labels each position with the rating of its group", () => {
    expect(tierOfIndex([2, 1], [5, 4.5])).toEqual([5, 5, 4.5]);
  });
});

describe("applyCuts", () => {
  it("preserves the order it was given, which is why it may write at all", () => {
    // THE invariant. Sorting the result by score reproduces the input order, so
    // `rankMap`'s plain score sort and the cut screen can never disagree.
    const order = library(400);
    for (const counts of [
      evenCuts(400, 10),
      [200, 100, 50, 25, 12, 6, 3, 2, 1, 1],
      [0, 0, 400, 0, 0, 0, 0, 0, 0, 0],
      [1, 399, 0, 0, 0, 0, 0, 0, 0, 0],
    ]) {
      const { films } = applyCuts(order, counts, TEN);
      const bySort = [...films].sort((a, b) => b.score - a.score).map((f) => f.id);
      expect(bySort).toEqual(order.map((f) => f.id));
    }
  });

  it("leaves every score inside its own tier's band", () => {
    const { films } = applyCuts(library(400), evenCuts(400, 10), TEN);
    for (const f of films) {
      expect(f.score).toBeGreaterThanOrEqual(tierMin(f.rating));
      expect(f.score).toBeLessThanOrEqual(tierMax(f.rating));
    }
  });

  it("gives every film in a group the group's rating", () => {
    const { films } = applyCuts(library(6), [2, 2, 2], [5, 4, 3]);
    expect(films.map((f) => f.rating)).toEqual([5, 5, 4, 4, 3, 3]);
  });

  it("centres a lone film in its band rather than pinning it to an edge", () => {
    // Same rule as respreadTier, so a cut tier and a climbed one are
    // numerically indistinguishable.
    const { films } = applyCuts(library(1), [1], [4]);
    expect(films[0].score).toBe(Math.round((tierMin(4) + tierMax(4)) / 2));
  });

  it("touches only the rating and the score", () => {
    const order = library(4, (i) => ({
      lock: i % 2 ? ("hard" as const) : ("soft" as const),
      duels: i,
      tags: ["keep"],
      note: "mine",
    }));
    const { films } = applyCuts(order, [2, 2], [5, 4]);
    films.forEach((f, i) => {
      expect(f.lock).toBe(order[i].lock);
      expect(f.duels).toBe(order[i].duels);
      expect(f.tags).toEqual(order[i].tags);
      expect(f.note).toBe(order[i].note);
      expect(f.title).toBe(order[i].title);
    });
  });

  it("counts how many films actually changed rating", () => {
    const order = library(4, () => ({ rating: 5 as Rating }));
    const { moved } = applyCuts(order, [2, 2], [5, 4]);
    expect(moved).toBe(2);
  });

  it("returns every film, so an export cannot be short", () => {
    const order = library(861);
    const { films } = applyCuts(order, evenCuts(861, 10), TEN);
    expect(films).toHaveLength(861);
    expect(new Set(films.map((f) => f.id)).size).toBe(861);
  });

  it("reports a group too large to spread without collisions", () => {
    // A band is 1000 integers wide. Past that, two films land on one score and
    // the list breaks the tie by title — which reads as the cut being ignored.
    const order = library(MAX_PER_TIER + 50);
    const counts = normalise([MAX_PER_TIER + 50], order.length, 10);
    const { overflow } = applyCuts(order, counts, TEN);
    expect(overflow).toEqual([{ tier: 5, count: MAX_PER_TIER + 50 }]);
  });

  it("reports no overflow for a library that fits", () => {
    expect(applyCuts(library(861), evenCuts(861, 10), TEN).overflow).toEqual([]);
  });
});

describe("books", () => {
  it("cuts into five whole stars, because Goodreads refuses halves", () => {
    expect(tiersFor("book")).toEqual([5, 4, 3, 2, 1]);
    expect(tiersFor("film")).toEqual(ORDERED_TIERS);
  });

  it("emits only whole ratings a Goodreads re-upload will accept", () => {
    const { films } = applyCuts(library(20), evenCuts(20, 5), BOOK_TIERS);
    for (const f of films) expect(Number.isInteger(f.rating)).toBe(true);
    expect(new Set(films.map((f) => f.rating))).toEqual(new Set([5, 4, 3, 2, 1]));
  });
});

describe("cutAt", () => {
  it("makes the named index the first film of its tier", () => {
    const counts = [10, 10, 10];
    const next = cutAt(counts, 7, 1, 30);
    expect(boundaries(next)[1]).toBe(7);
    expect(next.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it("moves one boundary and leaves every other tier the size it was", () => {
    const counts = [10, 10, 10];
    const next = cutAt(counts, 7, 1, 30);
    expect(next[2]).toBe(10);
  });

  it("cannot drive a neighbour negative", () => {
    const counts = [10, 10, 10];
    // Asking for the 4.5★ line to start at 0 takes all ten from the tier above.
    const next = cutAt(counts, 0, 1, 30);
    expect(next.every((n) => n >= 0)).toBe(true);
    expect(next.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it("is a no-op on the first tier, which has no boundary above it", () => {
    const counts = [10, 10, 10];
    expect(cutAt(counts, 5, 0, 30)).toEqual(counts);
  });
});
