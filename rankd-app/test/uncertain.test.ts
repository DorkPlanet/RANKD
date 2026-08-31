// The decisions a ranking is waiting on.
//
// The value of this file is that the number it produces is HONEST — it counts
// pairs nobody has settled, and it falls only when somebody settles one. So most
// of these tests are about what it refuses to count as settled.

import { describe, expect, it } from "vitest";

import type { Judgement, LogMode, Outcome } from "@/lib/log";
import { buildRelations } from "@/lib/relations";
import { tierMax, tierMin, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";
import { callFilms, libraryOpenCalls, openCalls, shakiestTier } from "@/lib/uncertain";

/** Films at one rating, best-first by score: index 0 is the strongest. */
const tier = (n: number, rating: Rating = 4, prefix = "f"): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `${prefix}${i}`,
    title: `${prefix.toUpperCase()}${i}`,
    rating,
    score: Math.round(tierMax(rating) - (i / Math.max(1, n - 1)) * (tierMax(rating) - tierMin(rating))),
  }));

let seq = 0;
const j = (a: string, b: string, o: Outcome, m: LogMode = "koth"): Judgement => ({
  id: `u${seq++}`,
  a,
  b,
  o,
  m,
  t: seq,
});
const beat = (a: string, b: string) => j(a, b, "a");
const oracleFor = (films: Film[], log: Judgement[]) => buildRelations(films.map((f) => f.id), log);

describe("openCalls", () => {
  it("counts every adjacent pair when nothing has been judged", () => {
    const films = tier(5);
    expect(openCalls(films, oracleFor(films, []))).toHaveLength(4);
  });

  it("counts none when every adjacent pair was judged", () => {
    const films = tier(5);
    const log = films.slice(0, -1).map((f, i) => beat(f.id, films[i + 1].id));
    expect(openCalls(films, oracleFor(films, log))).toHaveLength(0);
  });

  it("names the pair, higher film first", () => {
    const films = tier(3);
    const calls = openCalls(films, oracleFor(films, [beat("f0", "f1")]));
    expect(calls).toEqual([{ a: "f1", b: "f2" }]);
  });

  it("falls by one when one call is settled", () => {
    // The whole point of the number: it has to go down as you play, and only
    // when you actually decide something.
    const films = tier(5);
    const before = openCalls(films, oracleFor(films, [])).length;
    const after = openCalls(films, oracleFor(films, [beat("f2", "f3")])).length;
    expect(after).toBe(before - 1);
  });

  it("ignores a pair that is not adjacent", () => {
    // Judging your best against your worst settles nothing that carries the
    // ranking — every pair that touches is still open.
    const films = tier(5);
    expect(openCalls(films, oracleFor(films, [beat("f0", "f4")]))).toHaveLength(4);
  });
});

describe("what still counts as open", () => {
  it("a pair the record contradicts itself about", () => {
    const films = tier(2);
    const log = [beat("f0", "f1"), beat("f1", "f0")];
    expect(openCalls(films, oracleFor(films, log))).toHaveLength(1);
  });

  it("a drag, which is a positional opinion rather than a comparison", () => {
    // relations.ts excludes "drag" rows from its evidence, so this is really a
    // test that the exclusion reaches all the way out to the count.
    const films = tier(2);
    expect(openCalls(films, oracleFor(films, [j("f0", "f1", "a", "drag")]))).toHaveLength(1);
  });
});

describe("what counts as settled", () => {
  it("a pair settled by a chain rather than directly", () => {
    // Rare for adjacent films, but real: if the chain runs through a film that
    // has since moved elsewhere, the two left behind are genuinely decided.
    const films = tier(2);
    const withX = [...films, { ...films[0], id: "x", score: films[0].score - 1 }];
    const log = [beat("f0", "x"), beat("x", "f1")];
    expect(openCalls(films, oracleFor(withX, log))).toHaveLength(0);
  });

  it("a duel fought in any mode", () => {
    for (const m of ["koth", "shuffle", "promotion"] as LogMode[]) {
      const films = tier(2);
      expect(openCalls(films, oracleFor(films, [j("f0", "f1", "a", m)]))).toHaveLength(0);
    }
  });

  it("a draw — declining to separate two films IS deciding about them", () => {
    // The tempting reading is that a draw leaves the list unfinished, because it
    // never says which goes above the other. But the user looked at exactly that
    // pair and answered; counting it as outstanding would put it back on the
    // pile of things to do and re-ask it, which is precisely the tedium the
    // whole remembered-duel layer exists to remove. `relations.ts` takes the
    // same line, and this is that line reaching the count.
    const films = tier(2);
    expect(openCalls(films, oracleFor(films, [j("f0", "f1", "draw")]))).toHaveLength(0);
  });
});

describe("callFilms", () => {
  it("returns the films involved, best-first and without repeats", () => {
    const films = tier(5);
    // Two overlapping calls share f2, which must appear once.
    const calls = [
      { a: "f1", b: "f2" },
      { a: "f2", b: "f3" },
    ];
    expect(callFilms(calls, films).map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("is empty when nothing is open", () => {
    expect(callFilms([], tier(5))).toEqual([]);
  });

  it("hands a climb a pile short enough to be worth it", () => {
    // A tier of 30 with 3 open calls should produce a run of at most 6 films,
    // not 30 — which is the entire reason to target them.
    const films = tier(30);
    const log = films.slice(0, -1).map((f, i) => beat(f.id, films[i + 1].id));
    // Retract three adjacent decisions by contradicting them.
    const muddied = [...log, beat("f6", "f5"), beat("f11", "f10"), beat("f21", "f20")];
    const calls = openCalls(films, oracleFor(films, muddied));
    expect(calls).toHaveLength(3);
    expect(callFilms(calls, films).length).toBeLessThanOrEqual(6);
  });
});

describe("shakiestTier", () => {
  it("picks the tier carrying the most open calls", () => {
    const films = [...tier(3, 5, "a"), ...tier(8, 3, "b")];
    const found = shakiestTier(films, oracleFor(films, []));
    expect(found?.tier).toBe(3);
    expect(found?.calls).toHaveLength(7);
  });

  it("breaks a tie toward the better rating", () => {
    const films = [...tier(4, 5, "a"), ...tier(4, 2, "b")];
    expect(shakiestTier(films, oracleFor(films, []))?.tier).toBe(5);
  });

  it("says nothing when every tier is settled", () => {
    const films = tier(4);
    const log = films.slice(0, -1).map((f, i) => beat(f.id, films[i + 1].id));
    expect(shakiestTier(films, oracleFor(films, log))).toBeUndefined();
  });

  it("ignores a tier with a single film, which has no adjacent pair", () => {
    const films = [...tier(1, 5, "a"), ...tier(3, 3, "b")];
    expect(shakiestTier(films, oracleFor(films, []))?.tier).toBe(3);
  });
});

describe("libraryOpenCalls", () => {
  it("counts across the whole list, in score order", () => {
    // Tier bands never overlap, so the master order runs 5★ then 3★ and the
    // boundary pair between them is an adjacent pair like any other.
    const films = [...tier(2, 5, "a"), ...tier(2, 3, "b")];
    expect(libraryOpenCalls(films, oracleFor(films, []))).toHaveLength(3);
  });

  it("stays quick on a library-sized list", () => {
    const films = tier(800);
    const oracle = oracleFor(films, []);
    const t0 = performance.now();
    const calls = libraryOpenCalls(films, oracle);
    expect(calls).toHaveLength(799);
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
