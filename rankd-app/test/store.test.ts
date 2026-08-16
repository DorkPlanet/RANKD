import { describe, expect, it } from "vitest";

import { isUntouchedSeed, loadFilms } from "@/lib/store";
import type { Film } from "@/lib/types";

// The ten films the OLD build handed every new browser. Written out here rather
// than imported, because the module that held them is gone — a new library is
// empty now. This set only still matters for devices that ran that build, which
// is exactly why the check has to keep recognising it, and why the fixture has
// to be a literal rather than a reference to something that could change.
const LEGACY_IDS = [
  "the-godfather-1972",
  "dune-2021",
  "inception-2010",
  "the-dark-knight-2008",
  "interstellar-2014",
  "la-la-land-2016",
  "ex-machina-2014",
  "sicario-2015",
  "gone-girl-2014",
  "drive-2011",
];

const seed = (): Film[] =>
  LEGACY_IDS.map((id) => ({ id, title: id, rating: 4 as const, score: 7501 }));

// This is the check that decides whether a device counts as having a library
// worth protecting, which is what stands between a new phone and a conflict
// chooser it has no business being shown.
describe("isUntouchedSeed", () => {
  it("recognises a device still holding the old starter set", () => {
    expect(isUntouchedSeed(seed())).toBe(true);
  });

  it("does not call an empty library a starter set", () => {
    expect(isUntouchedSeed([])).toBe(false);
  });
});

describe("a new browser", () => {
  it("has no library at all, rather than somebody else's films", () => {
    const store = new Map<string, string>();
    const g = globalThis as unknown as Record<string, unknown>;
    g.window = {};
    g.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    expect(loadFilms()).toEqual([]);
  });

  it("treats an unreadable library as empty rather than replacing it", () => {
    localStorage.setItem("rankd-app-v1", "{not json");
    expect(loadFilms()).toEqual([]);
  });
});

describe("isUntouchedSeed, in detail", () => {

  it("says no to a real library", () => {
    const big = Array.from({ length: 861 }, (_, i) => ({
      id: `f${i}`,
      title: `F${i}`,
      rating: 3 as const,
      score: 5500,
    }));
    expect(isUntouchedSeed(big)).toBe(false);
  });

  // The moment a judgement lands the seed stops being disposable, because now
  // there is something on it that only exists here.
  it("stops counting as untouched once a film is placed", () => {
    const films = seed();
    films[0].lock = "hard";
    expect(isUntouchedSeed(films)).toBe(false);
  });

  it("stops counting as untouched once a duel has been fought", () => {
    const films = seed();
    films[0].duels = 1;
    expect(isUntouchedSeed(films)).toBe(false);
  });

  // A soft lock is the model's opinion rather than the user's, but it is still
  // derived from duels that happened here.
  it("counts a soft lock as touched too", () => {
    const films = seed();
    films[0].lock = "soft";
    expect(isUntouchedSeed(films)).toBe(false);
  });

  it("says no when a film has been added", () => {
    const films = [...seed(), { id: "extra", title: "Extra", rating: 4 as const, score: 7500 }];
    expect(isUntouchedSeed(films)).toBe(false);
  });

  it("says no when a film has been removed", () => {
    expect(isUntouchedSeed(seed().slice(1))).toBe(false);
  });

  // Same count, different films: an imported library that happens to be ten
  // films long is not the seed.
  it("says no to a same-sized library of different films", () => {
    const films = seed().map((f, i) => ({ ...f, id: `other-${i}` }));
    expect(isUntouchedSeed(films)).toBe(false);
  });

  it("says no to an empty library", () => {
    expect(isUntouchedSeed([])).toBe(false);
  });
});
