// Small corrections, made where the mistake is noticed.
//
// "That one is a place too high" is a thing you see the instant it happens, and
// before this the only answers were to abandon the run or to fix it in the list
// afterwards. Both cost more than the mistake.

import { describe, expect, it } from "vitest";

import { choose, confirm, getPair, groupFilms, nudgeConfirmed, pendingConfirm, reorderCluster, startRun } from "@/lib/ladder";
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

/** Play until `count` films are on the shelf, the climber winning everything. */
function placeSome(n: number, count: number): RankState {
  let s: RankState = startRun(tier(n), RATING);
  while (s.session && s.session.confirmed.length < count) {
    if (pendingConfirm(s)) {
      s = confirm(s);
      continue;
    }
    s = choose(s, getPair(s)!.contender.id);
  }
  return s;
}

describe("nudgeConfirmed", () => {
  it("moves a placed film down a slot", () => {
    const s = placeSome(6, 3);
    const before = [...s.session!.confirmed];
    const after = nudgeConfirmed(s, before[0], 1);
    expect(after.session!.confirmed).toEqual([before[1], before[0], before[2]]);
  });

  it("moves it up a slot", () => {
    const s = placeSome(6, 3);
    const before = [...s.session!.confirmed];
    const after = nudgeConfirmed(s, before[2], -1);
    expect(after.session!.confirmed).toEqual([before[0], before[2], before[1]]);
  });

  it("clamps at the ends instead of failing", () => {
    const s = placeSome(6, 3);
    const before = [...s.session!.confirmed];
    expect(nudgeConfirmed(s, before[0], -3).session!.confirmed).toEqual(before);
    expect(nudgeConfirmed(s, before[2], 3).session!.confirmed).toEqual(before);
  });

  it("rewrites the scores so the list agrees", () => {
    const s = placeSome(6, 3);
    const before = [...s.session!.confirmed];
    const after = nudgeConfirmed(s, before[0], 1);
    const score = (st: RankState, id: string) => st.films.find((f) => f.id === id)!.score;
    expect(score(after, before[1])).toBeGreaterThan(score(after, before[0]));
  });

  it("does not throw the run away", () => {
    const s = placeSome(6, 3);
    const after = nudgeConfirmed(s, s.session!.confirmed[0], 1);
    expect(after.session!.unconfirmed).toEqual(s.session!.unconfirmed);
    expect(after.session!.contenderId).toBe(s.session!.contenderId);
  });

  it("records the move as evidence, in drag mode", () => {
    const s = placeSome(8, 4);
    const after = nudgeConfirmed(s, s.session!.confirmed[0], 2);
    // Only the rows this move added; the journal still carries the run's duels.
    const added = after.journal.slice(s.journal.length);
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((r) => r.m === "drag")).toBe(true);
  });

  it("writes rows the climb will never skip a duel over", () => {
    // The safety property. relations.ts excludes "drag" from its evidence set,
    // because those pairs were sampled by an algorithm rather than chosen by a
    // finger — so a nudge can never cause the engine to stop asking something.
    const s = placeSome(8, 4);
    const after = nudgeConfirmed(s, s.session!.confirmed[0], 2);
    const added = after.journal.slice(s.journal.length);
    const ids = after.films.map((f) => f.id);
    // The nudge's rows ALONE decide nothing.
    const dragOnly = buildRelations(ids, added);
    for (const row of added) expect(dragOnly.known(row.a, row.b)).toBeNull();
    // And adding them to the real log changes none of its answers either.
    const before = buildRelations(ids, s.journal);
    const withDrags = buildRelations(ids, after.journal);
    for (const a of ids) for (const b of ids) expect(withDrags.known(a, b)).toBe(before.known(a, b));
  });

  it("ignores a film that is not on the shelf", () => {
    const s = placeSome(6, 2);
    const unplaced = s.session!.unconfirmed[0];
    expect(nudgeConfirmed(s, unplaced, 1)).toBe(s);
    expect(nudgeConfirmed(s, s.session!.confirmed[0], 0)).toBe(s);
  });
});

describe("reorderCluster", () => {
  it("moves a film within its group", () => {
    const s = groupFilms(startRun(tier(8), RATING), ["f2", "f3", "f4"], "f3");
    const after = reorderCluster(s, "f4", -2);
    expect(after.session!.clusters![0]).toEqual(["f4", "f2", "f3"]);
    expect(after.session!.unconfirmed).toEqual(["f0", "f1", "f4", "f2", "f3", "f5", "f6", "f7"]);
  });

  it("keeps the group where it is in the pile", () => {
    const s = groupFilms(startRun(tier(8), RATING), ["f2", "f3", "f4"], "f3");
    const after = reorderCluster(s, "f4", -1);
    const span = (st: RankState) => st.session!.unconfirmed.indexOf("f1");
    expect(span(after)).toBe(span(s));
  });

  it("clamps inside the group rather than escaping it", () => {
    const s = groupFilms(startRun(tier(8), RATING), ["f2", "f3", "f4"], "f3");
    const after = reorderCluster(s, "f2", -5);
    expect(after.session!.clusters![0]).toEqual(["f2", "f3", "f4"]);
  });

  it("records nothing and commits nothing", () => {
    // A group's internal order is an assertion, not a comparison — nobody was
    // shown these two side by side. A row here would be evidence for a duel that
    // never happened, and relations.ts would read it back as fact.
    const s = groupFilms(startRun(tier(8), RATING), ["f2", "f3", "f4"], "f3");
    const after = reorderCluster(s, "f4", -2);
    expect(after.journal).toEqual([]);
    expect(after.films.every((f) => f.lock === undefined)).toBe(true);
    expect(after.films.map((f) => f.score)).toEqual(s.films.map((f) => f.score));
  });

  it("survives to the confirm, placing the group in its corrected order", () => {
    let s = groupFilms(startRun(tier(5), RATING), ["f2", "f3", "f4"], "f4");
    s = reorderCluster(s, "f4", -2); // f4 to the front of the group
    while (s.session && !pendingConfirm(s)) s = choose(s, getPair(s)!.contender.id);
    s = confirm(s);
    expect(s.session!.confirmed).toEqual(["f4", "f2", "f3"]);
  });

  it("ignores a film that is not grouped", () => {
    const s = startRun(tier(6), RATING);
    expect(reorderCluster(s, "f2", 1)).toBe(s);
  });
});
