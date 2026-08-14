import { describe, expect, it } from "vitest";

import { buildList } from "@/lib/list";
import { applyRoughCut, type Bucket } from "@/lib/roughCut";
import { seedScore } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  rating: 4,
  score: seedScore(4),
  ...over,
});

const unplacedTitles = (films: Film[], tierIndex = 0) =>
  buildList(films).sections[tierIndex].unplaced.map((f) => f.title);

describe("buildList", () => {
  it("numbers only the films a lock has placed", () => {
    const model = buildList([
      film("a", { title: "A", score: 7900, lock: "hard" }),
      film("b", { title: "B", score: 7800 }),
      film("c", { title: "C", score: 7700, lock: "soft" }),
    ]);
    expect(model.sections[0].placed.map((r) => r.film.title)).toEqual(["A", "C"]);
    expect(model.sections[0].unplaced.map((f) => f.title)).toEqual(["B"]);
    expect(model.placedCount).toBe(2);
  });

  // A number is a position in the WHOLE library, so the gaps are the unplaced
  // films sitting visibly between them.
  it("ranks against everything, not just the placed", () => {
    const model = buildList([
      film("a", { title: "A", score: 7900, lock: "hard" }),
      film("b", { title: "B", score: 7800 }),
      film("c", { title: "C", score: 7700, lock: "hard" }),
    ]);
    expect(model.sections[0].placed.map((r) => r.rank)).toEqual([1, 3]);
  });
});

// ── The bug this file was written for ──────────────────────────────────────
//
// Rough Cut writes `score` and deliberately writes no `lock`, so every film it
// touches stays UN-RNKD and lands in `unplaced`. That block used to sort
// alphabetically, which threw away the only decision the user had made: a tier
// carefully dealt into upper, middle and lower opened as an A-Z list.
describe("the unplaced block, after a Rough Cut", () => {
  const cut = (films: Film[], pairs: [string, Bucket][]) =>
    applyRoughCut(films, 4, new Map<string, Bucket>(pairs));

  it("shows the piles in the order they were dealt", () => {
    // Titles chosen so A-Z is the exact REVERSE of the cut.
    const films = [
      film("z", { title: "Zodiac" }),
      film("m", { title: "Memento" }),
      film("a", { title: "Alien" }),
    ];
    const after = cut(films, [["z", "top"], ["m", "middle"], ["a", "bottom"]]);
    expect(unplacedTitles(after)).toEqual(["Zodiac", "Memento", "Alien"]);
  });

  it("keeps every member of a pile together", () => {
    const films = ["a", "b", "c", "d"].map((id) => film(id, { title: id.toUpperCase() }));
    const after = cut(films, [
      ["a", "bottom"],
      ["b", "top"],
      ["c", "bottom"],
      ["d", "top"],
    ]);
    const shown = unplacedTitles(after);
    expect(shown.slice(0, 2).sort()).toEqual(["B", "D"]);
    expect(shown.slice(2).sort()).toEqual(["A", "C"]);
  });

  it("survives a second pass that refines one pile", () => {
    const films = ["a", "b", "c"].map((id) => film(id, { title: id.toUpperCase() }));
    const once = cut(films, [["a", "top"], ["b", "top"], ["c", "bottom"]]);
    // Refine the upper pile: B above A. C must stay at the bottom throughout.
    const twice = applyRoughCut(once, 4, new Map<string, Bucket>([["b", "top"], ["a", "bottom"]]));
    const shown = unplacedTitles(twice);
    expect(shown.indexOf("B")).toBeLessThan(shown.indexOf("A"));
    expect(shown[shown.length - 1]).toBe("C");
  });
});

// The tiebreak is what makes sorting by score safe rather than merely better.
describe("a tier nobody has touched", () => {
  it("still reads alphabetically, because every seed score is identical", () => {
    const films = [
      film("c", { title: "Carrie" }),
      film("a", { title: "Akira" }),
      film("b", { title: "Brazil" }),
    ];
    expect(films.every((f) => f.score === films[0].score)).toBe(true);
    expect(unplacedTitles(films)).toEqual(["Akira", "Brazil", "Carrie"]);
  });

  it("orders equal scores the same way on every build, so rows cannot swap", () => {
    const films = [film("b", { title: "Brazil" }), film("a", { title: "Akira" })];
    expect(unplacedTitles(films)).toEqual(unplacedTitles([...films].reverse()));
  });
});
