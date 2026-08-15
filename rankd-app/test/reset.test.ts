import { describe, expect, it } from "vitest";

import { resetRanking } from "@/lib/reset";
import { seedScore } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (over: Partial<Film> = {}): Film => ({
  id: "heat",
  title: "Heat",
  year: "1995",
  rating: 4,
  score: 7850,
  lock: "hard",
  duels: 12,
  poster: "/heat.jpg",
  director: "Michael Mann",
  genres: ["Crime"],
  ...over,
});

describe("resetRanking", () => {
  it("keeps everything that came from the import or from TMDb", () => {
    const [out] = resetRanking([film()]);
    expect(out).toMatchObject({
      id: "heat",
      title: "Heat",
      year: "1995",
      rating: 4,
      poster: "/heat.jpg",
      director: "Michael Mann",
      genres: ["Crime"],
    });
  });

  it("removes the lock, whichever kind it was", () => {
    const out = resetRanking([film({ lock: "hard" }), film({ id: "b", lock: "soft" })]);
    expect(out.every((f) => f.lock === undefined)).toBe(true);
  });

  // The score matters as much as the lock: left behind, an "unranked" library
  // still sorts itself into last session's order the moment anything reads it.
  it("returns the score to the tier's midpoint", () => {
    const [out] = resetRanking([film({ rating: 4, score: 7850 })]);
    expect(out.score).toBe(seedScore(4));
  });

  it("keeps each film inside its own tier's band", () => {
    const out = resetRanking([film({ rating: 5 }), film({ id: "b", rating: 1 })]);
    expect(out[0].score).toBe(seedScore(5));
    expect(out[1].score).toBe(seedScore(1));
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("clears the duel count", () => {
    const [out] = resetRanking([film({ duels: 12 })]);
    expect(out.duels).toBeUndefined();
  });

  it("does not mutate what it was given", () => {
    const original = film();
    resetRanking([original]);
    expect(original.lock).toBe("hard");
    expect(original.score).toBe(7850);
  });

  it("survives an empty library", () => {
    expect(resetRanking([])).toEqual([]);
  });
});
