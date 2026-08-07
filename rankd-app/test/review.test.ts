import { describe, expect, it } from "vitest";

import { PRIOR_SPREAD, type Belief } from "@/lib/bayes";
import { REVIEW_CONFIDENCE_FLOOR, suggestions } from "@/lib/review";
import type { Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

// Placed by default: the card only ever argues about films that HAVE a position,
// so an unplaced fixture would be testing a case the function deliberately skips.
const film = (id: string, rating: Rating, score: number, lock: "soft" | "hard" = "hard"): Film => ({
  id,
  title: id,
  rating,
  score,
  lock,
});

// Settled enough to be worth listening to, unless told otherwise.
const settled = { spread: PRIOR_SPREAD * (1 - REVIEW_CONFIDENCE_FLOOR) * 0.8 };

const beliefs = (entries: Record<string, Partial<Belief>>): Map<string, Belief> =>
  new Map(
    Object.entries(entries).map(([id, b]) => [
      id,
      { mean: b.mean ?? 8, spread: b.spread ?? settled.spread },
    ]),
  );

// A tier where the list order and the evidence agree completely.
const agreeing = () => {
  const films = Array.from({ length: 12 }, (_, i) => film(`f${i}`, 4, 7900 - i * 50));
  const b = beliefs(Object.fromEntries(films.map((f, i) => [f.id, { mean: 9 - i * 0.1 }])));
  return { films, b };
};

describe("suggestions", () => {
  it("says nothing when the list and the evidence agree", () => {
    const { films, b } = agreeing();
    expect(suggestions(films, b)).toEqual([]);
  });

  it("says nothing at all before the model has run", () => {
    const { films } = agreeing();
    expect(suggestions(films, new Map())).toEqual([]);
  });

  it("nominates a film the evidence would move a long way up", () => {
    const { films, b } = agreeing();
    // Bottom of the list, but the evidence has it beating everything.
    b.set("f11", { mean: 99, spread: settled.spread });
    const out = suggestions(films, b);
    expect(out.map((s) => s.film.id)).toContain("f11");
    expect(out.find((s) => s.film.id === "f11")!.drift).toBeGreaterThan(0);
  });

  it("nominates a film the evidence would move a long way down", () => {
    const { films, b } = agreeing();
    b.set("f0", { mean: -99, spread: settled.spread });
    const out = suggestions(films, b);
    expect(out.find((s) => s.film.id === "f0")!.drift).toBeLessThan(0);
  });

  it("ignores a small disagreement — a couple of places is not worth a prompt", () => {
    const films = Array.from({ length: 12 }, (_, i) => film(`f${i}`, 4, 7900 - i * 50));
    const b = beliefs(Object.fromEntries(films.map((f, i) => [f.id, { mean: 9 - i * 0.1 }])));
    // Swap two neighbours: a drift of one place.
    b.set("f4", { mean: 9 - 5 * 0.1, spread: settled.spread });
    b.set("f5", { mean: 9 - 4 * 0.1, spread: settled.spread });
    expect(suggestions(films, b)).toEqual([]);
  });

  // The floor exists so one surprising duel never starts a conversation.
  it("stays quiet about a film it barely knows, however wrong it looks", () => {
    const { films, b } = agreeing();
    b.set("f11", { mean: 99, spread: PRIOR_SPREAD * 0.99 });
    expect(suggestions(films, b).map((s) => s.film.id)).not.toContain("f11");
  });

  it("respects a dismissal", () => {
    const { films, b } = agreeing();
    b.set("f11", { mean: 99, spread: settled.spread });
    expect(suggestions(films, b, new Set(["f11"]))).toEqual([]);
  });

  // "Heat keeps beating films ranked above it" says nothing about a film that
  // isn't ranked. Those belong to Fast Shuffle, not to an argument.
  it("says nothing about a film with no position at all", () => {
    const films = Array.from({ length: 12 }, (_, i) => film(`f${i}`, 4, 7900 - i * 50));
    const b = beliefs(Object.fromEntries(films.map((f, i) => [f.id, { mean: 9 - i * 0.1 }])));
    const unplaced = [...films.slice(0, 11), film("f11", 4, 7350, "soft")];
    // Strip the lock entirely from the outlier.
    const stripped = unplaced.map((f) => (f.id === "f11" ? { ...f, lock: undefined } : f));
    b.set("f11", { mean: 99, spread: settled.spread });
    expect(suggestions(stripped, b).map((s) => s.film.id)).not.toContain("f11");
  });

  // A disagreement with what the USER decided is the interesting one. A
  // disagreement with the model's own soft placement is the model revising
  // itself, which it does silently anyway.
  it("raises a hard-locked disagreement before a soft-locked one", () => {
    const films = Array.from({ length: 20 }, (_, i) =>
      film(`f${i}`, 4, 7900 - i * 20, i === 19 ? "soft" : "hard"),
    );
    const b = beliefs(Object.fromEntries(films.map((f, i) => [f.id, { mean: 9 - i * 0.1 }])));
    b.set("f19", { mean: 8.95, spread: settled.spread }); // soft, moves ~18 places
    b.set("f10", { mean: 8.65, spread: settled.spread }); // hard, moves ~6 places
    const out = suggestions(films, b);
    // The soft film drifted further, but the hard one is the one worth asking about.
    expect(out[0].film.id).toBe("f10");
  });

  describe("underrated films — the only way a tier boundary is ever questioned", () => {
    const crossTier = () => {
      const films = [
        film("weakest-above", 4.5, 8100),
        film("strong-above", 4.5, 8900),
        film("normal", 4, 7500),
        film("underrated", 4, 7100),
      ];
      const b = beliefs({
        "weakest-above": { mean: 9 },
        "strong-above": { mean: 12 },
        normal: { mean: 8 },
        underrated: { mean: 11 },
      });
      return { films, b };
    };

    it("spots a film beating the weakest of the tier above", () => {
      const { films, b } = crossTier();
      const out = suggestions(films, b);
      const hit = out.find((s) => s.film.id === "underrated");
      expect(hit?.kind).toBe("underrated");
      expect(hit?.promoteTo).toBe(4.5);
    });

    it("reports how many of the tier above it is beating, so the loudest sorts first", () => {
      const { films, b } = crossTier();
      // Beats the weaker of the two above, not the strong one.
      expect(suggestions(films, b).find((s) => s.film.id === "underrated")!.drift).toBe(1);
      // Now it beats both.
      b.set("underrated", { mean: 20, spread: settled.spread });
      expect(suggestions(films, b).find((s) => s.film.id === "underrated")!.drift).toBe(2);
    });

    it("puts the film beating more of the tier above first", () => {
      const films = [
        film("above-a", 4.5, 8100),
        film("above-b", 4.5, 8900),
        film("beats-one", 4, 7500),
        film("beats-both", 4, 7400),
      ];
      const b = beliefs({
        "above-a": { mean: 9 },
        "above-b": { mean: 12 },
        "beats-one": { mean: 10 },
        "beats-both": { mean: 20 },
      });
      const out = suggestions(films, b).filter((s) => s.kind === "underrated");
      expect(out[0].film.id).toBe("beats-both");
    });

    it("leaves a film that merely leads its own tier alone", () => {
      const { films, b } = crossTier();
      b.set("underrated", { mean: 8.5, spread: settled.spread });
      expect(suggestions(films, b).find((s) => s.film.id === "underrated")).toBeUndefined();
    });

    it("has nothing to suggest at the top tier — there is nowhere above it", () => {
      const films = [film("a", 5, 9900), film("b", 5, 9100)];
      const b = beliefs({ a: { mean: 8 }, b: { mean: 99 } });
      expect(suggestions(films, b).every((s) => s.kind !== "underrated")).toBe(true);
    });

    it("raises the tier question rather than the position one", () => {
      const { films, b } = crossTier();
      const hits = suggestions(films, b).filter((s) => s.film.id === "underrated");
      expect(hits).toHaveLength(1);
      expect(hits[0].kind).toBe("underrated");
    });

    it("puts the tier argument ahead of any positional one", () => {
      const { films, b } = crossTier();
      // Give a same-tier film a big drift too.
      const more = [...films, ...Array.from({ length: 10 }, (_, i) => film(`pad${i}`, 4, 7400 - i * 10))];
      for (let i = 0; i < 10; i++) b.set(`pad${i}`, { mean: 7 - i * 0.1, spread: settled.spread });
      b.set("pad9", { mean: 8.9, spread: settled.spread });
      const out = suggestions(more, b);
      expect(out[0].kind).toBe("underrated");
    });
  });

  it("orders positional suggestions by how wrong they are", () => {
    const films = Array.from({ length: 20 }, (_, i) => film(`f${i}`, 4, 7900 - i * 20));
    const b = beliefs(Object.fromEntries(films.map((f, i) => [f.id, { mean: 9 - i * 0.1 }])));
    // Means run 9.0 down to 7.1 in steps of 0.1, so a film's target slot is
    // wherever its new mean lands in that ladder.
    b.set("f19", { mean: 8.95, spread: settled.spread }); // slot 1 ← from 19
    b.set("f10", { mean: 8.65, spread: settled.spread }); // slot ~4 ← from 10
    const out = suggestions(films, b);
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(Math.abs(out[0].drift)).toBeGreaterThanOrEqual(Math.abs(out[1].drift));
    expect(out[0].film.id).toBe("f19");
  });
});
