// Correcting a rating the evidence says was wrong.
//
// This rewrites something the USER said — a star rating they gave, or that came
// in from an import years ago. So the tests here are mostly about what it
// REFUSES to do. A re-rating that fires too easily is worse than one that never
// fires: the second is a missing feature, the first quietly rewrites opinions.

import { describe, expect, it } from "vitest";
import { PLACE_CONFIDENCE, PLACE_DUELS, ratingFromBelief, reRate } from "@/lib/shuffle";
import { confidenceFromSpread } from "@/lib/bayes";
import type { Belief } from "@/lib/bayes";
import type { Film } from "@/lib/types";
import type { Rating } from "@/lib/tiers";
import { seedScore, tierMax, tierMin } from "@/lib/tiers";

const film = (id: string, rating: Rating, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  rating,
  score: seedScore(rating),
  lock: "soft",
  duels: PLACE_DUELS,
  ...over,
});

/** A spread tight enough to clear the confidence gate, found rather than guessed. */
const SURE = (() => {
  for (let s = 2; s > 0.01; s -= 0.01) if (confidenceFromSpread(s) >= PLACE_CONFIDENCE) return s;
  throw new Error("no spread clears PLACE_CONFIDENCE");
})();
const UNSURE = 3;

const beliefs = (of: Record<string, [number, number]>): Map<string, Belief> =>
  new Map(Object.entries(of).map(([id, [mean, spread]]) => [id, { mean, spread }]));

describe("ratingFromBelief", () => {
  it("inverts the seed, which is rating * 2", () => {
    // No threshold of its own. `tiers.ts` owns where a tier begins, and a
    // constant invented here would be a second opinion about that.
    expect(ratingFromBelief(8)).toBe(4);
    expect(ratingFromBelief(7)).toBe(3.5);
    expect(ratingFromBelief(10)).toBe(5);
  });

  it("rounds to the nearest half star", () => {
    expect(ratingFromBelief(7.9)).toBe(4);
    expect(ratingFromBelief(7.4)).toBe(3.5);
  });

  it("clamps to a rating somebody could actually give", () => {
    // A run of losses pushes a mean below 1.0, and there is no 0★.
    expect(ratingFromBelief(-4)).toBe(0.5);
    expect(ratingFromBelief(99)).toBe(5);
  });
});

describe("reRate", () => {
  it("promotes a film the evidence rates far above its stars", () => {
    const films = [film("underrated", 3)];
    const { films: out, changed } = reRate(films, beliefs({ underrated: [8, SURE] }));
    expect(out[0].rating).toBe(4);
    expect(changed).toEqual([{ id: "underrated", from: 3, to: 4 }]);
  });

  it("demotes as well as promotes", () => {
    // The existing promotion machinery in ladder.ts only goes up. A rating that
    // was too GENEROUS is exactly as wrong as one that was too harsh.
    const { films: out } = reRate([film("overrated", 5)], beliefs({ overrated: [6, SURE] }));
    expect(out[0].rating).toBe(3);
  });

  it("leaves a film whose stars already match the evidence", () => {
    const { changed } = reRate([film("right", 4)], beliefs({ right: [8, SURE] }));
    expect(changed).toEqual([]);
  });

  // ── What it must refuse ─────────────────────────────────────────────────

  it("never touches a hard lock", () => {
    // A position the user committed to by hand. Re-rating moves the film out of
    // the tier they put it in: the model may revise its own opinions, never
    // theirs.
    const { films: out, changed } = reRate(
      [film("mine", 3, { lock: "hard" })],
      beliefs({ mine: [10, SURE] }),
    );
    expect(out[0].rating).toBe(3);
    expect(changed).toEqual([]);
  });

  it("refuses a film with too few duels, however confident", () => {
    // Both gates are required TOGETHER here, unlike `placeSettled` where either
    // is enough. Giving a film a number on thin evidence is recoverable;
    // rewriting the user's rating on thin evidence is not.
    const { changed } = reRate(
      [film("thin", 3, { duels: PLACE_DUELS - 1 })],
      beliefs({ thin: [10, SURE] }),
    );
    expect(changed).toEqual([]);
  });

  it("refuses a film the model is not sure about, however many duels", () => {
    const { changed } = reRate([film("noisy", 3)], beliefs({ noisy: [10, UNSURE] }));
    expect(changed).toEqual([]);
  });

  it("refuses a film with no belief at all", () => {
    expect(reRate([film("unknown", 3)], beliefs({})).changed).toEqual([]);
  });

  it("never touches a guest", () => {
    // Borrowed for one run and never in the library, so there is no rating of
    // the user's to correct.
    const { changed } = reRate(
      [film("borrowed", 3, { guest: true })],
      beliefs({ borrowed: [10, SURE] }),
    );
    expect(changed).toEqual([]);
  });

  // ── The invariant everything downstream depends on ──────────────────────

  it("leaves every score inside its own tier's band", () => {
    // `list.ts`: "tier bands never overlap, so a plain score sort is already
    // tier-correct". The tier counts, the profile and the share cards all
    // inherit that. A re-rating that left a score behind would break all of it.
    const films = [film("a", 3), film("b", 4), film("c", 5)];
    const { films: out } = reRate(
      films,
      beliefs({ a: [10, SURE], b: [8, SURE], c: [4, SURE] }),
    );
    for (const f of out) {
      expect(f.score).toBeGreaterThanOrEqual(tierMin(f.rating));
      expect(f.score).toBeLessThanOrEqual(tierMax(f.rating));
    }
  });

  it("re-spreads the tier a film LEFT, not just the one it joined", () => {
    // The old tier now has a gap in its spacing. Left alone it keeps a score
    // nothing occupies, which is invisible until two films collide on it.
    const films = [film("goes", 3), film("stays", 3), film("also", 3)];
    const { films: out } = reRate(films, beliefs({ goes: [10, SURE], stays: [6, SURE], also: [6, SURE] }));
    const left = out.filter((f) => f.rating === 3);
    expect(new Set(left.map((f) => f.score)).size).toBe(left.length);
  });

  it("returns the library untouched when nothing qualifies", () => {
    const films = [film("a", 4, { duels: 0 })];
    const { films: out, changed } = reRate(films, beliefs({ a: [10, SURE] }));
    expect(changed).toEqual([]);
    expect(out).toEqual(films);
  });
});
