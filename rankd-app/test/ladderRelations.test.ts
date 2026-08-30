// The climb, once it is allowed to read what the user already decided.
//
// Two properties matter more than any of the specifics here:
//
//   · with no oracle the engine behaves exactly as it always has (every test in
//     ladder.test.ts and kothReRate.test.ts is that assertion, unchanged), and
//   · with one, it never reaches an order the unaided climb would not have.
//
// Everything else in this file is about the engine REFUSING to help in the
// places where helping would be wrong.

import { describe, expect, it } from "vitest";

import {
  choose,
  confirm,
  decidedRest,
  finishDecided,
  getPair,
  pendingConfirm,
  startRun,
  stepBackFromConfirm,
} from "@/lib/ladder";
import type { Judgement, LogMode, Outcome } from "@/lib/log";
import { buildRelations } from "@/lib/relations";
import { tierMax, tierMin, type Rating } from "@/lib/tiers";
import type { Film, RankState } from "@/lib/types";

const RATING: Rating = 4;

/** A tier of n films, best first by score: f0 is the strongest. */
const tier = (n: number): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    title: `F${i}`,
    rating: RATING,
    score: Math.round(tierMax(RATING) - (i / Math.max(1, n - 1)) * (tierMax(RATING) - tierMin(RATING))),
  }));

let seq = 0;
const j = (a: string, b: string, o: Outcome, m: LogMode = "koth"): Judgement => ({
  id: `r${seq++}`,
  a,
  b,
  o,
  m,
  t: seq,
});
/** a beat b. */
const beat = (a: string, b: string) => j(a, b, "a");

/** Every consecutive pair of a best-first order, which totally decides it. */
const chain = (ids: readonly string[]): Judgement[] => ids.slice(0, -1).map((id, i) => beat(id, ids[i + 1]));

const oracleFor = (films: Film[], log: Judgement[]) => buildRelations(films.map((f) => f.id), log);

describe("no oracle means no change", () => {
  it("starts the climb at the bottom and asks, exactly as before", () => {
    const s = startRun(tier(5), RATING);
    expect(s.session!.contenderId).toBe("f4");
    expect(s.session!.challengerId).toBe("f3");
    expect(s.resolved).toEqual([]);
    expect(getPair(s)).not.toBeNull();
  });

  it("offers no finish, however complete the record", () => {
    // The evidence exists; without an oracle handed in, the engine cannot see it.
    const films = tier(5);
    const s = startRun(films, RATING);
    expect(decidedRest(s)).toBeNull();
    expect(finishDecided(s)).toBe(s);
  });
});

describe("auto-resolve", () => {
  it("walks straight to a confirm when the record decides the pile", () => {
    const films = tier(6);
    const ids = films.map((f) => f.id);
    const s = startRun(films, RATING, { oracle: oracleFor(films, chain(ids)) });

    // Nothing to ask: the climb has already carried the best film to the top.
    expect(getPair(s)).toBeNull();
    expect(pendingConfirm(s)!.id).toBe("f0");
    expect(s.resolved).toHaveLength(5); // one per rung it climbed
  });

  it("mints no evidence and counts no duels for what it replays", () => {
    // The whole safety property. An auto-resolved duel that wrote a row would be
    // fabricating evidence out of the act of reading it, and that row would feed
    // straight back into the oracle that produced it.
    const films = tier(6);
    const s = startRun(films, RATING, { oracle: oracleFor(films, chain(films.map((f) => f.id))) });
    expect(s.journal).toEqual([]);
    expect(s.films.every((f) => (f.duels ?? 0) === 0)).toBe(true);
  });

  it("stops at the first pair the user has not settled", () => {
    const films = tier(5);
    // f3 vs f4 is known; nothing else is.
    const s = startRun(films, RATING, { oracle: oracleFor(films, [beat("f3", "f4")]) });
    expect(s.resolved).toHaveLength(1);
    const pair = getPair(s)!;
    // f3 won its way up one rung and now faces f2, which nobody has judged.
    expect(pair.contender.id).toBe("f3");
    expect(pair.opponent.id).toBe("f2");
  });

  it("carries on after a real answer", () => {
    const films = tier(5);
    // Everything above f2 is settled; f4 vs f3 is not.
    const log = [beat("f0", "f1"), beat("f1", "f2"), beat("f2", "f3")];
    let s = startRun(films, RATING, { oracle: oracleFor(films, log) });
    expect(getPair(s)!.contender.id).toBe("f4");
    expect(getPair(s)!.opponent.id).toBe("f3");

    s = choose(s, "f3"); // the user says f3 is better
    // f3 now climbs, and the record already says f2, f1 and f0 all beat it.
    expect(pendingConfirm(s)!.id).toBe("f0");
    expect(s.journal).toHaveLength(1); // only the duel actually fought
  });

  it("respects a remembered draw", () => {
    const films = tier(3);
    const s = startRun(films, RATING, { oracle: oracleFor(films, [j("f2", "f1", "draw")]) });
    // A draw places like a loss, so f1 takes over the climb and faces f0.
    expect(s.resolved).toEqual([{ a: "f2", b: "f1", o: "draw" }]);
    expect(getPair(s)!.contender.id).toBe("f1");
  });

  it("declines to help a cross-tier run", () => {
    // Those record nothing by design; reading the library's log to skip their
    // duels would import exactly the leak that ban exists to prevent.
    const films = tier(4);
    const s = startRun(films, RATING, {
      only: films.map((f) => f.id),
      crossTier: true,
      oracle: oracleFor(films, chain(films.map((f) => f.id))),
    });
    expect(s.resolved).toEqual([]);
    expect(getPair(s)).not.toBeNull();
  });

  it("does not re-climb a film the user deliberately stepped back", () => {
    // "Not yet — keep playing" un-parks the champion on purpose. The record
    // agrees it beats everything below it, so an advancing step-back would walk
    // it back to the top and re-serve the identical confirm screen forever.
    const films = tier(4);
    const s = startRun(films, RATING, { oracle: oracleFor(films, chain(films.map((f) => f.id))) });
    expect(pendingConfirm(s)!.id).toBe("f0");

    const back = stepBackFromConfirm(s);
    expect(pendingConfirm(back)).toBeNull();
    expect(getPair(back)).not.toBeNull(); // a real duel, not another confirm
    expect(getPair(back)!.contender.id).toBe("f0");
  });
});

describe("finishDecided", () => {
  it("offers nothing while a pair is still open", () => {
    const films = tier(5);
    const s = startRun(films, RATING, { oracle: oracleFor(films, [beat("f0", "f1")]) });
    expect(decidedRest(s)).toBeNull();
  });

  it("places the whole pile in the order the record implies", () => {
    const films = tier(8);
    const ids = films.map((f) => f.id);
    const s = startRun(films, RATING, { oracle: oracleFor(films, chain(ids)) });

    expect(decidedRest(s)).toEqual(ids);
    const done = finishDecided(s);
    expect(done.session).toBeNull();

    const order = [...done.films].sort((a, b) => b.score - a.score).map((f) => f.id);
    expect(order).toEqual(ids);
    expect(done.films.every((f) => f.lock === "hard")).toBe(true);
  });

  it("lands on the same order the climb would have reached by hand", () => {
    const films = tier(8);
    const ids = films.map((f) => f.id);
    const log = chain(ids);

    // By hand, no oracle: answer every duel the way the log says.
    const rank = new Map(ids.map((id, i) => [id, i]));
    let byHand: RankState = startRun(films, RATING);
    while (byHand.session) {
      if (pendingConfirm(byHand)) {
        byHand = confirm(byHand);
        continue;
      }
      const { contenderId, challengerId } = byHand.session;
      byHand = choose(byHand, rank.get(contenderId)! < rank.get(challengerId)! ? contenderId : challengerId);
    }

    const finished = finishDecided(startRun(films, RATING, { oracle: oracleFor(films, log) }));
    const orderOf = (s: RankState) => [...s.films].sort((a, b) => b.score - a.score).map((f) => f.id);
    expect(orderOf(finished)).toEqual(orderOf(byHand));
  });

  it("keeps a Rough Cut pile inside the slice it already occupied", () => {
    // The band confinement is the thing that makes "rank a pile" safe, and
    // finishing a pile in one tap has to honour it or the cut the user made by
    // hand is scattered back through the other two thirds.
    const films = tier(9);
    const pile = ["f3", "f4", "f5"]; // the middle third, by score
    const lo = Math.min(...pile.map((id) => films.find((f) => f.id === id)!.score));
    const hi = Math.max(...pile.map((id) => films.find((f) => f.id === id)!.score));

    const s = startRun(films, RATING, {
      only: pile,
      oracle: oracleFor(films, [beat("f3", "f4"), beat("f4", "f5")]),
    });
    const done = finishDecided(s);

    for (const id of pile) {
      const f = done.films.find((x) => x.id === id)!;
      expect(f.score).toBeGreaterThanOrEqual(lo);
      expect(f.score).toBeLessThanOrEqual(hi);
    }
    // And the films outside the pile were not touched.
    for (const id of ["f0", "f8"]) {
      expect(done.films.find((x) => x.id === id)!.score).toBe(films.find((x) => x.id === id)!.score);
    }
  });

  it("refuses a pile with a drawn pair in it", () => {
    const films = tier(3);
    const s = startRun(films, RATING, {
      oracle: oracleFor(films, [beat("f0", "f1"), j("f1", "f2", "draw"), beat("f0", "f2")]),
    });
    expect(decidedRest(s)).toBeNull();
  });

  it("refuses a pile the record contradicts itself about", () => {
    const films = tier(3);
    const s = startRun(films, RATING, {
      oracle: oracleFor(films, [beat("f0", "f1"), beat("f1", "f2"), beat("f2", "f0")]),
    });
    expect(decidedRest(s)).toBeNull();
  });

  it("writes no evidence for the films it places", () => {
    const films = tier(6);
    const s = startRun(films, RATING, { oracle: oracleFor(films, chain(films.map((f) => f.id))) });
    const done = finishDecided(s);
    expect(done.journal).toEqual([]);
    expect(done.films.every((f) => (f.duels ?? 0) === 0)).toBe(true);
  });
});
