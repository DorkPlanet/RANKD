import { describe, expect, it } from "vitest";

import { applyRoughCut, roughCutPool, type Bucket } from "@/lib/roughCut";
import { tierMax, tierMin } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, score: number, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  rating: 4,
  score,
  ...over,
});

const assign = (pairs: [string, Bucket][]) => new Map(pairs);
const scoreOf = (out: Film[], id: string) => out.find((f) => f.id === id)!.score;

// 4★ owns 7001–8000, so the thirds are 7001–7334, 7334–7667, 7667–8000.
const LO = tierMin(4);
const HI = tierMax(4);

describe("applyRoughCut", () => {
  it("leaves everything alone when nothing was decided", () => {
    const films = [film("a", 7500), film("b", 7200)];
    expect(applyRoughCut(films, 4, new Map())).toEqual(films);
  });

  it("puts each film in the third it was given", () => {
    const films = [film("a", 7500), film("b", 7500), film("c", 7500)];
    const out = applyRoughCut(films, 4, assign([["a", "top"], ["b", "middle"], ["c", "bottom"]]));
    expect(scoreOf(out, "a")).toBeGreaterThan(scoreOf(out, "b"));
    expect(scoreOf(out, "b")).toBeGreaterThan(scoreOf(out, "c"));
  });

  it("keeps every film inside its own tier's band", () => {
    const films = [film("a", 7500), film("b", 7500), film("c", 7500)];
    const out = applyRoughCut(films, 4, assign([["a", "top"], ["b", "middle"], ["c", "bottom"]]));
    for (const f of out) {
      expect(f.score).toBeGreaterThanOrEqual(LO);
      expect(f.score).toBeLessThanOrEqual(HI);
    }
  });

  // The point of composing: whatever earlier duels established survives the
  // pass, so a second Rough Cut refines rather than flattening and restarting.
  it("preserves existing order within a third", () => {
    const films = [film("hi", 7900), film("mid", 7500), film("lo", 7100)];
    const out = applyRoughCut(films, 4, assign([["hi", "top"], ["mid", "top"], ["lo", "top"]]));
    expect(scoreOf(out, "hi")).toBeGreaterThan(scoreOf(out, "mid"));
    expect(scoreOf(out, "mid")).toBeGreaterThan(scoreOf(out, "lo"));
  });

  // Identical scores would hand the climb an arbitrary order again, which is the
  // exact thing this pass exists to remove.
  it("never leaves two films in a third on the same score", () => {
    const films = [film("a", 7500), film("b", 7500), film("c", 7500), film("d", 7500)];
    const out = applyRoughCut(films, 4, assign([["a", "top"], ["b", "top"], ["c", "top"], ["d", "top"]]));
    const got = out.map((f) => f.score);
    expect(new Set(got).size).toBe(4);
  });

  // The invariant the whole feature rests on. Adjacent bands share a boundary,
  // so an earlier version spread films edge-to-edge and put the worst "upper"
  // film and the best "middle" film on the same score — measured on a real pass,
  // both landed on 7667, silently discarding the only judgement the user made.
  it("keeps every upper film strictly above every middle, and middle above lower", () => {
    const films = Array.from({ length: 30 }, (_, i) => film(`f${i}`, 7500));
    const out = applyRoughCut(
      films,
      4,
      new Map(films.map((f, i) => [f.id, (["top", "middle", "bottom"] as Bucket[])[i % 3]])),
    );
    const band = (b: Bucket) =>
      out.filter((_, i) => (["top", "middle", "bottom"] as Bucket[])[i % 3] === b).map((f) => f.score);
    expect(Math.min(...band("top"))).toBeGreaterThan(Math.max(...band("middle")));
    expect(Math.min(...band("middle"))).toBeGreaterThan(Math.max(...band("bottom")));
  });

  it("centres a lone film in its third rather than pinning it to an edge", () => {
    const out = applyRoughCut([film("a", 7500)], 4, assign([["a", "middle"]]));
    const s = scoreOf(out, "a");
    expect(s).toBeGreaterThan(LO + (HI - LO) / 3);
    expect(s).toBeLessThan(LO + (2 * (HI - LO)) / 3);
  });

  it("leaves films the pass never asked about untouched", () => {
    const films = [film("a", 7500), film("skipped", 7777)];
    const out = applyRoughCut(films, 4, assign([["a", "bottom"]]));
    expect(scoreOf(out, "skipped")).toBe(7777);
  });

  it("does not mutate what it was given", () => {
    const original = film("a", 7500);
    applyRoughCut([original], 4, assign([["a", "bottom"]]));
    expect(original.score).toBe(7500);
  });

  it("writes no lock — a rough opinion is not a commitment", () => {
    const out = applyRoughCut([film("a", 7500)], 4, assign([["a", "top"]]));
    expect(out[0].lock).toBeUndefined();
  });
});

describe("roughCutPool", () => {
  it("takes the tier, best first", () => {
    const films = [film("lo", 7100), film("hi", 7900), film("mid", 7500)];
    expect(roughCutPool(films, 4).map((f) => f.id)).toEqual(["hi", "mid", "lo"]);
  });

  it("ignores other tiers", () => {
    const films = [film("four", 7500), film("five", 9500, { rating: 5 })];
    expect(roughCutPool(films, 4).map((f) => f.id)).toEqual(["four"]);
  });

  // A coarse pass must not overwrite a fine decision the user already made.
  it("skips what the user committed to, but not what the model guessed", () => {
    const films = [
      film("hard", 7900, { lock: "hard" }),
      film("soft", 7500, { lock: "soft" }),
      film("open", 7100),
    ];
    expect(roughCutPool(films, 4).map((f) => f.id)).toEqual(["soft", "open"]);
  });
});
