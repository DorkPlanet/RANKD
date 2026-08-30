// The climb, once it is allowed to read what the user already decided.
//
// Three properties matter more than any of the specifics here:
//
//   · with no oracle the engine behaves exactly as it always has (every test in
//     ladder.test.ts and kothReRate.test.ts is that assertion, unchanged),
//   · with one, it never reaches an order the unaided climb would not have, and
//   · it resolves ONE step at a time, so the screen can show each one and the
//     user can interrupt.
//
// That last property is the reason this file was rewritten. The first version
// resolved every known duel inside a single engine call, which was correct and
// unwatchable: the pile leapt several places between taps with nothing on screen
// to say what had been decided. Everything here now goes a step at a time.

import { describe, expect, it } from "vitest";

import {
  choose,
  confirm,
  decidedRest,
  finishDecided,
  getPair,
  peekKnown,
  pendingConfirm,
  replayStep,
  startRun,
  stepBackFromConfirm,
} from "@/lib/ladder";
import type { Judgement, LogMode, Outcome } from "@/lib/log";
import { buildRelations } from "@/lib/relations";
import { tierMax, tierMin, type Rating } from "@/lib/tiers";
import type { AutoStep, Film, RankState } from "@/lib/types";

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
const j = (a: string, b: string, o: Outcome, m: LogMode = "koth", t = ++seq): Judgement => ({
  id: `r${seq++}`,
  a,
  b,
  o,
  m,
  t,
});
/** a beat b. */
const beat = (a: string, b: string) => j(a, b, "a");

/** Every consecutive pair of a best-first order, which totally decides it. */
const chain = (ids: readonly string[]): Judgement[] => ids.slice(0, -1).map((id, i) => beat(id, ids[i + 1]));

const oracleFor = (films: Film[], log: Judgement[]) => buildRelations(films.map((f) => f.id), log);

/**
 * What the screen does: play remembered duels one at a time until a real
 * decision is reached. Returns the steps so tests can assert what was shown.
 */
function replayAll(start: RankState): { state: RankState; steps: AutoStep[] } {
  let state = start;
  const steps: AutoStep[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    const step = peekKnown(state);
    if (!step) break;
    steps.push(step);
    state = replayStep(state);
  }
  return { state, steps };
}

describe("no oracle means no change", () => {
  it("starts the climb at the bottom and asks, exactly as before", () => {
    const s = startRun(tier(5), RATING);
    expect(s.session!.contenderId).toBe("f4");
    expect(s.session!.challengerId).toBe("f3");
    expect(peekKnown(s)).toBeNull();
    expect(getPair(s)).not.toBeNull();
  });

  it("offers no finish, however complete the record", () => {
    const films = tier(5);
    const s = startRun(films, RATING);
    expect(decidedRest(s)).toBeNull();
    expect(finishDecided(s)).toBe(s);
  });

  it("replayStep is a no-op", () => {
    const s = startRun(tier(5), RATING);
    expect(replayStep(s)).toBe(s);
  });
});

describe("peekKnown", () => {
  it("reports the current pair when the record settles it", () => {
    const films = tier(5);
    const s = startRun(films, RATING, { oracle: oracleFor(films, [beat("f3", "f4")]) });
    expect(peekKnown(s)).toMatchObject({ a: "f4", b: "f3", o: "b", via: "direct" });
  });

  it("says nothing while the pair is open", () => {
    const films = tier(5);
    const s = startRun(films, RATING, { oracle: oracleFor(films, [beat("f0", "f1")]) });
    expect(peekKnown(s)).toBeNull();
  });

  it("marks a deduced pair as inferred, and carries the chain", () => {
    // f4 has never met f3. It follows: f3 beat x, x beat f4.
    const films = tier(5);
    const log = [beat("f3", "f2"), beat("f2", "f4")];
    const s = startRun(films, RATING, { oracle: oracleFor(films, log) });
    const step = peekKnown(s)!;
    expect(step.via).toBe("inferred");
    // Winner first, so it reads "f3 beat f2, which beat f4".
    expect(step.chain).toEqual(["f3", "f2", "f4"]);
    expect(step.at).toBeUndefined();
  });

  it("carries when a direct duel happened, for the explanation", () => {
    const films = tier(5);
    const s = startRun(films, RATING, { oracle: oracleFor(films, [j("f3", "f4", "a", "koth", 1234)]) });
    const step = peekKnown(s)!;
    expect(step.via).toBe("direct");
    expect(step.at).toBe(1234);
    expect(step.chain).toBeUndefined();
  });

  it("declines a cross-tier run", () => {
    // Those record nothing by design; reading the library's log to skip their
    // duels would import exactly the leak that ban exists to prevent.
    const films = tier(4);
    const s = startRun(films, RATING, {
      only: films.map((f) => f.id),
      crossTier: true,
      oracle: oracleFor(films, chain(films.map((f) => f.id))),
    });
    expect(peekKnown(s)).toBeNull();
    expect(getPair(s)).not.toBeNull();
  });

  it("says nothing at a confirm", () => {
    const films = tier(3);
    const { state } = replayAll(startRun(films, RATING, { oracle: oracleFor(films, chain(["f0", "f1", "f2"])) }));
    expect(pendingConfirm(state)).not.toBeNull();
    expect(peekKnown(state)).toBeNull();
  });
});

describe("replaying, one step at a time", () => {
  it("climbs a rung per step rather than all at once", () => {
    const films = tier(6);
    const ids = films.map((f) => f.id);
    let s = startRun(films, RATING, { oracle: oracleFor(films, chain(ids)) });

    // The run does NOT open at a confirm — that was the old behaviour.
    expect(pendingConfirm(s)).toBeNull();
    expect(getPair(s)!.contender.id).toBe("f5");

    s = replayStep(s);
    expect(s.resolved).toHaveLength(1);
    expect(getPair(s)!.contender.id).toBe("f4"); // the winner carries the climb on
  });

  it("reaches the same place the old atomic pass did", () => {
    const films = tier(6);
    const { state, steps } = replayAll(
      startRun(films, RATING, { oracle: oracleFor(films, chain(films.map((f) => f.id))) }),
    );
    expect(steps).toHaveLength(5); // one per rung
    expect(pendingConfirm(state)!.id).toBe("f0");
  });

  it("mints no evidence and counts no duels for what it replays", () => {
    // The whole safety property. An auto-resolved duel that wrote a row would be
    // fabricating evidence out of the act of reading it, and that row would feed
    // straight back into the oracle that produced it.
    const films = tier(6);
    const { state } = replayAll(
      startRun(films, RATING, { oracle: oracleFor(films, chain(films.map((f) => f.id))) }),
    );
    expect(state.journal).toEqual([]);
    expect(state.films.every((f) => (f.duels ?? 0) === 0)).toBe(true);
  });

  it("stops at the first pair the user has not settled", () => {
    const films = tier(5);
    const { state, steps } = replayAll(
      startRun(films, RATING, { oracle: oracleFor(films, [beat("f3", "f4")]) }),
    );
    expect(steps).toHaveLength(1);
    const pair = getPair(state)!;
    expect(pair.contender.id).toBe("f3");
    expect(pair.opponent.id).toBe("f2");
  });

  it("carries on after a real answer", () => {
    const films = tier(5);
    const log = [beat("f0", "f1"), beat("f1", "f2"), beat("f2", "f3")];
    let s = startRun(films, RATING, { oracle: oracleFor(films, log) });
    expect(peekKnown(s)).toBeNull(); // f4 vs f3 is open
    s = choose(s, "f3");
    const { state } = replayAll(s);
    expect(pendingConfirm(state)!.id).toBe("f0");
    expect(state.journal).toHaveLength(1); // only the duel actually fought
  });

  it("respects a remembered draw", () => {
    const films = tier(3);
    const s = startRun(films, RATING, { oracle: oracleFor(films, [j("f2", "f1", "draw")]) });
    const step = peekKnown(s)!;
    expect(step).toMatchObject({ a: "f2", b: "f1", o: "draw", via: "direct" });
    // A draw places like a loss, so f1 takes over the climb.
    expect(getPair(replayStep(s))!.contender.id).toBe("f1");
  });

  it("hands control back the moment the user answers instead", () => {
    // The interrupt. The screen simply stops calling replayStep and calls
    // choose; the engine needs no mode and holds no replay state.
    const films = tier(5);
    const s = startRun(films, RATING, { oracle: oracleFor(films, chain(films.map((f) => f.id))) });
    expect(peekKnown(s)).not.toBeNull();
    const taken = choose(s, "f4"); // the user overrules and picks the climber
    expect(taken.journal).toHaveLength(1);
    expect(taken.journal[0].m).toBe("koth");
  });

  it("does not re-climb a film the user deliberately stepped back", () => {
    // "Not yet — keep playing" un-parks the champion on purpose. The record
    // agrees it beats everything below it, so a replay that fired here would
    // walk it back to the top and re-serve the identical confirm screen.
    const films = tier(4);
    const { state } = replayAll(
      startRun(films, RATING, { oracle: oracleFor(films, chain(films.map((f) => f.id))) }),
    );
    expect(pendingConfirm(state)!.id).toBe("f0");

    const back = stepBackFromConfirm(state);
    expect(pendingConfirm(back)).toBeNull();
    expect(getPair(back)).not.toBeNull();
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
    const films = tier(9);
    const pile = ["f3", "f4", "f5"];
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
