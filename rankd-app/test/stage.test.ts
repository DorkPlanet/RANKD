// Which stage a ranking is at, and what would move it on.
//
// The home screen used to ask "which of these four games do you want?" and give
// the reader nothing to answer it with. These tests pin down the answer it gives
// instead — and mostly they pin down the ORDER, because the whole value is that
// the three modes are stages of one process rather than four peers.

import { describe, expect, it } from "vitest";

import type { Judgement } from "@/lib/log";
import { busiestTier, rankingState, stateAction, stateDetail, stateWhy } from "@/lib/stage";
import { tierMid, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

let seq = 0;
const film = (rating: Rating, lock?: "soft" | "hard"): Film => ({
  id: `f${seq++}`,
  title: `F${seq}`,
  rating,
  score: tierMid(rating),
  ...(lock ? { lock } : {}),
});

/** n films at one rating, with the same lock state. */
const many = (n: number, rating: Rating, lock?: "soft" | "hard"): Film[] =>
  Array.from({ length: n }, () => film(rating, lock));

const noLog: Judgement[] = [];

describe("the stages, in order", () => {
  it("an empty library asks for an import", () => {
    const s = rankingState([], noLog);
    expect(s.stage).toBe("empty");
    expect(s.next).toBe("import");
    expect(stateAction(s)).toBe("Import");
  });

  it("a fresh import goes to Fast Shuffle", () => {
    // Nothing placed. Only Fast Shuffle works across the whole library, which is
    // what a library nobody has touched needs.
    const s = rankingState(many(40, 4), noLog);
    expect(s.stage).toBe("untouched");
    expect(s.next).toBe("shuffle");
    expect(s.unplaced).toBe(40);
  });

  it("stays on Fast Shuffle while most of the library is unplaced", () => {
    const s = rankingState([...many(10, 4, "soft"), ...many(30, 4)], noLog);
    expect(s.stage).toBe("loosening");
    expect(s.next).toBe("shuffle");
  });

  it("moves to Rough Cut once most films are placed but few are settled", () => {
    // Placed by the model, not by hand: a cut turns a tier of guesses into piles
    // small enough to climb.
    const s = rankingState([...many(30, 4, "soft"), ...many(10, 4)], noLog);
    expect(s.stage).toBe("cutting");
    expect(s.next).toBe("roughcut");
    expect(s.tier).toBe(4);
  });

  it("moves to King of the Hill once hand-settling is under way", () => {
    const s = rankingState([...many(25, 4, "hard"), ...many(15, 4, "soft")], noLog);
    expect(s.stage).toBe("refining");
    expect(s.next).toBe("koth");
  });

  it("has nothing to offer once every film is settled by hand", () => {
    const s = rankingState(many(20, 4, "hard"), noLog);
    expect(s.stage).toBe("settled");
    expect(s.next).toBeNull();
    expect(stateAction(s)).toBe("See your list");
  });
});

describe("the boundary between loosening and cutting", () => {
  it("is two thirds placed, not everything", () => {
    // Waiting for a full sweep would leave a big library stuck on "keep
    // shuffling" for hours, and the last third of a shuffle pass is its least
    // valuable part.
    const under = rankingState([...many(59, 4, "soft"), ...many(41, 4)], noLog);
    expect(under.stage).toBe("loosening");
    const over = rankingState([...many(70, 4, "soft"), ...many(30, 4)], noLog);
    expect(over.stage).toBe("cutting");
  });
});

describe("busiestTier", () => {
  it("picks the tier with the most unsettled films", () => {
    const films = [...many(4, 5), ...many(12, 3), ...many(7, 4)];
    expect(busiestTier(films)).toBe(3);
  });

  it("ignores films already settled by hand", () => {
    // A tier locked by hand is finished whatever the model thinks.
    const films = [...many(20, 3, "hard"), ...many(6, 4, "soft")];
    expect(busiestTier(films)).toBe(4);
  });

  it("breaks a tie toward the better rating", () => {
    const films = [...many(5, 2), ...many(5, 5)];
    expect(busiestTier(films)).toBe(5);
  });

  it("declines a tier too small to cut", () => {
    expect(busiestTier(many(2, 4))).toBeUndefined();
    expect(busiestTier([])).toBeUndefined();
  });

  it("sends a scattered library to a climb rather than a cut", () => {
    // Mostly placed and mostly provisional, but spread one or two per tier — a
    // cut needs a pile and there is none, so the climb takes it.
    const films = [
      ...many(2, 5, "soft"),
      ...many(2, 4, "soft"),
      ...many(2, 3, "soft"),
      ...many(2, 2, "soft"),
    ];
    const s = rankingState(films, noLog);
    expect(s.stage).toBe("refining");
    expect(s.next).toBe("koth");
  });
});

describe("what it says", () => {
  it("counts decisions rather than reporting a percentage", () => {
    // "68% ranked" is a score and invites nothing. "23 still to place" is a
    // number of decisions, which is the unit the reader works in.
    const s = rankingState([...many(10, 4, "soft"), ...many(23, 4)], noLog);
    expect(stateDetail(s, "film", "films")).toBe("23 films still to place");
  });

  it("uses the singular for one", () => {
    // Deliberately a refining library rather than a loosening one: "1 still to
    // place" cannot occur while loosening, because one film short of a full
    // sweep is long past the two-thirds line.
    const s = rankingState([...many(20, 4, "hard"), ...many(1, 4, "soft")], noLog);
    expect(s.stage).toBe("refining");
    expect(stateDetail(s, "film", "films")).toBe("1 film left to settle");
  });

  it("names the tool it is about to open", () => {
    const s = rankingState(many(40, 4), noLog);
    expect(stateWhy(s, "film")).toContain("Fast Shuffle");
  });

  it("says what a finished ranking means rather than congratulating", () => {
    const s = rankingState(many(20, 4, "hard"), noLog);
    expect(stateWhy(s, "film")).toContain("Nothing left to decide");
  });

  it("never returns an empty line for a library with films in it", () => {
    const shapes: Film[][] = [
      many(40, 4),
      [...many(10, 4, "soft"), ...many(30, 4)],
      [...many(30, 4, "soft"), ...many(10, 4)],
      [...many(25, 4, "hard"), ...many(15, 4, "soft")],
      many(20, 4, "hard"),
    ];
    for (const films of shapes) {
      const s = rankingState(films, noLog);
      expect(stateDetail(s, "film", "films").length).toBeGreaterThan(0);
      expect(stateAction(s).length).toBeGreaterThan(0);
    }
  });
});

describe("the log is only used for coverage", () => {
  it("reports a stage before the log has loaded", () => {
    // The log arrives asynchronously. Rendering "untouched" for one frame is the
    // right answer; throwing is not.
    const films = many(40, 4);
    expect(() => rankingState(films, [])).not.toThrow();
    expect(rankingState(films, []).stage).toBe("untouched");
  });
});
