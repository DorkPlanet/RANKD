import { describe, expect, it } from "vitest";

import { PRIOR_SPREAD, type Belief } from "@/lib/bayes";
import { beliefsFor } from "@/lib/beliefs";
import { REPETITION_GUARD_WINDOW, nextPair, poolFor, inScope } from "@/lib/matchmaker";
import { newJudgement, type Judgement } from "@/lib/log";
import type { Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, rating: Rating = 4, lock?: "soft" | "hard"): Film => ({
  id,
  title: id,
  rating,
  score: rating * 1000,
  lock,
});

const beliefs = (entries: Record<string, Partial<Belief>>): Map<string, Belief> =>
  new Map(
    Object.entries(entries).map(([id, b]) => [
      id,
      { mean: b.mean ?? 8, spread: b.spread ?? PRIOR_SPREAD },
    ]),
  );

const never = () => false;
const always = () => true;

const judged = (a: string, b: string): Judgement => newJudgement(a, b, "a", "shuffle");

describe("scope", () => {
  const library = [film("a", 5), film("b", 4), film("c", 4), film("d", 3.5), film("e", 2)];

  it("all takes the whole library", () => {
    expect(inScope(library, { kind: "all" })).toHaveLength(5);
  });

  it("tier takes exactly one star rating", () => {
    expect(inScope(library, { kind: "tier", tier: 4 }).map((f) => f.id)).toEqual(["b", "c"]);
  });

  it("range reaches either side, asymmetrically", () => {
    const out = inScope(library, { kind: "range", tier: 4, below: 0.5, above: 1 });
    expect(out.map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });

  // The whole reason this kind exists: the Fast Shuffle strip can now select
  // tiers that do not touch, which an anchor and two edges cannot express.
  it("tiers takes an arbitrary, non-contiguous set", () => {
    const out = inScope(library, { kind: "tiers", tiers: [5, 3.5] });
    expect(out.map((f) => f.id)).toEqual(["a", "d"]);
  });

  it("tiers with one entry matches the single-tier scope", () => {
    expect(inScope(library, { kind: "tiers", tiers: [4] }).map((f) => f.id)).toEqual(
      inScope(library, { kind: "tier", tier: 4 }).map((f) => f.id),
    );
  });

  it("tiers ignores the order it was given, keeping library order", () => {
    expect(inScope(library, { kind: "tiers", tiers: [3.5, 5] }).map((f) => f.id)).toEqual(["a", "d"]);
  });

  it("an empty tier set admits nothing", () => {
    expect(inScope(library, { kind: "tiers", tiers: [] })).toEqual([]);
  });
});

describe("pool", () => {
  const library = [film("a", 4, "hard"), film("b", 4), film("c", 4)];

  it("leaves HARD-locked films out by default — the point is the unplaced ones", () => {
    expect(poolFor(library, { scope: { kind: "all" } }).map((f) => f.id)).toEqual(["b", "c"]);
  });

  it("includes them when the run opted in", () => {
    const pool = poolFor(library, { scope: { kind: "all" }, includeConfirmed: true });
    expect(pool).toHaveLength(3);
  });

  // The other half of the Phase 2 bug: excluding the model's own placements meant
  // Fast Shuffle stopped serving the very films it had the most to learn about.
  it("keeps SOFT-locked films in the pool, tickbox or not", () => {
    const withSoft = [film("model-placed", 4, "soft"), film("b", 4), film("c", 4)];
    expect(poolFor(withSoft, { scope: { kind: "all" } }).map((f) => f.id)).toContain("model-placed");
    expect(
      poolFor(withSoft, { scope: { kind: "all" }, includeConfirmed: true }).map((f) => f.id),
    ).toContain("model-placed");
  });
});

describe("nextPair", () => {
  it("returns null rather than throwing when there is nothing to ask", () => {
    expect(nextPair([], [], new Map(), { scope: { kind: "all" } })).toBeNull();
    expect(nextPair([film("a")], [], new Map(), { scope: { kind: "all" } })).toBeNull();
  });

  it("returns null when the scope is too narrow, not a pair from outside it", () => {
    const library = [film("a", 4), film("b", 3)];
    expect(nextPair(library, [], new Map(), { scope: { kind: "tier", tier: 4 } })).toBeNull();
  });

  it("anchors on the least-settled film", () => {
    const library = [film("settled"), film("unsure"), film("middling")];
    const b = beliefs({
      settled: { spread: 0.2 },
      middling: { spread: 1 },
      unsure: { spread: 2.9 },
    });
    const pair = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: never });
    expect(pair![0].id).toBe("unsure");
  });

  it("treats a film the model has never seen as maximally unsettled", () => {
    const library = [film("known"), film("brand-new")];
    const b = beliefs({ known: { spread: 0.2 } });
    const pair = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: never });
    expect(pair![0].id).toBe("brand-new");
  });

  it("pairs the anchor with its nearest opponent — the question it can't predict", () => {
    const library = [film("anchor"), film("near"), film("far")];
    const b = beliefs({
      anchor: { mean: 8, spread: 2.9 },
      near: { mean: 8.1, spread: 0.5 },
      far: { mean: 2, spread: 0.5 },
    });
    const pair = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: never });
    expect(pair![1].id).toBe("near");
  });

  it("goes long-range when exploring — the only way to catch a mis-rated film", () => {
    const library = [film("anchor"), film("near"), film("far")];
    const b = beliefs({
      anchor: { mean: 8, spread: 2.9 },
      near: { mean: 8.1, spread: 0.5 },
      far: { mean: 2, spread: 0.5 },
    });
    const pair = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: always });
    expect(pair![1].id).toBe("far");
  });

  it("is deterministic on identical input", () => {
    const library = [film("a"), film("b"), film("c"), film("d")];
    const b = beliefs({ a: {}, b: {}, c: {}, d: {} });
    const one = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: never });
    const two = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: never });
    expect(one!.map((f) => f.id)).toEqual(two!.map((f) => f.id));
  });

  it("does not re-serve a pair inside the guard window", () => {
    const library = [film("a"), film("b"), film("c")];
    const b = beliefs({ a: { mean: 8, spread: 2.9 }, b: { mean: 8.1 }, c: { mean: 8.2 } });
    const first = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: never })!;
    const log = [judged(first[0].id, first[1].id)];
    const second = nextPair(library, log, b, { scope: { kind: "all" }, shouldExplore: never })!;
    expect(new Set([second[0].id, second[1].id])).not.toEqual(
      new Set([first[0].id, first[1].id]),
    );
  });

  it("guards pairs served but not yet committed, so a fast streak can't repeat one", () => {
    const library = [film("a"), film("b"), film("c")];
    const b = beliefs({ a: { mean: 8, spread: 2.9 }, b: { mean: 8.1 }, c: { mean: 8.2 } });
    const first = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: never })!;
    const second = nextPair(library, [], b, {
      scope: { kind: "all" },
      shouldExplore: never,
      recentlyServed: [[first[0].id, first[1].id]],
    })!;
    expect(new Set([second[0].id, second[1].id])).not.toEqual(
      new Set([first[0].id, first[1].id]),
    );
  });

  it("only guards the recent window, not the whole history", () => {
    const library = [film("a"), film("b")];
    const b = beliefs({ a: {}, b: {} });
    const stale = Array.from({ length: REPETITION_GUARD_WINDOW + 5 }, () => judged("x", "y"));
    const pair = nextPair(library, [...stale, judged("a", "b"), ...stale], b, {
      scope: { kind: "all" },
      shouldExplore: never,
    });
    expect(pair).not.toBeNull();
  });

  // The property that is easy to lose and only shows up as a mode that silently
  // stops serving pairs.
  it("never deadlocks: a two-film pool keeps serving even when fully guarded", () => {
    const library = [film("a"), film("b")];
    const b = beliefs({ a: {}, b: {} });
    const log = Array.from({ length: REPETITION_GUARD_WINDOW }, () => judged("a", "b"));
    const pair = nextPair(library, log, b, { scope: { kind: "all" }, shouldExplore: never });
    expect(pair).not.toBeNull();
    expect(new Set([pair![0].id, pair![1].id])).toEqual(new Set(["a", "b"]));
  });

  it("never returns a film against itself", () => {
    const library = [film("a"), film("b"), film("c")];
    const b = beliefs({ a: {}, b: {}, c: {} });
    for (const explore of [never, always]) {
      const pair = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: explore })!;
      expect(pair[0].id).not.toBe(pair[1].id);
    }
  });

  it("never serves a hard-locked film unless the run opted in", () => {
    const library = [film("placed", 4, "hard"), film("a"), film("b")];
    const b = beliefs({ placed: { spread: 2.99 }, a: {}, b: {} });
    for (let i = 0; i < 20; i++) {
      const pair = nextPair(library, [], b, { scope: { kind: "all" }, shouldExplore: never })!;
      expect(pair.map((f) => f.id)).not.toContain("placed");
    }
  });

  it("stays inside its scope even when exploring", () => {
    const library = [film("a", 4), film("b", 4), film("far", 0.5)];
    const b = beliefs({ a: {}, b: {}, far: {} });
    const pair = nextPair(library, [], b, {
      scope: { kind: "tier", tier: 4 },
      shouldExplore: always,
    })!;
    expect(pair.map((f) => f.id).sort()).toEqual(["a", "b"]);
  });
});

// ── Holding an anchor ──────────────────────────────────────────────────────
//
// `nextPair` already anchored on the least-settled film and picked its nearest
// opponent; it just chose a new anchor every serve. Holding one is both easier
// to read — one unfamiliar film at a time instead of two — and the thing that
// makes placements happen at all, since a film earns its number from duels
// about ITSELF and spreading them across a library means none accumulate.
describe("anchorId", () => {
  const pool = [film("a"), film("b"), film("c"), film("d")];
  const flat = beliefsFor(pool, []);

  it("keeps the requested film on the anchor side", () => {
    const pair = nextPair(pool, [], flat, {
      scope: { kind: "all" },
      shouldExplore: () => false,
      anchorId: "c",
    });
    expect(pair?.[0].id).toBe("c");
  });

  it("holds the same anchor across consecutive serves", () => {
    for (const id of ["a", "b", "c", "d"]) {
      const pair = nextPair(pool, [], flat, {
        scope: { kind: "all" },
        shouldExplore: () => false,
        anchorId: id,
      });
      expect(pair?.[0].id).toBe(id);
    }
  });

  it("falls back to the least-settled film when the anchor is not in the pool", () => {
    // Placed, hard-locked, filtered out by scope, or simply gone. A stale id
    // must degrade to normal behaviour rather than serve nothing.
    const pair = nextPair(pool, [], flat, {
      scope: { kind: "all" },
      shouldExplore: () => false,
      anchorId: "not-a-film",
    });
    expect(pair).not.toBeNull();
    expect(pair![0].id).not.toBe("not-a-film");
  });

  it("still returns a pair when there is no anchor at all", () => {
    expect(nextPair(pool, [], flat, { scope: { kind: "all" }, shouldExplore: () => false })).not.toBeNull();
  });
});

// ── A focused run: one film, many opponents ────────────────────────────────
//
// "Refine" pins one film as the anchor for a whole run. The mechanism is the
// anchor that already existed — this only checks the property the feature rests
// on, which is that a pinned anchor keeps coming back however the pool moves.
describe("anchorId, pinned for a whole run", () => {
  const pool = [film("a"), film("b"), film("c"), film("d"), film("e")];
  const flat = beliefsFor(pool, []);

  it("returns the same anchor over and over as the log grows", () => {
    let log: Judgement[] = [];
    for (let i = 0; i < 8; i++) {
      const pair = nextPair(pool, log, flat, {
        scope: { kind: "all" },
        shouldExplore: () => false,
        anchorId: "c",
      });
      expect(pair?.[0].id).toBe("c");
      // And the opponent must actually vary, or a focused run is one duel
      // repeated — the repetition guard is what makes it a run.
      log = [...log, newJudgement(pair![0].id, pair![1].id, "a", "shuffle")];
    }
    const opponents = new Set(log.map((j) => j.b));
    expect(opponents.size).toBeGreaterThan(1);
  });

  it("still finds an opponent when the anchor is the least settled anyway", () => {
    const pair = nextPair(pool, [], flat, {
      scope: { kind: "all" },
      shouldExplore: () => false,
      anchorId: "a",
    });
    expect(pair).not.toBeNull();
    expect(pair![1].id).not.toBe("a");
  });
});
