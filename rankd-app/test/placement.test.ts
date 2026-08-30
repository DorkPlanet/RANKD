// Placing films by hand, rather than by duelling them into position.
//
// The brief behind all four of these was "easier ways for users to place
// things". Duels are one way and they are not always the easiest: "this is the
// worst of these", "this belongs about here", "that should not be placed yet"
// are things a person knows instantly, and each of them used to cost a full
// climb to say.

import { describe, expect, it } from "vitest";

import {
  choose,
  confirm,
  confirmLast,
  confirmPrefix,
  getPair,
  groupFilms,
  pendingConfirm,
  placeAt,
  reopenConfirmed,
  settledPrefix,
  startRun,
} from "@/lib/ladder";
import type { Judgement, LogMode, Outcome } from "@/lib/log";
import { buildRelations } from "@/lib/relations";
import { tierMax, tierMin, type Rating } from "@/lib/tiers";
import type { Film, RankState } from "@/lib/types";

const RATING: Rating = 4;

const tier = (n: number): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    title: `F${i}`,
    rating: RATING,
    score: Math.round(tierMax(RATING) - (i / Math.max(1, n - 1)) * (tierMax(RATING) - tierMin(RATING))),
  }));

let seq = 0;
const j = (a: string, b: string, o: Outcome, m: LogMode = "koth"): Judgement => ({
  id: `p${seq++}`,
  a,
  b,
  o,
  m,
  t: seq,
});
const beat = (a: string, b: string) => j(a, b, "a");
const chain = (ids: readonly string[]) => ids.slice(0, -1).map((id, i) => beat(id, ids[i + 1]));
const oracleFor = (films: Film[], log: Judgement[]) => buildRelations(films.map((f) => f.id), log);

const pile = (s: RankState) => s.session!.unconfirmed;
const head = (s: RankState) => s.session!.confirmed;
const tail = (s: RankState) => s.session!.confirmedTail ?? [];
const scoreOf = (s: RankState, id: string) => s.films.find((f) => f.id === id)!.score;

describe("confirmLast — locking in from the bottom", () => {
  it("takes the worst film out of the pile and locks it last", () => {
    const s = confirmLast(startRun(tier(5), RATING));
    expect(tail(s)).toEqual(["f4"]);
    expect(pile(s)).toEqual(["f0", "f1", "f2", "f3"]);
    expect(s.films.find((f) => f.id === "f4")!.lock).toBe("hard");
  });

  it("puts it below everything still in the pile", () => {
    const s = confirmLast(startRun(tier(5), RATING));
    for (const id of pile(s)) expect(scoreOf(s, id)).toBeGreaterThan(scoreOf(s, "f4"));
  });

  it("stacks worst-last as it is used repeatedly", () => {
    let s = confirmLast(startRun(tier(6), RATING));
    s = confirmLast(s);
    // f5 was locked first and is the worst; f4 sits just above it.
    expect(tail(s)).toEqual(["f4", "f5"]);
    expect(scoreOf(s, "f4")).toBeGreaterThan(scoreOf(s, "f5"));
  });

  it("restarts the climb from the new bottom", () => {
    const s = confirmLast(startRun(tier(5), RATING));
    expect(getPair(s)!.contender.id).toBe("f3");
    expect(getPair(s)!.opponent.id).toBe("f2");
  });

  it("meets in the middle and ends the run", () => {
    // The pile fills from both ends; when they meet there is nothing left.
    let s: RankState = startRun(tier(4), RATING);
    s = confirmLast(s); // f3 last
    s = confirmLast(s); // f2 next-to-last
    while (s.session && !pendingConfirm(s)) s = choose(s, getPair(s)!.contender.id);
    s = confirm(s);
    s = confirm(s);
    expect(s.session).toBeNull();
    const order = [...s.films].sort((a, b) => b.score - a.score).map((f) => f.id);
    expect(order.slice(-2)).toEqual(["f2", "f3"]);
    expect(s.films.every((f) => f.lock === "hard")).toBe(true);
  });

  it("takes a whole gathered group down together", () => {
    const grouped = groupFilms(startRun(tier(6), RATING), ["f4", "f5"], "f5");
    const s = confirmLast(grouped);
    expect(tail(s)).toEqual(["f4", "f5"]);
    expect(s.session!.clusters).toBeUndefined();
  });

  it("refuses when there is nothing to separate it from", () => {
    const s = startRun(tier(2), RATING);
    const once = confirmLast(s);
    expect(tail(once)).toEqual(["f1"]);
    // One film left cannot be "the worst of what's left" against anything.
    expect(confirmLast(once)).toBe(once);
  });

  it("records no judgements — it is an assertion, not a duel", () => {
    const s = confirmLast(startRun(tier(5), RATING));
    expect(s.journal).toEqual([]);
    expect(s.films.every((f) => (f.duels ?? 0) === 0)).toBe(true);
  });
});

describe("placeAt — dropping a film anywhere", () => {
  it("moves a film to the position asked for", () => {
    const s = placeAt(startRun(tier(6), RATING), "f5", 2);
    expect(pile(s)).toEqual(["f0", "f1", "f5", "f2", "f3", "f4"]);
  });

  it("clamps rather than refusing an index off either end", () => {
    const start = startRun(tier(4), RATING);
    expect(pile(placeAt(start, "f3", -5))).toEqual(["f3", "f0", "f1", "f2"]);
    expect(pile(placeAt(start, "f0", 99))).toEqual(["f1", "f2", "f3", "f0"]);
  });

  it("carries a whole group to the new position", () => {
    const grouped = groupFilms(startRun(tier(7), RATING), ["f4", "f5"], "f5");
    const s = placeAt(grouped, "f4", 1);
    expect(pile(s)).toEqual(["f0", "f4", "f5", "f1", "f2", "f3", "f6"]);
  });

  it("commits nothing and records nothing", () => {
    const start = startRun(tier(6), RATING);
    const s = placeAt(start, "f5", 2);
    expect(s.journal).toEqual([]);
    expect(s.films.every((f) => f.lock === undefined)).toBe(true);
    expect(s.films.map((f) => f.score)).toEqual(start.films.map((f) => f.score));
  });

  it("re-aims the duel from where the climber now stands", () => {
    const s = placeAt(startRun(tier(6), RATING), "f5", 2);
    // f5 is still the climber; it now faces whatever sits above its new slot.
    expect(getPair(s)!.contender.id).toBe("f5");
    expect(getPair(s)!.opponent.id).toBe("f1");
  });

  it("ignores a film that is not in the pile", () => {
    const s = startRun(tier(4), RATING);
    expect(placeAt(s, "nope", 1)).toBe(s);
  });
});

describe("settledPrefix / confirmPrefix — locking several at once", () => {
  it("finds the settled top of a pile whose tail is still open", () => {
    // f0 > f1 > f2 is settled, and all three beat everything below.
    const films = tier(6);
    const log = [
      ...chain(["f0", "f1", "f2"]),
      ...["f3", "f4", "f5"].flatMap((low) => ["f0", "f1", "f2"].map((hi) => beat(hi, low))),
    ];
    const s = startRun(films, RATING, { oracle: oracleFor(films, log) });
    expect(settledPrefix(s)).toEqual(["f0", "f1", "f2"]);
  });

  it("refuses a top that something below it beats", () => {
    // f0 > f1 among themselves, but f5 beats f0 — so the "top" is not the top.
    const films = tier(6);
    const s = startRun(films, RATING, { oracle: oracleFor(films, [beat("f0", "f1"), beat("f5", "f0")]) });
    expect(settledPrefix(s)).toBeNull();
  });

  it("refuses when only one film is settled", () => {
    // A prefix of one is what `confirm` already is; there is nothing to batch.
    const films = tier(6);
    const log = ["f1", "f2", "f3", "f4", "f5"].map((low) => beat("f0", low));
    const s = startRun(films, RATING, { oracle: oracleFor(films, log) });
    expect(settledPrefix(s)).toBeNull();
  });

  it("refuses without an oracle", () => {
    expect(settledPrefix(startRun(tier(6), RATING))).toBeNull();
  });

  it("locks the whole prefix in one call, in order", () => {
    const films = tier(6);
    const log = [
      ...chain(["f0", "f1", "f2"]),
      ...["f3", "f4", "f5"].flatMap((low) => ["f0", "f1", "f2"].map((hi) => beat(hi, low))),
    ];
    const s = confirmPrefix(startRun(films, RATING, { oracle: oracleFor(films, log) }));
    expect(head(s)).toEqual(["f0", "f1", "f2"]);
    expect(pile(s)).toEqual(["f3", "f4", "f5"]);
    for (const id of ["f0", "f1", "f2"]) expect(s.films.find((f) => f.id === id)!.lock).toBe("hard");
    expect(scoreOf(s, "f0")).toBeGreaterThan(scoreOf(s, "f1"));
    expect(scoreOf(s, "f1")).toBeGreaterThan(scoreOf(s, "f2"));
  });

  it("writes no evidence for what it locks", () => {
    const films = tier(6);
    const log = [
      ...chain(["f0", "f1", "f2"]),
      ...["f3", "f4", "f5"].flatMap((low) => ["f0", "f1", "f2"].map((hi) => beat(hi, low))),
    ];
    const s = confirmPrefix(startRun(films, RATING, { oracle: oracleFor(films, log) }));
    expect(s.journal).toEqual([]);
    expect(s.films.every((f) => (f.duels ?? 0) === 0)).toBe(true);
  });
});

describe("reopenConfirmed — taking a placement back", () => {
  /** Play until `count` films are on the shelf, the climber winning everything. */
  const placeSome = (n: number, count: number): RankState => {
    let s: RankState = startRun(tier(n), RATING);
    while (s.session && s.session.confirmed.length < count) {
      if (pendingConfirm(s)) {
        s = confirm(s);
        continue;
      }
      s = choose(s, getPair(s)!.contender.id);
    }
    return s;
  };

  it("returns a placed film to the pile", () => {
    const placed = placeSome(6, 2);
    const id = head(placed)[1];
    const s = reopenConfirmed(placed, id);
    expect(head(s)).not.toContain(id);
    expect(pile(s)).toContain(id);
  });

  it("takes its number away with it", () => {
    // A rank in the list means the user committed to a position. Reopening is
    // them taking that back, so the lock cannot survive it.
    const placed = placeSome(6, 2);
    const id = head(placed)[1];
    expect(placed.films.find((f) => f.id === id)!.lock).toBe("hard");
    const s = reopenConfirmed(placed, id);
    expect(s.films.find((f) => f.id === id)!.lock).toBeUndefined();
  });

  it("puts it back at the top of the pile, where it was placed", () => {
    const placed = placeSome(6, 2);
    const s = reopenConfirmed(placed, head(placed)[1]);
    expect(pile(s)[0]).toBe(head(placed)[1]);
  });

  it("reopens from the bottom shelf too, back to the bottom of the pile", () => {
    const s = reopenConfirmed(confirmLast(startRun(tier(5), RATING)), "f4");
    expect(tail(s)).toEqual([]);
    expect(pile(s)[pile(s).length - 1]).toBe("f4");
    expect(s.films.find((f) => f.id === "f4")!.lock).toBeUndefined();
  });

  it("leaves the rest of the run alone", () => {
    const placed = placeSome(6, 2);
    const s = reopenConfirmed(placed, head(placed)[0]);
    expect(head(s)).toEqual([head(placed)[1]]);
    expect(s.journal).toEqual(placed.journal);
  });

  it("ignores a film that is not placed", () => {
    const placed = placeSome(6, 2);
    expect(reopenConfirmed(placed, pile(placed)[0])).toBe(placed);
  });
});
