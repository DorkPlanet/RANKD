import { describe, expect, it } from "vitest";

import { newJudgement } from "@/lib/log";
import {
  leastRanked,
  libraryProgress,
  pct,
  sessionProgress,
  sessionStats,
  tierProgress,
} from "@/lib/progress";
import type { Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, lock?: "soft" | "hard", rating: Rating = 4): Film => ({
  id,
  title: id,
  rating,
  score: 7500,
  lock,
});

const duel = (a: string, b: string) => newJudgement(a, b, "a", "shuffle");

describe("libraryProgress", () => {
  it("survives an empty library without dividing by zero", () => {
    expect(libraryProgress([], [])).toEqual({ total: 0, compared: 0, hard: 0, soft: 0 });
    expect(pct(0, 0)).toBe(0);
  });

  it("reports nothing compared when there is no evidence", () => {
    const out = libraryProgress([film("a"), film("b")], []);
    expect(out.compared).toBe(0);
    expect(out.total).toBe(2);
  });

  it("counts both films of a duel", () => {
    expect(libraryProgress([film("a"), film("b"), film("c")], [duel("a", "b")]).compared).toBe(2);
  });

  // Breadth, not volume — `duels` already answers "how much fighting".
  it("counts a film once however many duels it has fought", () => {
    const log = [duel("a", "b"), duel("a", "b"), duel("a", "b")];
    expect(libraryProgress([film("a"), film("b"), film("c")], log).compared).toBe(2);
  });

  it("ignores judgements naming a film no longer in the library", () => {
    const out = libraryProgress([film("a")], [duel("a", "deleted"), duel("ghost", "gone")]);
    expect(out.compared).toBe(1);
    expect(out.total).toBe(1);
  });

  // A film ranked by hand is as genuinely compared as one ranked by shuffling.
  it("counts a duel from any mode, not only shuffle runs", () => {
    const log = [newJudgement("a", "b", "a", "koth"), newJudgement("c", "d", "b", "spotlight")];
    expect(libraryProgress([film("a"), film("b"), film("c"), film("d")], log).compared).toBe(4);
  });

  describe("the lock split", () => {
    it("separates what you committed from what the evidence placed", () => {
      const out = libraryProgress(
        [film("a", "hard"), film("b", "hard"), film("c", "soft"), film("d")],
        [],
      );
      expect(out).toMatchObject({ total: 4, hard: 2, soft: 1 });
    });

    it("never counts a film in both halves", () => {
      const films = [film("a", "hard"), film("b", "soft"), film("c")];
      const out = libraryProgress(films, []);
      expect(out.hard + out.soft).toBeLessThanOrEqual(out.total);
      expect(out.hard + out.soft).toBe(2);
    });

    it("handles a fully committed library", () => {
      const films = [film("a", "hard"), film("b", "hard")];
      const out = libraryProgress(films, []);
      expect(out.hard).toBe(2);
      expect(out.soft).toBe(0);
      expect(pct(out.hard, out.total)).toBe(100);
    });

    it("handles a fully model-placed library", () => {
      const out = libraryProgress([film("a", "soft"), film("b", "soft")], []);
      expect(out.soft).toBe(2);
      expect(out.hard).toBe(0);
    });
  });

  // The two measures are independent in BOTH directions, and the second case is
  // the one that got reported as a bug: every film compared, none of them ranked,
  // so the bar reads 100% while the list is still all UN-RNKD. Both numbers are
  // right — which is why the labels, not the arithmetic, were what needed fixing.
  describe("compared and ranked are independent", () => {
    it("counts a film ranked by hand that was never duelled", () => {
      // A flick to the top, then a confirm — a position with no comparison.
      const out = libraryProgress([film("a", "hard"), film("b")], []);
      expect(out.hard).toBe(1);
      expect(out.compared).toBe(0);
    });

    it("counts films compared to exhaustion that still hold no position", () => {
      const films = [film("a"), film("b")];
      const out = libraryProgress(films, [duel("a", "b"), duel("a", "b"), duel("a", "b")]);
      expect(out.compared).toBe(2);
      expect(out.total).toBe(2);
      // 100% compared, 0% ranked. Every one of these is UN-RNKD in the list.
      expect(pct(out.compared, out.total)).toBe(100);
      expect(out.hard + out.soft).toBe(0);
    });
  });
});

describe("tierProgress", () => {
  it("returns every tier, including the empty ones", () => {
    const out = tierProgress([film("a", "hard", 4)]);
    expect(out).toHaveLength(10);
    expect(out.map((s) => s.rating)).toEqual([5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5]);
  });

  // The distinction the whole component turns on: both read "0 ranked", and one
  // is finished by definition while the other is the entire job.
  it("distinguishes an empty tier from an unranked one", () => {
    const out = tierProgress([film("a", undefined, 2), film("b", undefined, 2)]);
    const twoStar = out.find((s) => s.rating === 2)!;
    const fiveStar = out.find((s) => s.rating === 5)!;
    expect(twoStar).toEqual({ rating: 2, total: 2, ranked: 0 });
    expect(fiveStar).toEqual({ rating: 5, total: 0, ranked: 0 });
  });

  it("counts soft and hard locks alike as ranked", () => {
    const out = tierProgress([film("a", "hard", 3), film("b", "soft", 3), film("c", undefined, 3)]);
    expect(out.find((s) => s.rating === 3)).toEqual({ rating: 3, total: 3, ranked: 2 });
  });
});

describe("leastRanked", () => {
  it("says nothing about an empty library", () => {
    expect(leastRanked(tierProgress([]))).toBeUndefined();
  });

  it("says nothing when everything is already placed", () => {
    expect(leastRanked(tierProgress([film("a", "hard", 4)]))).toBeUndefined();
  });

  it("picks the least-ranked tier that still has films", () => {
    const out = leastRanked(
      tierProgress([
        film("a", "hard", 5),
        film("b", undefined, 2),
        film("c", undefined, 2),
        film("d", "hard", 3),
        film("e", undefined, 3),
      ]),
    );
    expect(out?.rating).toBe(2); // 0/2 beats 1/2
  });

  it("breaks a tie on size — the bigger job is the more useful nudge", () => {
    const films = [
      film("a", undefined, 4),
      film("b", undefined, 4),
      film("c", undefined, 4),
      film("d", undefined, 1),
    ];
    expect(leastRanked(tierProgress(films))?.rating).toBe(4);
  });
});

describe("sessionStats", () => {
  const at = (t: number) => ({ ...duel("a", "b"), t });

  it("is empty-safe", () => {
    expect(sessionStats([], 0, 0, 0)).toEqual({ duels: 0, settled: 0 });
  });

  it("counts only duels from this sitting", () => {
    const log = [at(100), at(200), at(300)];
    expect(sessionStats(log, 200, 0, 0).duels).toBe(2);
  });

  it("includes a duel landing exactly on the boundary", () => {
    expect(sessionStats([at(200)], 200, 0, 0).duels).toBe(1);
  });

  it("reports what was settled since the sitting began", () => {
    expect(sessionStats([], 0, 7, 4).settled).toBe(3);
  });

  // Withdrawing soft locks, or a reset, can move the count DOWN mid-sitting.
  // "-3 settled" is not a thing anyone should ever read.
  it("never reports a negative settled count", () => {
    expect(sessionStats([], 0, 2, 9).settled).toBe(0);
  });
});

describe("sessionProgress", () => {
  const pool = [film("a"), film("b"), film("c"), film("d")];

  it("is empty-safe", () => {
    expect(sessionProgress([], [])).toEqual({ total: 0, compared: 0 });
  });

  it("counts only films inside the run's scope", () => {
    // A duel involving a film outside the pool must not inflate the bar.
    const out = sessionProgress(pool, [duel("a", "outsider"), duel("b", "c")]);
    expect(out).toEqual({ total: 4, compared: 3 });
  });

  // The whole reason it reads the log rather than session state: a long run
  // interrupted and resumed must pick up where it left off.
  it("survives being resumed — the same log gives the same answer", () => {
    const log = [duel("a", "b")];
    const before = sessionProgress(pool, log);
    // Simulate walking away and coming back: fresh component, same evidence.
    const after = sessionProgress([...pool], [...log]);
    expect(after).toEqual(before);
  });

  it("fills as the scope is covered, and reaches 100% only when it is", () => {
    expect(pct(sessionProgress(pool, []).compared, 4)).toBe(0);
    expect(pct(sessionProgress(pool, [duel("a", "b")]).compared, 4)).toBe(50);
    expect(pct(sessionProgress(pool, [duel("a", "b"), duel("c", "d")]).compared, 4)).toBe(100);
  });
});

describe("pct", () => {
  it("is a straight percentage", () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(3, 4)).toBe(75);
    expect(pct(4, 4)).toBe(100);
  });

  it("returns 0 rather than NaN on an empty total", () => {
    expect(pct(0, 0)).toBe(0);
    expect(Number.isNaN(pct(5, 0))).toBe(false);
  });
});
