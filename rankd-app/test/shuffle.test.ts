import { describe, expect, it } from "vitest";

import { PRIOR_SPREAD, type Belief } from "@/lib/bayes";
import { placeSettled, respreadFor, respreadTier, withdrawSoftLocks, PLACE_CONFIDENCE } from "@/lib/shuffle";
import { ORDERED_TIERS, tierMax, tierMin, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, rating: Rating = 4, score = rating * 1000, lock?: "soft" | "hard"): Film => ({
  id,
  title: id,
  rating,
  score,
  lock,
});

const beliefs = (entries: Record<string, Partial<Belief>>): Map<string, Belief> =>
  new Map(
    Object.entries(entries).map(([id, b]) => [
      id,
      { mean: b.mean ?? 8, spread: b.spread ?? PRIOR_SPREAD },
    ]),
  );

const orderOf = (films: Film[], tier: Rating) =>
  films
    .filter((f) => f.rating === tier)
    .sort((a, b) => b.score - a.score)
    .map((f) => f.id);

describe("respreadTier", () => {
  it("orders a tier by what the evidence believes", () => {
    const library = [film("low"), film("high"), film("mid")];
    const out = respreadTier(library, 4, beliefs({ low: { mean: 5 }, mid: { mean: 8 }, high: { mean: 11 } }), true);
    expect(orderOf(out, 4)).toEqual(["high", "mid", "low"]);
  });

  it("never writes a score outside the film's own band", () => {
    // Beliefs deliberately far outside anything sane, in both directions.
    const library = [film("a", 4), film("b", 4), film("c", 4)];
    const wild = beliefs({ a: { mean: 10_000 }, b: { mean: -10_000 }, c: { mean: 0 } });
    const out = respreadTier(library, 4, wild, true);
    for (const f of out) {
      expect(f.score).toBeGreaterThanOrEqual(tierMin(4));
      expect(f.score).toBeLessThanOrEqual(tierMax(4));
    }
  });

  it("holds every band for every tier, so no film can cross a star boundary", () => {
    const library = ORDERED_TIERS.flatMap((t) => [film(`${t}-a`, t), film(`${t}-b`, t)]);
    const wild = new Map(library.map((f, i) => [f.id, { mean: (i % 2 ? 1 : -1) * 9999, spread: 1 }]));
    let out = [...library];
    for (const t of ORDERED_TIERS) out = respreadTier(out, t, wild, true);
    for (const f of out) {
      expect(f.score).toBeGreaterThanOrEqual(tierMin(f.rating));
      expect(f.score).toBeLessThanOrEqual(tierMax(f.rating));
    }
  });

  it("leaves other tiers completely alone", () => {
    const library = [film("four", 4, 7500), film("three", 3, 5500)];
    const out = respreadTier(library, 4, beliefs({ four: {}, three: {} }), true);
    expect(out.find((f) => f.id === "three")!.score).toBe(5500);
  });

  it("centres a lone film in its band rather than pinning it to an edge", () => {
    const out = respreadTier([film("only")], 4, beliefs({ only: {} }), true);
    expect(out[0].score).toBe(Math.round((tierMin(4) + tierMax(4)) / 2));
  });

  it("is stable for equal beliefs, so repeated runs don't shuffle ties around", () => {
    const library = [film("b"), film("a"), film("c")];
    const flat = beliefs({ a: { mean: 8 }, b: { mean: 8 }, c: { mean: 8 } });
    const once = respreadTier(library, 4, flat, true);
    const twice = respreadTier(once, 4, flat, true);
    expect(orderOf(once, 4)).toEqual(orderOf(twice, 4));
  });

  describe("when the run has NOT opted into moving placed films", () => {
    it("keeps HARD-locked films in their existing order, whatever the model thinks", () => {
      const library = [
        film("first", 4, 7900, "hard"),
        film("second", 4, 7800, "hard"),
        film("third", 4, 7700, "hard"),
      ];
      // The model disagrees with all of it.
      const contrary = beliefs({ first: { mean: 1 }, second: { mean: 5 }, third: { mean: 12 } });
      const out = respreadTier(library, 4, contrary, false);
      expect(orderOf(out, 4)).toEqual(["first", "second", "third"]);
    });

    it("still merges unplaced films in around them by belief", () => {
      const library = [
        film("placed-top", 4, 7900, "hard"),
        film("placed-bottom", 4, 7100, "hard"),
        film("newcomer", 4, 7500),
      ];
      const b = beliefs({
        "placed-top": { mean: 9 },
        "placed-bottom": { mean: 5 },
        newcomer: { mean: 7 },
      });
      const out = respreadTier(library, 4, b, false);
      expect(orderOf(out, 4)).toEqual(["placed-top", "newcomer", "placed-bottom"]);
    });

    it("puts a newcomer the evidence rates highest above every placed film", () => {
      const library = [film("placed", 4, 7900, "hard"), film("newcomer", 4, 7100)];
      const b = beliefs({ placed: { mean: 8 }, newcomer: { mean: 20 } });
      const out = respreadTier(library, 4, b, false);
      expect(orderOf(out, 4)).toEqual(["newcomer", "placed"]);
    });

    it("reorders hard-locked films once the run DOES opt in", () => {
      const library = [film("first", 4, 7900, "hard"), film("second", 4, 7800, "hard")];
      const contrary = beliefs({ first: { mean: 1 }, second: { mean: 12 } });
      expect(orderOf(respreadTier(library, 4, contrary, false), 4)).toEqual(["first", "second"]);
      expect(orderOf(respreadTier(library, 4, contrary, true), 4)).toEqual(["second", "first"]);
    });

    // THE Phase 2 bug. A soft lock is the model's own earlier guess; pinning it
    // meant the model's weakest estimate outlived every better one it formed.
    it("still moves SOFT-locked films — the model may always improve on itself", () => {
      const library = [film("was-top", 4, 7900, "soft"), film("was-bottom", 4, 7100, "soft")];
      const contrary = beliefs({ "was-top": { mean: 2 }, "was-bottom": { mean: 12 } });
      const out = respreadTier(library, 4, contrary, false);
      expect(orderOf(out, 4)).toEqual(["was-bottom", "was-top"]);
    });

    it("moves soft locks around hard ones in the same tier", () => {
      const library = [
        film("committed-top", 4, 7900, "hard"),
        film("committed-bottom", 4, 7100, "hard"),
        film("model-guess", 4, 7500, "soft"),
      ];
      // The model now thinks its own guess belongs above everything.
      const b = beliefs({
        "committed-top": { mean: 9 },
        "committed-bottom": { mean: 5 },
        "model-guess": { mean: 20 },
      });
      const out = respreadTier(library, 4, b, false);
      expect(orderOf(out, 4)).toEqual(["model-guess", "committed-top", "committed-bottom"]);
    });
  });
});

describe("respreadFor", () => {
  it("rewrites only the bands the duelled films belong to", () => {
    const library = [film("a", 4, 7500), film("b", 4, 7400), film("untouched", 2, 3500)];
    const b = beliefs({ a: { mean: 5 }, b: { mean: 9 }, untouched: { mean: 99 } });
    const out = respreadFor(library, [library[0]], b, true);
    expect(out.find((f) => f.id === "untouched")!.score).toBe(3500);
    expect(orderOf(out, 4)).toEqual(["b", "a"]);
  });

  it("handles a cross-tier duel by rewriting both bands", () => {
    const library = [film("four", 4, 7500), film("other-four", 4, 7400), film("two", 2, 3500), film("other-two", 2, 3400)];
    const b = beliefs({
      four: { mean: 5 },
      "other-four": { mean: 9 },
      two: { mean: 1 },
      "other-two": { mean: 4 },
    });
    const out = respreadFor(library, [library[0], library[2]], b, true);
    expect(orderOf(out, 4)).toEqual(["other-four", "four"]);
    expect(orderOf(out, 2)).toEqual(["other-two", "two"]);
    // And still no boundary crossing.
    for (const f of out) {
      expect(f.score).toBeGreaterThanOrEqual(tierMin(f.rating));
      expect(f.score).toBeLessThanOrEqual(tierMax(f.rating));
    }
  });
});

describe("placeSettled", () => {
  it("grants a SOFT lock once the evidence has settled a film", () => {
    const out = placeSettled([film("a")], beliefs({ a: { spread: 0.1 } }));
    expect(out[0].lock).toBe("soft");
  });

  it("leaves a barely-duelled film unplaced — a number has to mean something", () => {
    const out = placeSettled([film("a")], beliefs({ a: { spread: PRIOR_SPREAD * 0.99 } }));
    expect(out[0].lock).toBeUndefined();
  });

  it("leaves a film the model has never seen alone", () => {
    const out = placeSettled([film("a")], new Map());
    expect(out[0].lock).toBeUndefined();
  });

  // The model does not get to restate, downgrade or take back a user's decision.
  it("never touches a hard lock", () => {
    const out = placeSettled([film("a", 4, 7500, "hard")], beliefs({ a: { spread: PRIOR_SPREAD } }));
    expect(out[0].lock).toBe("hard");
  });

  it("does not re-stamp a film that is already soft-locked", () => {
    const already = film("a", 4, 7500, "soft");
    const out = placeSettled([already], beliefs({ a: { spread: 0.1 } }));
    expect(out[0]).toBe(already); // same object — untouched
  });

  it("honours the threshold it is given", () => {
    const mid = beliefs({ a: { spread: PRIOR_SPREAD * 0.5 } }); // confidence 0.5
    expect(placeSettled([film("a")], mid, 0.9)[0].lock).toBeUndefined();
    expect(placeSettled([film("a")], mid, 0.1)[0].lock).toBe("soft");
  });

  it("uses PLACE_CONFIDENCE by default", () => {
    const justOver = beliefs({ a: { spread: PRIOR_SPREAD * (1 - PLACE_CONFIDENCE) * 0.99 } });
    expect(placeSettled([film("a")], justOver)[0].lock).toBe("soft");
  });
});

// What the advisory-only setting does: the model's authority is withdrawn, the
// user's decisions are not. Only possible because the two are distinguishable.
describe("withdrawSoftLocks", () => {
  it("removes the model's placements", () => {
    const out = withdrawSoftLocks([film("a", 4, 7500, "soft")]);
    expect(out[0].lock).toBeUndefined();
  });

  it("leaves the user's alone", () => {
    const out = withdrawSoftLocks([film("a", 4, 7500, "hard")]);
    expect(out[0].lock).toBe("hard");
  });

  it("leaves unplaced films alone", () => {
    const unplaced = film("a");
    expect(withdrawSoftLocks([unplaced])[0]).toBe(unplaced);
  });

  it("keeps scores — only the claim to a position is withdrawn", () => {
    const out = withdrawSoftLocks([film("a", 4, 7654, "soft")]);
    expect(out[0].score).toBe(7654);
  });
});
