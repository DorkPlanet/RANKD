// Gathering films to travel together.
//
// The fatigue this answers: ten minutes into a climb you can see five films that
// plainly belong beside each other, and the pile makes you carry each one up
// separately. A cluster carries them up once.
//
// It is a user ASSERTION, on the same footing as flickToTop and skipToFilm — the
// player supplying an ordering directly rather than earning it a duel at a time.
// So the tests that matter most here are the ones about what it must NOT do:
// write judgements for pairs nobody was shown, or commit anything before a
// confirm.

import { describe, expect, it } from "vitest";

import {
  choose,
  clusterOf,
  confirm,
  getPair,
  groupFilms,
  pendingConfirm,
  startRun,
  ungroupFilm,
} from "@/lib/ladder";
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

const pile = (s: RankState) => s.session!.unconfirmed;
const shelf = (s: RankState) => s.session!.confirmed;

describe("forming a group", () => {
  it("gathers the films at the anchor's position, keeping pile order", () => {
    // f1, f4 and f6 belong next to f4. They collect where f4 already sat.
    const s = groupFilms(startRun(tier(8), RATING), ["f6", "f1", "f4"], "f4");
    expect(pile(s)).toEqual(["f0", "f2", "f3", "f1", "f4", "f6", "f5", "f7"]);
    expect(clusterOf(s.session!, "f6")).toEqual(["f1", "f4", "f6"]);
  });

  it("gathers at the ANCHOR, not at the best member", () => {
    // Gathering at the topmost member would quietly promote the whole group to
    // the best position any of them held — a claim nobody made.
    const s = groupFilms(startRun(tier(8), RATING), ["f1", "f6"], "f6");
    expect(pile(s).indexOf("f1")).toBeGreaterThan(pile(s).indexOf("f4"));
  });

  it("refuses a group of one, or one that does not contain its anchor", () => {
    const start = startRun(tier(6), RATING);
    expect(groupFilms(start, ["f2"], "f2")).toBe(start);
    expect(groupFilms(start, ["f2", "f3"], "f5")).toBe(start);
  });

  it("absorbs an overlapping group rather than letting two share a film", () => {
    let s = groupFilms(startRun(tier(8), RATING), ["f1", "f2"], "f2");
    s = groupFilms(s, ["f2", "f5"], "f5");
    expect(clusterOf(s.session!, "f1")).toEqual(["f1", "f2", "f5"]);
    expect(s.session!.clusters).toHaveLength(1);
  });

  it("commits nothing and records nothing", () => {
    const s = groupFilms(startRun(tier(8), RATING), ["f1", "f4", "f6"], "f4");
    expect(s.journal).toEqual([]);
    expect(s.films.every((f) => (f.duels ?? 0) === 0)).toBe(true);
    expect(s.films.every((f) => f.lock === undefined)).toBe(true);
    // Scores untouched: only a confirm moves the list.
    expect(s.films.map((f) => f.score)).toEqual(tier(8).map((f) => f.score));
  });
});

describe("a group climbing", () => {
  it("fights as one film, and the whole block moves", () => {
    // f4, f5 and f6 gather at f5, sitting above f7.
    let s = groupFilms(startRun(tier(8), RATING), ["f4", "f5", "f6"], "f5");
    expect(pile(s)).toEqual(["f0", "f1", "f2", "f3", "f4", "f5", "f6", "f7"]);

    // f7 climbs and beats the block's face.
    expect(getPair(s)!.contender.id).toBe("f7");
    expect(getPair(s)!.opponent.id).toBe("f6");
    s = choose(s, "f7");
    // It has to clear the ENTIRE block, not land inside it.
    expect(pile(s)).toEqual(["f0", "f1", "f2", "f3", "f7", "f4", "f5", "f6"]);
  });

  it("carries its members up when the block wins", () => {
    let s = groupFilms(startRun(tier(6), RATING), ["f4", "f5"], "f5");
    // f4/f5 are at the bottom, so the block is the contender; its face is f4.
    expect(getPair(s)!.contender.id).toBe("f4");
    expect(getPair(s)!.opponent.id).toBe("f3");

    s = choose(s, "f4"); // one tap places both
    expect(pile(s)).toEqual(["f0", "f1", "f2", "f4", "f5", "f3"]);
    expect(s.journal).toHaveLength(1); // one duel fought, one row written
  });

  it("places three films for one tap, all the way to the top", () => {
    let s = groupFilms(startRun(tier(5), RATING), ["f2", "f3", "f4"], "f4");
    let taps = 0;
    while (s.session && !pendingConfirm(s)) {
      const p = getPair(s)!;
      s = choose(s, p.contender.id); // the block wins everything
      taps++;
    }
    expect(pendingConfirm(s)!.id).toBe("f2"); // the block's face tops the pile
    expect(taps).toBe(2); // beat f1, beat f0 — not six duels
  });

  it("only the face is credited with the duel", () => {
    // Bumping every member's count would say those films had been compared, and
    // they have not been. The count is how much evidence a placement rests on.
    let s = groupFilms(startRun(tier(6), RATING), ["f4", "f5"], "f5");
    s = choose(s, "f4");
    const duels = (id: string) => s.films.find((f) => f.id === id)!.duels ?? 0;
    expect(duels("f4")).toBe(1);
    expect(duels("f3")).toBe(1);
    expect(duels("f5")).toBe(0);
  });
});

describe("confirming a group", () => {
  it("places every member, in the order it was carrying", () => {
    let s = groupFilms(startRun(tier(5), RATING), ["f2", "f3", "f4"], "f4");
    while (s.session && !pendingConfirm(s)) s = choose(s, getPair(s)!.contender.id);
    s = confirm(s);

    expect(shelf(s)).toEqual(["f2", "f3", "f4"]);
    expect(pile(s)).toEqual(["f0", "f1"]);
    for (const id of ["f2", "f3", "f4"]) {
      expect(s.films.find((f) => f.id === id)!.lock).toBe("hard");
    }
  });

  it("spends the cluster, so the run carries on without it", () => {
    let s = groupFilms(startRun(tier(5), RATING), ["f2", "f3", "f4"], "f4");
    while (s.session && !pendingConfirm(s)) s = choose(s, getPair(s)!.contender.id);
    s = confirm(s);
    expect(s.session!.clusters).toBeUndefined();
  });

  it("leaves the members in a descending run of scores", () => {
    let s = groupFilms(startRun(tier(5), RATING), ["f2", "f3", "f4"], "f4");
    while (s.session && !pendingConfirm(s)) s = choose(s, getPair(s)!.contender.id);
    s = confirm(s);
    const score = (id: string) => s.films.find((f) => f.id === id)!.score;
    expect(score("f2")).toBeGreaterThan(score("f3"));
    expect(score("f3")).toBeGreaterThan(score("f4"));
    expect(score("f4")).toBeGreaterThan(score("f0"));
  });

  it("confirms one film at a time when nothing is grouped", () => {
    let s = startRun(tier(4), RATING);
    while (s.session && !pendingConfirm(s)) s = choose(s, getPair(s)!.contender.id);
    s = confirm(s);
    expect(shelf(s)).toHaveLength(1);
  });
});

describe("ungrouping", () => {
  it("drops one film and leaves it where it stands", () => {
    const grouped = groupFilms(startRun(tier(8), RATING), ["f1", "f4", "f6"], "f4");
    const s = ungroupFilm(grouped, "f6");
    expect(clusterOf(s.session!, "f6")).toBeNull();
    expect(clusterOf(s.session!, "f1")).toEqual(["f1", "f4"]);
    expect(pile(s)).toEqual(pile(grouped)); // the pile itself does not move
  });

  it("dissolves a group that would be left with one member", () => {
    const grouped = groupFilms(startRun(tier(6), RATING), ["f2", "f4"], "f4");
    const s = ungroupFilm(grouped, "f2");
    expect(s.session!.clusters).toBeUndefined();
  });

  it("frees the film to climb on its own again", () => {
    let s = groupFilms(startRun(tier(6), RATING), ["f4", "f5"], "f5");
    expect(getPair(s)!.contender.id).toBe("f4"); // the block's face
    s = ungroupFilm(s, "f4");
    // f5 is the bottom film again and climbs by itself.
    expect(getPair(s)!.contender.id).toBe("f4");
    s = choose(s, "f4");
    expect(pile(s)).toEqual(["f0", "f1", "f2", "f4", "f3", "f5"]);
  });
});

describe("a pile with no groups", () => {
  it("behaves exactly as it always did", () => {
    // The k=1 case is the old code. Worth pinning: clusters were introduced by
    // rewriting the move and confirm paths, and this is the assertion that the
    // rewrite was a generalisation and not a change.
    let s = startRun(tier(6), RATING);
    const order: string[] = [];
    while (s.session) {
      if (pendingConfirm(s)) {
        order.push(s.session.unconfirmed[0]);
        s = confirm(s);
        continue;
      }
      s = choose(s, getPair(s)!.contender.id); // the climber wins everything
    }
    expect(order).toEqual(["f5", "f4", "f3", "f2", "f1", "f0"]);
  });
});
