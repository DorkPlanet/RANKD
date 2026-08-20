import { describe, expect, it } from "vitest";

import type { Judgement } from "@/lib/log";
import { notesFor, type Note } from "@/lib/notes";
import { seedScore } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  rating: 4,
  score: seedScore(4),
  ...over,
});

const has = (notes: Note[], id: string) => notes.find((n) => n.id === id);

let clock = Date.UTC(2026, 0, 1, 20, 0, 0);
const duel = (a: string, b: string, o: Judgement["o"]): Judgement => ({
  id: `${a}-${b}-${(clock += 1000)}`,
  a,
  b,
  o,
  m: "shuffle",
  t: clock,
});

describe("every note names something", () => {
  it("never returns one with an empty subject", () => {
    const films = [
      ...Array.from({ length: 40 }, (_, i) =>
        film(`h${i}`, { genres: ["Horror"], runtime: 100 + i, cast: ["Kurt Russell"], director: "John Carpenter", year: "1982" }),
      ),
      ...Array.from({ length: 12 }, (_, i) =>
        film(`d${i}`, { genres: ["Drama"], runtime: 120, lock: "hard", score: 9000 - i, year: "1995", director: "Michael Mann" }),
      ),
    ];
    const notes = notesFor(films, []);
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n.subject.trim().length).toBeGreaterThan(0);
  });
});

describe("a thin library says less rather than worse", () => {
  it("returns nothing at all for a handful of films", () => {
    expect(notesFor([film("a"), film("b")], [])).toEqual([]);
  });

  it("does not invent a blind spot from a genre nobody owns much of", () => {
    const films = Array.from({ length: 6 }, (_, i) => film(`w${i}`, { genres: ["Western"] }));
    expect(has(notesFor(films, []), "blind-spot")).toBeUndefined();
  });
});

describe("the blind spot", () => {
  it("names the genre with the biggest gap between owned and ranked", () => {
    const films = [
      ...Array.from({ length: 30 }, (_, i) => film(`h${i}`, { genres: ["Horror"] })),
      ...Array.from({ length: 20 }, (_, i) => film(`c${i}`, { genres: ["Comedy"], lock: "hard" })),
    ];
    const note = has(notesFor(films, []), "blind-spot");
    expect(note?.before).toContain("horror");
    expect(note?.subject).toBe("none");
  });
});

describe("your shelf against your taste", () => {
  it("only fires when the two directors differ", () => {
    // Everything by one person: nothing to disagree about.
    const films = Array.from({ length: 12 }, (_, i) =>
      film(`s${i}`, { director: "Spielberg", lock: "hard", score: 8000 + i }),
    );
    expect(has(notesFor(films, []), "own-vs-rank")).toBeUndefined();
  });

  it("names the one you rank higher, not the one you own most of", () => {
    const films = [
      ...Array.from({ length: 10 }, (_, i) => film(`s${i}`, { director: "Spielberg", lock: "hard", score: 4000 + i })),
      ...Array.from({ length: 4 }, (_, i) => film(`c${i}`, { director: "Carpenter", lock: "hard", score: 9000 + i })),
    ];
    const note = has(notesFor(films, []), "own-vs-rank");
    expect(note?.before).toContain("Spielberg");
    expect(note?.subject).toBe("Carpenter");
  });
});

describe("no short masterpieces", () => {
  it("stays quiet when a short film sits at the top rating", () => {
    const films = Array.from({ length: 10 }, (_, i) =>
      film(`f${i}`, { rating: 5, runtime: i === 0 ? 78 : 150 }),
    );
    expect(has(notesFor(films, []), "no-short")).toBeUndefined();
  });

  it("reports the floor when there genuinely is one", () => {
    const films = Array.from({ length: 10 }, (_, i) => film(`f${i}`, { rating: 5, runtime: 120 + i }));
    expect(has(notesFor(films, []), "no-short")?.subject).toBe("2h 0m");
  });
});

describe("against your own stars", () => {
  // Only cross-tier duels can produce this, and those only happen in curated
  // runs — so an empty answer is the correct one far more often than not.
  it("says nothing when no lower-rated film ever won", () => {
    const films = [film("a", { rating: 5 }), film("b", { rating: 3 })];
    const log = Array.from({ length: 10 }, () => duel("a", "b", "a"));
    expect(has(notesFor(films, log), "against-stars")).toBeUndefined();
  });

  it("names the film that did it", () => {
    const films = [film("under", { rating: 2, title: "Under" }), film("over", { rating: 5 })];
    const log = Array.from({ length: 4 }, () => duel("under", "over", "a"));
    const note = has(notesFor(films, log), "against-stars");
    expect(note?.before).toContain("Under");
    expect(note?.subject).toBe("4 films");
  });
});

describe("the film Rankd could not settle", () => {
  it("needs a log worth reading before it says anything", () => {
    const films = [film("a"), film("b")];
    expect(has(notesFor(films, [duel("a", "b", "a")]), "never-settled")).toBeUndefined();
  });

  it("names the film asked about most", () => {
    const films = [film("a", { title: "Heat" }), film("b"), film("c")];
    const log = [
      ...Array.from({ length: 30 }, () => duel("a", "b", "a")),
      // Also against c, so "a" is the one asked about most rather than "b",
      // which the first version of this test got backwards.
      ...Array.from({ length: 20 }, () => duel("a", "c", "a")),
    ];
    expect(has(notesFor(films, log), "never-settled")?.subject).toBe("Heat");
  });
});
