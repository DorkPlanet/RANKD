import { describe, expect, it } from "vitest";

import { isUntouchedSeed } from "@/lib/store";
import { SEED_FILMS } from "@/lib/seed";
import type { Film } from "@/lib/types";

const seed = (): Film[] => SEED_FILMS.map((f) => ({ ...f }));

// This is the check that decides whether a device counts as having a library
// worth protecting, which is what stands between a new phone and a conflict
// chooser it has no business being shown.
describe("isUntouchedSeed", () => {
  it("recognises a fresh install", () => {
    expect(isUntouchedSeed(seed())).toBe(true);
  });

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
