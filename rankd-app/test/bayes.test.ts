import { describe, expect, it } from "vitest";

import {
  PRIOR_SPREAD,
  confidenceFromSpread,
  fitBeliefs,
  updateDecisive,
  updateDraw,
  type Belief,
  type FitComparison,
  type FitEntry,
} from "@/lib/bayes";

// The properties that matter are behavioural, not numerical: this suite asserts
// what the model is FOR rather than what any particular float comes out as. A
// test pinned to `0.8413` would break on a harmless refactor and prove nothing.

const fresh = (mean: number): Belief => ({ mean, spread: PRIOR_SPREAD });

// A film's prior mean is its star rating doubled — the 1–10 scale the beliefs
// live on. 4★ → 8.
const seed = (id: string, stars: number): FitEntry => ({ id, seed: stars * 2 });

describe("updateDecisive", () => {
  it("moves the winner up and the loser down", () => {
    const { winner, loser } = updateDecisive(fresh(8), fresh(8));
    expect(winner.mean).toBeGreaterThan(8);
    expect(loser.mean).toBeLessThan(8);
  });

  it("tightens both beliefs — a duel is evidence about both films", () => {
    const { winner, loser } = updateDecisive(fresh(8), fresh(8));
    expect(winner.spread).toBeLessThan(PRIOR_SPREAD);
    expect(loser.spread).toBeLessThan(PRIOR_SPREAD);
  });

  it("moves a settled film less than an unsettled one", () => {
    const settled: Belief = { mean: 8, spread: 0.3 };
    const unsettled: Belief = { mean: 8, spread: PRIOR_SPREAD };
    const a = updateDecisive(settled, fresh(8));
    const b = updateDecisive(unsettled, fresh(8));
    expect(a.winner.mean - 8).toBeLessThan(b.winner.mean - 8);
  });

  it("keeps an only-ever-wins film finite — gains shrink with every win", () => {
    let w = fresh(8);
    let firstGain = 0;
    let lastGain = 0;
    for (let i = 0; i < 200; i++) {
      const before = w.mean;
      ({ winner: w } = updateDecisive(w, fresh(8)));
      if (i === 0) firstGain = w.mean - before;
      lastGain = w.mean - before;
    }
    expect(Number.isFinite(w.mean)).toBe(true);
    expect(lastGain).toBeLessThan(firstGain);
    expect(w.mean).toBeLessThan(100);
  });

  it("does not underflow on a hugely confident upset", () => {
    // The loser was believed far stronger; the naive pdf/cdf ratio underflows here.
    const { winner, loser } = updateDecisive({ mean: -50, spread: 1 }, { mean: 50, spread: 1 });
    expect(Number.isFinite(winner.mean)).toBe(true);
    expect(Number.isFinite(loser.mean)).toBe(true);
    expect(winner.mean).toBeGreaterThan(-50);
  });
});

describe("updateDraw — Skip is a real answer, not a coin flip", () => {
  it("pulls two apart beliefs toward each other", () => {
    const { a, b } = updateDraw(fresh(9), fresh(7));
    expect(a.mean).toBeLessThan(9);
    expect(b.mean).toBeGreaterThan(7);
  });

  it("moves neither mean when they are already level", () => {
    const { a, b } = updateDraw(fresh(8), fresh(8));
    expect(a.mean).toBeCloseTo(8, 10);
    expect(b.mean).toBeCloseTo(8, 10);
  });

  it("tightens both — 'these are adjacent' is information", () => {
    const { a, b } = updateDraw(fresh(8), fresh(8));
    expect(a.spread).toBeLessThan(PRIOR_SPREAD);
    expect(b.spread).toBeLessThan(PRIOR_SPREAD);
  });

  it("never synthesises a winner: the update is symmetric in the pair", () => {
    const one = updateDraw(fresh(9), fresh(7));
    const other = updateDraw(fresh(7), fresh(9));
    expect(one.a.mean - 9).toBeCloseTo(other.b.mean - 9, 10);
    expect(one.b.mean - 7).toBeCloseTo(other.a.mean - 7, 10);
  });

  it("says less than a decisive result", () => {
    const drawn = updateDraw(fresh(8), fresh(8));
    const decided = updateDecisive(fresh(8), fresh(8));
    // Less information gathered, so the belief stays wider.
    expect(drawn.a.spread).toBeGreaterThan(decided.winner.spread);
  });

  it("converges rather than oscillating under repeated skips", () => {
    let a = fresh(9);
    let b = fresh(7);
    for (let i = 0; i < 50; i++) ({ a, b } = updateDraw(a, b));
    expect(Math.abs(a.mean - b.mean)).toBeLessThan(Math.abs(9 - 7));
    expect(Number.isFinite(a.mean)).toBe(true);
  });
});

describe("confidenceFromSpread", () => {
  it("reads 0 at the prior — a film with no duels is not settled at all", () => {
    expect(confidenceFromSpread(PRIOR_SPREAD)).toBe(0);
  });

  it("rises toward 1 as the belief tightens", () => {
    expect(confidenceFromSpread(1)).toBeGreaterThan(confidenceFromSpread(2));
    expect(confidenceFromSpread(0.01)).toBeGreaterThan(0.99);
  });

  it("clamps, so a stray spread can never report a nonsense confidence", () => {
    expect(confidenceFromSpread(0)).toBe(1);
    expect(confidenceFromSpread(999)).toBe(0);
  });
});

describe("fitBeliefs", () => {
  const entries = [seed("a", 4), seed("b", 4), seed("c", 4)];

  it("leaves a film nobody duelled at its star seed, maximally unsettled", () => {
    const out = fitBeliefs(entries, []);
    expect(out.get("a")!.mean).toBeCloseTo(8, 6);
    expect(out.get("a")!.spread).toBeCloseTo(PRIOR_SPREAD, 6);
    expect(confidenceFromSpread(out.get("a")!.spread)).toBe(0);
  });

  it("orders films by who beat whom", () => {
    const log: FitComparison[] = [
      { aId: "a", bId: "b", outcome: "a" },
      { aId: "b", bId: "c", outcome: "a" },
      { aId: "a", bId: "c", outcome: "a" },
    ];
    const out = fitBeliefs(entries, log);
    expect(out.get("a")!.mean).toBeGreaterThan(out.get("b")!.mean);
    expect(out.get("b")!.mean).toBeGreaterThan(out.get("c")!.mean);
  });

  // THE property rankd's engine structurally cannot express. Its pile only
  // remembers the most recent duel, so a cycle silently resolves to whatever was
  // answered last. Here the contradiction survives as low confidence.
  it("absorbs a contradiction cycle: A>B>C>A settles all three together", () => {
    const cycle: FitComparison[] = [
      { aId: "a", bId: "b", outcome: "a" },
      { aId: "b", bId: "c", outcome: "a" },
      { aId: "c", bId: "a", outcome: "a" },
    ];
    const out = fitBeliefs(entries, cycle);
    const means = ["a", "b", "c"].map((id) => out.get(id)!.mean);
    const spreadOfMeans = Math.max(...means) - Math.min(...means);
    expect(spreadOfMeans).toBeLessThan(0.05);
  });

  it("reports a cycle as unsettled, not as a confident ordering", () => {
    const cycle: FitComparison[] = [
      { aId: "a", bId: "b", outcome: "a" },
      { aId: "b", bId: "c", outcome: "a" },
      { aId: "c", bId: "a", outcome: "a" },
    ];
    const consistent: FitComparison[] = [
      { aId: "a", bId: "b", outcome: "a" },
      { aId: "b", bId: "c", outcome: "a" },
      { aId: "a", bId: "c", outcome: "a" },
    ];
    const cycled = fitBeliefs(entries, cycle);
    const agreed = fitBeliefs(entries, consistent);
    const gap = (m: Map<string, { mean: number }>) => m.get("a")!.mean - m.get("c")!.mean;
    // Consistent evidence separates the pair; a cycle does not.
    expect(gap(agreed)).toBeGreaterThan(gap(cycled));
  });

  // The whole reason the batch schedule exists: it erases the order-dependence
  // the online updates accumulate.
  it("is order-independent — same judgements, any sequence, same answer", () => {
    const log: FitComparison[] = [
      { aId: "a", bId: "b", outcome: "a" },
      { aId: "b", bId: "c", outcome: "a" },
      { aId: "a", bId: "c", outcome: "a" },
      { aId: "b", bId: "c", outcome: "draw" },
    ];
    const forward = fitBeliefs(entries, log);
    const backward = fitBeliefs(entries, [...log].reverse());
    const shuffled = fitBeliefs(entries, [log[2], log[0], log[3], log[1]]);
    for (const id of ["a", "b", "c"]) {
      expect(forward.get(id)!.mean).toBeCloseTo(backward.get(id)!.mean, 4);
      expect(forward.get(id)!.mean).toBeCloseTo(shuffled.get(id)!.mean, 4);
    }
  });

  it("does not depend on the order films are passed in", () => {
    const log: FitComparison[] = [
      { aId: "a", bId: "b", outcome: "a" },
      { aId: "b", bId: "c", outcome: "a" },
    ];
    const one = fitBeliefs(entries, log);
    const other = fitBeliefs([entries[2], entries[0], entries[1]], log);
    for (const id of ["a", "b", "c"]) {
      expect(one.get(id)!.mean).toBeCloseTo(other.get(id)!.mean, 4);
    }
  });

  it("keeps a film that only ever wins finite, regularised toward its seed", () => {
    const many: FitComparison[] = Array.from({ length: 300 }, () => ({
      aId: "a",
      bId: "b",
      outcome: "a" as const,
    }));
    const out = fitBeliefs(entries, many);
    expect(Number.isFinite(out.get("a")!.mean)).toBe(true);
    expect(out.get("a")!.mean).toBeLessThan(30);
  });

  it("tightens a heavily-judged film and leaves an untouched one wide", () => {
    const log: FitComparison[] = Array.from({ length: 20 }, (_, i) => ({
      aId: "a",
      bId: "b",
      outcome: i % 2 ? ("a" as const) : ("b" as const),
    }));
    const out = fitBeliefs(entries, log);
    expect(out.get("a")!.spread).toBeLessThan(out.get("c")!.spread);
    expect(out.get("c")!.spread).toBeCloseTo(PRIOR_SPREAD, 6);
  });

  it("ignores judgements naming a film that is not in the fit set", () => {
    const log: FitComparison[] = [{ aId: "a", bId: "ghost", outcome: "a" }];
    const out = fitBeliefs(entries, log);
    expect(out.size).toBe(3);
    expect(out.get("a")!.mean).toBeCloseTo(8, 6);
  });

  it("respects the star seed: a 5★ starts above a 2★ with no duels at all", () => {
    const mixed = [seed("high", 5), seed("low", 2)];
    const out = fitBeliefs(mixed, []);
    expect(out.get("high")!.mean).toBeGreaterThan(out.get("low")!.mean);
  });

  it("lets enough evidence overturn the star seed — a tier is a prior, not a cap", () => {
    const mixed = [seed("high", 5), seed("low", 2)];
    const log: FitComparison[] = Array.from({ length: 40 }, () => ({
      aId: "low",
      bId: "high",
      outcome: "a" as const,
    }));
    const out = fitBeliefs(mixed, log);
    expect(out.get("low")!.mean).toBeGreaterThan(out.get("high")!.mean);
  });
});
