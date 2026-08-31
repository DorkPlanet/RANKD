// Correcting a rating the evidence says was wrong.
//
// This rewrites something the USER said — a star rating they gave, or that came
// in from an import years ago. So the tests here are mostly about what it
// REFUSES to do. A re-rating that fires too easily is worse than one that never
// fires: the second is a missing feature, the first quietly rewrites opinions.

import { describe, expect, it } from "vitest";
import { PLACE_CONFIDENCE, PLACE_DUELS, RERATE_MARGIN, ratingFromBelief, reRate } from "@/lib/shuffle";
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

/**
 * Ask about every film, and let placements move.
 *
 * `reRate` now takes the candidates explicitly — the pair just duelled — and the
 * run's `movePlaced`. The tests below are about what it DECIDES, so they hand it
 * the whole fixture as candidates; the tests that are about the scoping itself
 * call `reRate` directly.
 */
const rate = (films: Film[], b: Map<string, Belief>, movePlaced = true) =>
  reRate(films, films, b, movePlaced);

describe("reRate", () => {
  it("promotes a film the evidence rates far above its stars", () => {
    const films = [film("underrated", 3)];
    const { films: out, changed } = rate(films, beliefs({ underrated: [8, SURE] }));
    expect(out[0].rating).toBe(4);
    expect(changed).toEqual([{ id: "underrated", from: 3, to: 4 }]);
  });

  it("demotes as well as promotes", () => {
    // The existing promotion machinery in ladder.ts only goes up. A rating that
    // was too GENEROUS is exactly as wrong as one that was too harsh.
    const { films: out } = rate([film("overrated", 5)], beliefs({ overrated: [6, SURE] }));
    expect(out[0].rating).toBe(3);
  });

  it("leaves a film whose stars already match the evidence", () => {
    const { changed } = rate([film("right", 4)], beliefs({ right: [8, SURE] }));
    expect(changed).toEqual([]);
  });

  // ── What it must refuse ─────────────────────────────────────────────────

  it("never touches a hard lock", () => {
    // A position the user committed to by hand. Re-rating moves the film out of
    // the tier they put it in: the model may revise its own opinions, never
    // theirs.
    const { films: out, changed } = rate(
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
    const { changed } = rate(
      [film("thin", 3, { duels: PLACE_DUELS - 1 })],
      beliefs({ thin: [10, SURE] }),
    );
    expect(changed).toEqual([]);
  });

  it("refuses a film the model is not sure about, however many duels", () => {
    const { changed } = rate([film("noisy", 3)], beliefs({ noisy: [10, UNSURE] }));
    expect(changed).toEqual([]);
  });

  it("refuses a film with no belief at all", () => {
    expect(rate([film("unknown", 3)], beliefs({})).changed).toEqual([]);
  });

  it("never touches a guest", () => {
    // Borrowed for one run and never in the library, so there is no rating of
    // the user's to correct.
    const { changed } = rate(
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
    const { films: out } = rate(
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
    const { films: out } = rate(films, beliefs({ goes: [10, SURE], stays: [6, SURE], also: [6, SURE] }));
    const left = out.filter((f) => f.rating === 3);
    expect(new Set(left.map((f) => f.score)).size).toBe(left.length);
  });

  it("returns the library untouched when nothing qualifies", () => {
    const films = [film("a", 4, { duels: 0 })];
    const { films: out, changed } = rate(films, beliefs({ a: [10, SURE] }));
    expect(changed).toEqual([]);
    expect(out).toEqual(films);
  });
});

// ── Scale: how many films one answer is allowed to move ────────────────────
//
// Every fixture above is one to three films, which is exactly why the reported
// bug was invisible here: `reRate` swept whatever array it was handed and the
// shuffle handed it the whole library, so one tap re-rated every eligible film
// at once and a 4.5★ tier emptied out in a session. These are the tests that
// would have caught it.
describe("reRate scoping", () => {
  /** Twenty 4.5★ films the evidence would demote, if it were asked about them. */
  const tier = () =>
    Array.from({ length: 20 }, (_, i) => film(`f${String(i).padStart(2, "0")}`, 4.5));
  const allDemoted = (films: Film[]) =>
    beliefs(Object.fromEntries(films.map((f) => [f.id, [7.9, SURE] as [number, number]])));

  it("only asks about the films it was given", () => {
    const films = tier();
    const pair = [films[3], films[7]];
    const { changed } = reRate(films, pair, allDemoted(films), true);
    expect(changed.map((c) => c.id).sort()).toEqual(["f03", "f07"]);
  });

  it("leaves the rating of every film it was not given", () => {
    const films = tier();
    const { films: out } = reRate(films, [films[3], films[7]], allDemoted(films), true);
    const moved = out.filter((f) => f.rating !== 4.5).map((f) => f.id);
    expect(moved.sort()).toEqual(["f03", "f07"]);
  });

  it("cannot re-rate more films than were duelled, however sure the model is", () => {
    // The shape of the bug, stated as an invariant: one answer names two films,
    // so one answer may change at most two ratings.
    const films = tier();
    const { changed } = reRate(films, [films[0], films[1]], allDemoted(films), true);
    expect(changed.length).toBeLessThanOrEqual(2);
  });
});

// ── The toggle it used to override ─────────────────────────────────────────
describe("reRate and movePlaced", () => {
  it("holds the order of hard locks in the tier a film left", () => {
    // `movePlaced` was hardcoded `true` here, and `true` unpins hard locks (see
    // respreadTier). So one demotion re-sorted every placement the user had
    // committed in BOTH tiers by belief — while the tickbox beside it promised
    // those films would stay exactly where they were put.
    const films = [
      film("goes", 4.5, { score: tierMax(4.5) }),
      film("top", 4.5, { lock: "hard", score: 8800 }),
      film("bottom", 4.5, { lock: "hard", score: 8200 }),
    ];
    // The evidence says the two locked films are the wrong way round. With the
    // toggle off it is not allowed to act on that.
    const b = beliefs({ goes: [7.9, SURE], top: [8.6, SURE], bottom: [9.4, SURE] });

    const { films: out, changed } = reRate(films, [films[0]], b, false);
    expect(changed.map((c) => c.id)).toEqual(["goes"]);

    const locked = out
      .filter((f) => f.lock === "hard")
      .sort((x, y) => y.score - x.score)
      .map((f) => f.id);
    expect(locked).toEqual(["top", "bottom"]);
  });

  it("does reorder them when the user ticked the box", () => {
    const films = [
      film("goes", 4.5, { score: tierMax(4.5) }),
      film("top", 4.5, { lock: "hard", score: 8800 }),
      film("bottom", 4.5, { lock: "hard", score: 8200 }),
    ];
    const b = beliefs({ goes: [7.9, SURE], top: [8.6, SURE], bottom: [9.4, SURE] });

    const { films: out } = reRate(films, [films[0]], b, true);
    const locked = out
      .filter((f) => f.lock === "hard")
      .sort((x, y) => y.score - x.score)
      .map((f) => f.id);
    expect(locked).toEqual(["bottom", "top"]);
  });
});

// ── How far the evidence must travel before it may overrule a star ─────────
describe("RERATE_MARGIN", () => {
  /** How far from its own seed a belief must sit before the rating may move. */
  const NEEDED = 0.5 + RERATE_MARGIN;

  it("refuses a film that has only just crossed the rounding boundary", () => {
    // 4.5★ seeds at 9.0 and `ratingFromBelief` flips at 8.5 — half a point, on a
    // scale whose prior spread is 3. That is a rounding error, not a verdict,
    // and acting on it is what emptied the tier.
    expect(ratingFromBelief(8.4)).toBe(4);
    const { changed } = rate([film("marginal", 4.5)], beliefs({ marginal: [8.4, SURE] }));
    expect(changed).toEqual([]);
  });

  it("accepts a film the evidence puts a whole tier away", () => {
    const { films: out, changed } = rate([film("wrong", 4.5)], beliefs({ wrong: [8, SURE] }));
    expect(changed).toEqual([{ id: "wrong", from: 4.5, to: 4 }]);
    expect(out[0].rating).toBe(4);
  });

  it("applies the same margin upward", () => {
    // Symmetric on purpose. A rule freer to promote than demote inflates a
    // library a little every run — the trap `redistributeRatings` avoids.
    expect(rate([film("nearly", 4)], beliefs({ nearly: [8.6, SURE] })).changed).toEqual([]);
    expect(rate([film("clearly", 4)], beliefs({ clearly: [9, SURE] })).changed).toEqual([
      { id: "clearly", from: 4, to: 4.5 },
    ]);
  });

  it("measures the distance from the film's own seed", () => {
    // Not from the boundary, and not from the new tier: the question is how far
    // the evidence has moved from what the USER said.
    const at = (mean: number) => rate([film("f", 4)], beliefs({ f: [mean, SURE] })).changed.length;
    expect(at(8 + NEEDED - 0.01)).toBe(0);
    expect(at(8 + NEEDED + 0.01)).toBe(1);
  });
});

// ── Where a re-rated film lands in its new band ────────────────────────────
describe("reRate landing", () => {
  it("drops a demoted film to the TOP of the band below, not the middle", () => {
    // It was `seedScore(to)` — the midpoint — which put a film that had barely
    // lost its 4.5★ into the middle of the 4★s, below films it has never been
    // compared with. The edge is the smallest move consistent with the claim.
    const films = [film("goes", 4.5), film("resident", 4, { id: "resident" })];
    const { films: out } = reRate(
      films,
      [films[0]],
      // The 4★ resident has no belief, so it seeds at 8.0 and the demoted film
      // at 7.9 sits below it — the respread cannot be what puts it at the top.
      beliefs({ goes: [7.9, SURE] }),
      true,
    );
    const goes = out.find((f) => f.id === "goes")!;
    expect(goes.rating).toBe(4);
    expect(goes.score).toBeGreaterThanOrEqual(tierMin(4));
    expect(goes.score).toBeLessThanOrEqual(tierMax(4));
  });

  it("keeps every score inside its band whichever way the rating moved", () => {
    const films = [film("down", 5), film("up", 3)];
    const { films: out } = reRate(films, films, beliefs({ down: [8, SURE], up: [8, SURE] }), true);
    for (const f of out) {
      expect(f.score).toBeGreaterThanOrEqual(tierMin(f.rating));
      expect(f.score).toBeLessThanOrEqual(tierMax(f.rating));
    }
  });
});
