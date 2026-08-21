import { describe, expect, it } from "vitest";

import { PRIOR_SPREAD, type Belief } from "@/lib/bayes";
import {
  PLACE_CONFIDENCE,
  PLACE_DUELS,
  SETTLE_AT,
  SETTLE_FROM,
  countDuel,
  placeSettled,
  respreadFor,
  respreadTier,
  settledness,
  withdrawSoftLocks,
} from "@/lib/shuffle";
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

// ── The readout Fast Shuffle puts on screen ────────────────────────────────
//
// The bar and the countdown used to be driven by `sessionProgress`: how many
// films in scope appear anywhere in the duel log. That is a saturating measure.
// It reaches its maximum after ONE duel per film — the exact point at which the
// model has worked out nothing at all — and then reads finished for the rest of
// the mode's life. Reported from a phone as "0 films to go every time I come
// back", which was not a reset and was not a bug in the counter: the counter
// was faithfully reporting a number that had stopped meaning anything.
//
// They are driven by placement now. These tests pin the property that made the
// old measure useless, so the readout cannot quietly go back to saturating.
describe("what the Fast Shuffle readout measures", () => {
  it("does not count a film as worked out just because it has been duelled", () => {
    // One duel's worth of evidence: a belief barely tighter than the prior.
    const barelyTouched = beliefs({ a: { spread: PRIOR_SPREAD * 0.95 } });
    const out = placeSettled([film("a")], barelyTouched);
    expect(out[0].lock).toBeUndefined();
  });

  it("climbs as the evidence tightens rather than topping out at first contact", () => {
    const worked = [0.95, 0.6, 0.3, 0.1].map(
      (factor) => placeSettled([film("a")], beliefs({ a: { spread: PRIOR_SPREAD * factor } }))[0].lock,
    );
    // Unsettled at the wide end, settled at the tight end, and the transition
    // happens somewhere in between rather than immediately.
    expect(worked[0]).toBeUndefined();
    expect(worked[worked.length - 1]).toBe("soft");
  });

  it("demands real evidence: the threshold sits well above trivially touched", () => {
    // Settled at 0.55 on 21 Aug: 0.5 placed too readily, 0.65 was tried and
    // felt like a different game. The BAND is what is worth guarding, not the
    // exact value — where to sit inside it is a feel question, and the next
    // person to tune it should be free to without a test arguing back.
    expect(PLACE_CONFIDENCE).toBeGreaterThan(0.5);
    // The ceiling matters more, and is a real cliff: confidence saturates well
    // below 1, so a threshold set too high places nothing ever, which looks
    // broken rather than strict. Measured maxima were 0.798 (120 films) and
    // 0.845 (400), and 0.7 already fails to fill a small tier.
    expect(PLACE_CONFIDENCE).toBeLessThanOrEqual(0.65);
  });
});

// ── The two stages ─────────────────────────────────────────────────────────
//
// Provisional is gated on a COUNT and settled on CONFIDENCE, because they
// answer different questions: "have we asked enough to have an opinion" and
// "has the evidence actually located it". Gating the first on confidence meant
// a session where nothing visibly happened for hundreds of duels.
describe("PLACE_DUELS: a provisional number arrives on evidence you can count", () => {
  const nothingKnown = beliefs({ a: { spread: PRIOR_SPREAD } });

  it("places a film once it has had enough duels, whatever the model thinks", () => {
    const f = { ...film("a"), duels: PLACE_DUELS };
    expect(placeSettled([f], nothingKnown)[0].lock).toBe("soft");
  });

  it("does not place it one duel short", () => {
    const f = { ...film("a"), duels: PLACE_DUELS - 1 };
    expect(placeSettled([f], nothingKnown)[0].lock).toBeUndefined();
  });

  it("still places a well-located film that has had fewer duels", () => {
    // The confidence route survives: a film compared only a few times but
    // against well-known neighbours is genuinely located.
    const f = { ...film("a"), duels: 1 };
    expect(placeSettled([f], beliefs({ a: { spread: 0.1 } }))[0].lock).toBe("soft");
  });

  it("never takes back a hard lock", () => {
    const f = { ...film("a", 4, 7500, "hard"), duels: 99 };
    expect(placeSettled([f], nothingKnown)[0].lock).toBe("hard");
  });
});

describe("settledness: a scale that actually reaches 1", () => {
  it("is 0 when a film has only just earned its number", () => {
    expect(settledness(SETTLE_FROM)).toBe(0);
  });

  it("is exactly 1 at the measured ceiling", () => {
    expect(settledness(SETTLE_AT)).toBe(1);
  });

  it("never exceeds 1, however settled the film gets", () => {
    // Raw confidence can creep past the ceiling; the readout must not.
    expect(settledness(0.95)).toBe(1);
    expect(settledness(1)).toBe(1);
  });

  it("never goes negative for a film below the provisional bar", () => {
    expect(settledness(0)).toBe(0);
    expect(settledness(SETTLE_FROM - 0.2)).toBe(0);
  });

  it("climbs in between rather than jumping", () => {
    const mid = (SETTLE_FROM + SETTLE_AT) / 2;
    expect(settledness(mid)).toBeGreaterThan(0);
    expect(settledness(mid)).toBeLessThan(1);
  });

  it("keeps the ceiling reachable — it must sit under what a film can measure", () => {
    // Measured maxima with the anchor held: 0.831 (86 films) and 0.838 (400).
    // A ceiling above those would be a goal nobody could ever reach.
    expect(SETTLE_AT).toBeLessThan(0.83);
    expect(SETTLE_AT).toBeGreaterThan(SETTLE_FROM);
  });
});

describe("countDuel", () => {
  it("counts both films in the pair and nothing else", () => {
    const a = film("a");
    const b = film("b");
    const c = film("c");
    const out = countDuel([a, b, c], [a, b]);
    expect(out.find((f) => f.id === "a")!.duels).toBe(1);
    expect(out.find((f) => f.id === "b")!.duels).toBe(1);
    expect(out.find((f) => f.id === "c")!.duels).toBeUndefined();
  });

  it("adds to a count that is already there", () => {
    const a = { ...film("a"), duels: 4 };
    const b = film("b");
    expect(countDuel([a, b], [a, b]).find((f) => f.id === "a")!.duels).toBe(5);
  });
});
