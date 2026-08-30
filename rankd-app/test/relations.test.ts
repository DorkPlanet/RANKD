// The oracle is allowed to skip a duel, so almost every test here is about it
// REFUSING to. An oracle that answers too often does not save the user work, it
// silently invents rankings they never agreed to — and those get locked in.

import { describe, expect, it } from "vitest";

import { buildRelations, decidedOrder, pairKey } from "@/lib/relations";
import type { Judgement, LogMode, Outcome } from "@/lib/log";

let seq = 0;
const j = (a: string, b: string, o: Outcome, m: LogMode = "koth", t = ++seq): Judgement => ({
  id: `r${seq++}`,
  a,
  b,
  o,
  m,
  t,
});

/** a beat b. */
const beat = (a: string, b: string, m: LogMode = "koth") => j(a, b, "a", m);

describe("pairKey", () => {
  it("is unordered", () => {
    expect(pairKey("a", "b")).toBe(pairKey("b", "a"));
    expect(pairKey("a", "b")).not.toBe(pairKey("a", "c"));
  });
});

describe("direct rows", () => {
  it("answers a pair the user actually judged, either way round", () => {
    const r = buildRelations(["a", "b"], [beat("a", "b")]);
    expect(r.known("a", "b")).toBe("a");
    expect(r.known("b", "a")).toBe("b");
  });

  it("reads a row written in the other orientation", () => {
    const r = buildRelations(["a", "b"], [j("b", "a", "a")]); // b beat a
    expect(r.known("a", "b")).toBe("b");
    expect(r.known("b", "a")).toBe("a");
  });

  it("prefers the direct answer over the closure", () => {
    // The chain says a > c. The user then judged a vs c directly and said c.
    // Their hand beats the deduction, every time.
    const r = buildRelations(["a", "b", "c"], [beat("a", "b"), beat("b", "c"), j("a", "c", "b")]);
    expect(r.known("a", "c")).toBe("b");
  });

  it("refuses a pair the record contradicts itself about", () => {
    const r = buildRelations(["a", "b"], [beat("a", "b"), beat("b", "a")]);
    expect(r.known("a", "b")).toBeNull();
    expect(r.contested("a", "b")).toBe(true);
  });

  it("ignores films outside the pile", () => {
    const r = buildRelations(["a", "b"], [beat("a", "z"), beat("z", "b")]);
    expect(r.known("a", "b")).toBeNull();
  });
});

describe("transitivity", () => {
  it("deduces across a chain", () => {
    const r = buildRelations(["a", "b", "c", "d"], [beat("a", "b"), beat("b", "c"), beat("c", "d")]);
    expect(r.known("a", "d")).toBe("a");
    expect(r.known("d", "a")).toBe("b");
    expect(r.known("b", "d")).toBe("a");
  });

  it("says nothing about two films no chain connects", () => {
    const r = buildRelations(["a", "b", "c", "d"], [beat("a", "b"), beat("c", "d")]);
    expect(r.known("a", "c")).toBeNull();
    expect(r.known("b", "d")).toBeNull();
  });

  it("counts a full chain as a complete order", () => {
    const ids = Array.from({ length: 20 }, (_, i) => `f${i}`);
    const log = ids.slice(0, -1).map((id, i) => beat(id, ids[i + 1]));
    const r = buildRelations(ids, log);
    expect(r.stats.decided).toBe(r.stats.pairs);
  });
});

describe("draws", () => {
  it("settles the pair it was made about", () => {
    const r = buildRelations(["a", "b"], [j("a", "b", "draw")]);
    expect(r.known("a", "b")).toBe("draw");
    expect(r.known("b", "a")).toBe("draw");
  });

  it("does not compose — a>b and b~c says nothing about a vs c", () => {
    // The whole reason draws create no edge. Equality semantics would deduce
    // a > c here, manufacturing a strict claim the user never made. log.ts is
    // explicit that a draw "is never turned into a winner by anything reading
    // this log"; composing draws turns them into winners one step removed.
    const r = buildRelations(["a", "b", "c"], [beat("a", "b"), j("b", "c", "draw")]);
    expect(r.known("a", "c")).toBeNull();
  });

  it("does not chain to another draw", () => {
    const r = buildRelations(["a", "b", "c"], [j("a", "b", "draw"), j("b", "c", "draw")]);
    expect(r.known("a", "c")).toBeNull();
  });

  it("does not bridge a chain", () => {
    const r = buildRelations(["a", "b", "c", "d"], [beat("a", "b"), j("b", "c", "draw"), beat("c", "d")]);
    expect(r.known("a", "d")).toBeNull();
  });
});

describe("cycles", () => {
  it("still answers a pair the user judged directly, cycle or no cycle", () => {
    // a>b>c>a. Every pair here has a direct row, so rule 1 answers all three and
    // the closure is never consulted — which is right: each of those answers is
    // the user's own tap, and replaying their own tap to them is not an
    // inference. The contradiction is a property of the three together, not of
    // any one of them, and `contested` is what reports it.
    const r = buildRelations(["a", "b", "c"], [beat("a", "b"), beat("b", "c"), beat("c", "a")]);
    expect(r.known("a", "b")).toBe("a");
    expect(r.known("c", "a")).toBe("a");
    expect(r.contested("a", "b")).toBe(true);
  });

  it("refuses a DEDUCED pair whose chain runs both ways", () => {
    // a>b>c>d>a. Nobody judged a against c, and the closure reaches it in both
    // directions (a>b>c, and c>d>a). Answering would mean silently picking a
    // side of a contradiction the user never resolved.
    const ids = ["a", "b", "c", "d"];
    const r = buildRelations(ids, [beat("a", "b"), beat("b", "c"), beat("c", "d"), beat("d", "a")]);
    expect(r.known("a", "c")).toBeNull();
    expect(r.known("b", "d")).toBeNull();
    expect(r.contested("a", "c")).toBe(true);
  });

  it("contains the damage to the films in the cycle", () => {
    // a>b>c>d>a is contradictory; e sits cleanly below all four and stays decided.
    const ids = ["a", "b", "c", "d", "e"];
    const r = buildRelations(ids, [
      beat("a", "b"),
      beat("b", "c"),
      beat("c", "d"),
      beat("d", "a"),
      beat("d", "e"),
    ]);
    expect(r.known("a", "c")).toBeNull(); // inside the cycle
    for (const x of ["a", "b", "c", "d"]) expect(r.known(x, "e")).toBe("a");
  });

  it("refuses to call the pile decided when a cycle is in it", () => {
    const ids = ["a", "b", "c"];
    const r = buildRelations(ids, [beat("a", "b"), beat("b", "c"), beat("c", "a")]);
    expect(decidedOrder(ids, r)).toBeNull();
  });
});

describe("which rows count as evidence", () => {
  it("ignores drag-synthesised rows by default", () => {
    // Those pairs were picked by an algorithm sampling around a drop point, not
    // chosen by a finger. They are real opinions about position and they belong
    // in the log — they are just not grounds for skipping a duel.
    const r = buildRelations(["a", "b"], [beat("a", "b", "drag")]);
    expect(r.known("a", "b")).toBeNull();
  });

  it("counts shuffle, promotion and legacy spotlight duels", () => {
    for (const m of ["shuffle", "promotion", "spotlight"] as LogMode[]) {
      expect(buildRelations(["a", "b"], [beat("a", "b", m)]).known("a", "b")).toBe("a");
    }
  });

  it("takes an explicit mode filter", () => {
    const log = [beat("a", "b", "drag")];
    const r = buildRelations(["a", "b"], log, [], { modes: new Set<LogMode>(["drag"]) });
    expect(r.known("a", "b")).toBe("a");
  });
});

describe("the in-flight journal", () => {
  it("counts alongside the stored log", () => {
    const r = buildRelations(["a", "b", "c"], [beat("a", "b")], [beat("b", "c")]);
    expect(r.known("a", "c")).toBe("a");
  });
});

describe("decidedOrder", () => {
  it("returns the order a full chain implies", () => {
    const r = buildRelations(["c", "a", "b"], [beat("a", "b"), beat("b", "c")]);
    expect(decidedOrder(["c", "a", "b"], r)).toEqual(["a", "b", "c"]);
  });

  it("finds the order even when the pile is arranged against it", () => {
    // The pile is upside down; the record still totally orders it. A test that
    // only walked adjacent pairs in the current order would miss this.
    const ids = ["d", "c", "b", "a"];
    const r = buildRelations(ids, [beat("a", "b"), beat("b", "c"), beat("c", "d")]);
    expect(decidedOrder(ids, r)).toEqual(["a", "b", "c", "d"]);
  });

  it("refuses when one pair is unknown", () => {
    const ids = ["a", "b", "c"];
    const r = buildRelations(ids, [beat("a", "b")]);
    expect(decidedOrder(ids, r)).toBeNull();
  });

  it("refuses when a pair is drawn", () => {
    const ids = ["a", "b", "c"];
    const r = buildRelations(ids, [beat("a", "b"), j("b", "c", "draw"), beat("a", "c")]);
    expect(decidedOrder(ids, r)).toBeNull();
  });

  it("refuses on a cycle", () => {
    const ids = ["a", "b", "c"];
    const r = buildRelations(ids, [beat("a", "b"), beat("b", "c"), beat("c", "a")]);
    expect(decidedOrder(ids, r)).toBeNull();
  });

  it("agrees with an exhaustive topological check on random logs", () => {
    // The counting shortcut is the load-bearing optimisation in this file, so it
    // is checked against the slow, obviously-correct version rather than trusted.
    const slow = (ids: readonly string[], o: ReturnType<typeof buildRelations>): string[] | null => {
      const left = [...ids];
      const out: string[] = [];
      while (left.length > 0) {
        const tops = left.filter((x) => left.every((y) => x === y || o.known(x, y) === "a"));
        if (tops.length !== 1) return null;
        out.push(tops[0]);
        left.splice(left.indexOf(tops[0]), 1);
      }
      return out;
    };

    let s = 12345;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
    const ids = Array.from({ length: 8 }, (_, i) => `f${i}`);

    for (let trial = 0; trial < 300; trial++) {
      const log: Judgement[] = [];
      for (let i = 0; i < ids.length; i++) {
        for (let k = i + 1; k < ids.length; k++) {
          const roll = rand();
          if (roll < 0.45) continue; // leave the pair unjudged
          if (roll < 0.5) log.push(j(ids[i], ids[k], "draw"));
          else if (roll < 0.75) log.push(beat(ids[i], ids[k]));
          else log.push(beat(ids[k], ids[i]));
        }
      }
      const r = buildRelations(ids, log);
      expect(decidedOrder(ids, r)).toEqual(slow(ids, r));
    }
  });
});

describe("cost", () => {
  it("builds a 200-film closure over a few thousand rows in well under a frame", () => {
    const n = 200;
    const ids = Array.from({ length: n }, (_, i) => `f${i}`);
    const log: Judgement[] = [];
    for (let i = 0; i < n - 1; i++) for (let k = 1; k <= 25 && i + k < n; k++) log.push(beat(ids[i], ids[i + k]));

    const t0 = performance.now();
    const r = buildRelations(ids, log);
    const built = performance.now() - t0;

    expect(r.stats.nodes).toBe(n);
    expect(r.known("f0", "f199")).toBe("a");
    // Rebuilt on every duel, so the budget is a frame and the target is nowhere
    // near it. Generous bound — this is a regression guard, not a benchmark.
    expect(built).toBeLessThan(60);
  });
});

describe("explain", () => {
  it("never disagrees with known", () => {
    // The screen puts `explain` on the poster and the pile moves on `known`. If
    // they can differ, the app is captioning one decision while making another,
    // which is worse than saying nothing at all.
    let s = 987;
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x100000000);
    const ids = Array.from({ length: 7 }, (_, i) => `f${i}`);

    for (let trial = 0; trial < 300; trial++) {
      const log: Judgement[] = [];
      for (let i = 0; i < ids.length; i++) {
        for (let k = i + 1; k < ids.length; k++) {
          const roll = rand();
          if (roll < 0.5) continue;
          if (roll < 0.56) log.push(j(ids[i], ids[k], "draw"));
          else if (roll < 0.8) log.push(beat(ids[i], ids[k]));
          else log.push(beat(ids[k], ids[i]));
        }
      }
      const r = buildRelations(ids, log);
      for (const a of ids) {
        for (const b of ids) {
          if (a === b) continue;
          const why = r.explain(a, b);
          expect(why?.o ?? null).toBe(r.known(a, b));
        }
      }
    }
  });

  it("reports a pair the user judged as direct, with when", () => {
    const r = buildRelations(["a", "b"], [j("a", "b", "a", "koth", 55)]);
    expect(r.explain("a", "b")).toEqual({ o: "a", direct: { at: 55 } });
    // And from the other side, the same duel with the answer flipped.
    expect(r.explain("b", "a")).toEqual({ o: "b", direct: { at: 55 } });
  });

  it("keeps the most recent date when a pair was judged twice", () => {
    const r = buildRelations(["a", "b"], [j("a", "b", "a", "koth", 10), j("a", "b", "a", "koth", 90)]);
    expect(r.explain("a", "b")!.direct!.at).toBe(90);
  });

  it("hands back the chain for a deduced pair, winner first", () => {
    const r = buildRelations(["a", "b", "c", "d"], [beat("a", "b"), beat("b", "c"), beat("c", "d")]);
    const why = r.explain("a", "d")!;
    expect(why.o).toBe("a");
    expect(why.direct).toBeUndefined();
    expect(why.chain).toEqual(["a", "b", "c", "d"]);
  });

  it("orients the chain to whichever side won, not to the argument order", () => {
    const r = buildRelations(["a", "b", "c"], [beat("a", "b"), beat("b", "c")]);
    // Asked the losing way round, the chain still runs from the winner.
    const why = r.explain("c", "a")!;
    expect(why.o).toBe("b");
    expect(why.chain).toEqual(["a", "b", "c"]);
  });

  it("takes the shortest route, not the first one found", () => {
    // a beats d directly through x, and also the long way through p→q→r.
    const r = buildRelations(
      ["a", "x", "p", "q", "r", "d"],
      [beat("a", "x"), beat("x", "d"), beat("a", "p"), beat("p", "q"), beat("q", "r"), beat("r", "d")],
    );
    expect(r.explain("a", "d")!.chain).toEqual(["a", "x", "d"]);
  });

  it("prefers the direct answer, and then has no chain to give", () => {
    const r = buildRelations(["a", "b", "c"], [beat("a", "b"), beat("b", "c"), j("a", "c", "b", "koth", 7)]);
    const why = r.explain("a", "c")!;
    expect(why.o).toBe("b");
    expect(why.direct).toEqual({ at: 7 });
    expect(why.chain).toBeUndefined();
  });

  it("says nothing about an undecided pair", () => {
    const r = buildRelations(["a", "b", "c"], [beat("a", "b")]);
    expect(r.explain("a", "c")).toBeNull();
  });

  it("says nothing about a pair inside a cycle it had to deduce", () => {
    const ids = ["a", "b", "c", "d"];
    const r = buildRelations(ids, [beat("a", "b"), beat("b", "c"), beat("c", "d"), beat("d", "a")]);
    expect(r.explain("a", "c")).toBeNull();
  });

  it("reports a remembered draw as a draw, not a winner", () => {
    const r = buildRelations(["a", "b"], [j("a", "b", "draw", "koth", 12)]);
    expect(r.explain("a", "b")).toEqual({ o: "draw", direct: { at: 12 } });
  });
});
