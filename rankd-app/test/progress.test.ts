import { describe, expect, it } from "vitest";

import { newJudgement } from "@/lib/log";
import { libraryProgress, pct, sessionProgress } from "@/lib/progress";
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
    expect(libraryProgress([], [])).toEqual({ total: 0, shuffled: 0, hard: 0, soft: 0 });
    expect(pct(0, 0)).toBe(0);
  });

  it("reports nothing shuffled when there is no evidence", () => {
    const out = libraryProgress([film("a"), film("b")], []);
    expect(out.shuffled).toBe(0);
    expect(out.total).toBe(2);
  });

  it("counts both films of a duel", () => {
    expect(libraryProgress([film("a"), film("b"), film("c")], [duel("a", "b")]).shuffled).toBe(2);
  });

  // Breadth, not volume — `duels` already answers "how much fighting".
  it("counts a film once however many duels it has fought", () => {
    const log = [duel("a", "b"), duel("a", "b"), duel("a", "b")];
    expect(libraryProgress([film("a"), film("b"), film("c")], log).shuffled).toBe(2);
  });

  it("ignores judgements naming a film no longer in the library", () => {
    const out = libraryProgress([film("a")], [duel("a", "deleted"), duel("ghost", "gone")]);
    expect(out.shuffled).toBe(1);
    expect(out.total).toBe(1);
  });

  // A film ranked by hand is as genuinely compared as one ranked by shuffling.
  it("counts a duel from any mode, not only shuffle runs", () => {
    const log = [newJudgement("a", "b", "a", "koth"), newJudgement("c", "d", "b", "spotlight")];
    expect(libraryProgress([film("a"), film("b"), film("c"), film("d")], log).shuffled).toBe(4);
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

  it("tracks the two measures independently — locked is not implied by shuffled", () => {
    // Placed by hand without ever being duelled (a flick, then a confirm).
    const out = libraryProgress([film("a", "hard"), film("b")], []);
    expect(out.hard).toBe(1);
    expect(out.shuffled).toBe(0);
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
