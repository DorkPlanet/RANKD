import { describe, expect, it } from "vitest";

import type { Judgement } from "@/lib/log";
import {
  changedYourMind,
  countriesOf,
  decadeClash,
  leastRead,
  longestSitting,
  MIN_FOR_TRAIT,
  overruledYourStars,
  runtimeBias,
  SITTING_GAP_MS,
  timeWatched,
  whenYouRank,
} from "@/lib/watching";
import { seedScore } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  rating: 4,
  score: seedScore(4),
  ...over,
});

let t = Date.UTC(2026, 0, 1, 12, 0, 0);
const duel = (a: string, b: string, o: Judgement["o"], at = (t += 60_000)): Judgement => ({
  id: `${a}-${b}-${at}`,
  a,
  b,
  o,
  m: "shuffle",
  t: at,
});

describe("time watched", () => {
  it("adds up only the runtimes it actually has", () => {
    const films = [film("a", { runtime: 90 }), film("b", { runtime: 120 }), film("c")];
    expect(timeWatched(films)).toEqual({ minutes: 210, known: 2, total: 3 });
  });

  // A missing runtime must not be guessed at with an average. A new library has
  // none of them, and a headline figure that quietly invents most of itself is
  // worse than one that says how much it is sure of.
  it("does not invent a runtime for films that have none", () => {
    expect(timeWatched([film("a"), film("b")])).toEqual({ minutes: 0, known: 0, total: 2 });
  });
});

describe("do you pick the longer film", () => {
  const long = (i: number) => film(`L${i}`, { runtime: 160 });
  const short = (i: number) => film(`S${i}`, { runtime: 85 });

  it("counts a win for whichever side was longer", () => {
    const films = Array.from({ length: 30 }, (_, i) => [long(i), short(i)]).flat();
    const log = Array.from({ length: 30 }, (_, i) => duel(`L${i}`, `S${i}`, "a"));
    expect(runtimeBias(films, log)).toEqual({ longer: 30, of: 30 });
  });

  it("says nothing at all below the floor", () => {
    const films = [long(0), short(0)];
    expect(runtimeBias(films, [duel("L0", "S0", "a")])).toBeNull();
  });

  it("ignores draws and equal-length pairs", () => {
    const films = Array.from({ length: MIN_FOR_TRAIT + 5 }, (_, i) => [long(i), short(i)]).flat();
    const log = [
      ...Array.from({ length: MIN_FOR_TRAIT }, (_, i) => duel(`L${i}`, `S${i}`, "a")),
      duel(`L${MIN_FOR_TRAIT}`, `S${MIN_FOR_TRAIT}`, "draw"),
    ];
    expect(runtimeBias(films, log)?.of).toBe(MIN_FOR_TRAIT);
  });
});

describe("changed your mind", () => {
  it("counts a pair once however many times it flipped", () => {
    const log = [duel("a", "b", "a"), duel("a", "b", "b"), duel("a", "b", "a")];
    expect(changedYourMind(log)).toBe(1);
  });

  it("is not fooled by the same answer twice", () => {
    expect(changedYourMind([duel("a", "b", "a"), duel("a", "b", "a")])).toBe(0);
  });

  it("reads a pair the same way round either way", () => {
    expect(changedYourMind([duel("a", "b", "a"), duel("b", "a", "a")])).toBe(1);
  });

  it("ignores draws, which are not a position to contradict", () => {
    expect(changedYourMind([duel("a", "b", "a"), duel("a", "b", "draw")])).toBe(0);
  });
});

describe("overruled your own stars", () => {
  it("counts a lower-rated film beating a higher one", () => {
    const films = [film("low", { rating: 2 }), film("high", { rating: 5 })];
    expect(overruledYourStars(films, [duel("low", "high", "a")])).toBe(1);
  });

  it("reports nothing rather than reaching for something to say", () => {
    const films = [film("a", { rating: 4 }), film("b", { rating: 4 })];
    expect(overruledYourStars(films, [duel("a", "b", "a")])).toBe(0);
  });
});

describe("decade clash", () => {
  it("names the decade that wins and how often", () => {
    const films = Array.from({ length: MIN_FOR_TRAIT }, (_, i) => [
      film(`n${i}`, { year: "1995" }),
      film(`t${i}`, { year: "2021" }),
    ]).flat();
    const log = Array.from({ length: MIN_FOR_TRAIT }, (_, i) => duel(`n${i}`, `t${i}`, "a"));
    expect(decadeClash(films, log)).toMatchObject({ won: "1990s", lost: "2020s", of: MIN_FOR_TRAIT });
  });

  it("ignores two films from the same decade", () => {
    const films = [film("a", { year: "1994" }), film("b", { year: "1997" })];
    expect(decadeClash(films, Array.from({ length: 40 }, () => duel("a", "b", "a")))).toBeNull();
  });
});

describe("when you rank", () => {
  it("finds the hour with the most answers", () => {
    const at = (h: number, i: number) => new Date(2026, 0, 2, h, i).getTime();
    const log = [
      ...Array.from({ length: 30 }, (_, i) => duel("a", "b", "a", at(23, i))),
      ...Array.from({ length: 5 }, (_, i) => duel("a", "b", "a", at(9, i))),
    ];
    expect(whenYouRank(log)?.hour).toBe(23);
  });

  it("says nothing off a handful of rows", () => {
    expect(whenYouRank([duel("a", "b", "a")])).toBeNull();
  });
});

describe("longest sitting", () => {
  it("breaks the run at a long gap", () => {
    const base = Date.UTC(2026, 0, 3, 20, 0, 0);
    const log = [
      duel("a", "b", "a", base),
      duel("a", "b", "a", base + 60_000),
      duel("a", "b", "a", base + 120_000),
      // Next evening. Measured from the LAST row, not from the first — the gap
      // that matters is the one between consecutive answers.
      duel("a", "b", "a", base + 120_000 + SITTING_GAP_MS + 1),
      duel("a", "b", "a", base + 120_000 + SITTING_GAP_MS + 61_000),
    ];
    expect(longestSitting(log)).toBe(3);
  });

  // A merged log from two devices interleaves by id, not by time. Reading that
  // as one long evening would invent a sitting nobody sat.
  it("sorts before counting, so a merged log cannot invent a streak", () => {
    const base = Date.UTC(2026, 0, 4, 20, 0, 0);
    const shuffled = [
      duel("a", "b", "a", base + 120_000),
      duel("a", "b", "a", base),
      duel("a", "b", "a", base + 60_000),
    ];
    expect(longestSitting(shuffled)).toBe(3);
  });

  it("is zero for a log with nothing in it", () => {
    expect(longestSitting([])).toBe(0);
  });
});

describe("the one Rankd could not read", () => {
  it("names the film asked about most", () => {
    const films = [film("a"), film("b"), film("c")];
    const log = [duel("a", "b", "a"), duel("a", "c", "a"), duel("b", "c", "a")];
    expect(leastRead(films, log)?.film.id).toBe("a");
    expect(leastRead(films, log)?.duels).toBe(2);
  });

  it("ignores a film the library no longer holds", () => {
    const log = [duel("gone", "a", "a"), duel("gone", "a", "a")];
    expect(leastRead([film("a")], log)?.film.id).toBe("a");
  });
});

describe("where they were made", () => {
  it("counts a co-production once for each country", () => {
    const films = [film("a", { countries: ["US", "GB"] }), film("b", { countries: ["US"] })];
    const { list, known } = countriesOf(films);
    expect(known).toBe(2);
    expect(list).toEqual([
      { code: "US", films: 2 },
      { code: "GB", films: 1 },
    ]);
  });

  // Country arrives with the artwork, so a fresh import has none. `known` has to
  // be separate or a half-swept library reads as though most of what you watch
  // came from nowhere.
  it("counts only the films whose country is actually known", () => {
    expect(countriesOf([film("a", { countries: ["JP"] }), film("b")]).known).toBe(1);
  });

  it("does not double-count a country listed twice on one film", () => {
    expect(countriesOf([film("a", { countries: ["FR", "FR"] })]).list).toEqual([{ code: "FR", films: 1 }]);
  });
});
