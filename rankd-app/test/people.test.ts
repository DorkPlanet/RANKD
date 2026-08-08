import { describe, expect, it } from "vitest";

import { filmsBy, mergeCredits, peopleIn, rankByBelief } from "@/lib/people";
import type { Belief } from "@/lib/bayes";
import type { Film } from "@/lib/types";

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  year: "2000",
  rating: 3,
  score: 5000,
  ...over,
});

describe("peopleIn", () => {
  it("counts a director across their films, most first", () => {
    const people = peopleIn([
      film("a", { director: "Denis Villeneuve" }),
      film("b", { director: "Denis Villeneuve" }),
      film("c", { director: "Michael Mann" }),
    ]);
    expect(people[0]).toEqual({ name: "Denis Villeneuve", role: "director", count: 2 });
    expect(people[1]).toEqual({ name: "Michael Mann", role: "director", count: 1 });
  });

  // Directing and acting are different questions about the same person, and a
  // merged entry could not answer either one unambiguously.
  it("keeps the same name separate when they both direct and act", () => {
    const people = peopleIn([
      film("a", { director: "Clint Eastwood", cast: ["Clint Eastwood"] }),
      film("b", { cast: ["Clint Eastwood"] }),
    ]);
    expect(people).toContainEqual({ name: "Clint Eastwood", role: "director", count: 1 });
    expect(people).toContainEqual({ name: "Clint Eastwood", role: "actor", count: 2 });
  });

  it("has nothing to say about a library with no credits yet", () => {
    expect(peopleIn([film("a"), film("b")])).toEqual([]);
  });
});

describe("filmsBy", () => {
  const library = [
    film("dir1", { director: "Mann", cast: ["De Niro"] }),
    film("dir2", { director: "Mann" }),
    film("act1", { director: "Scorsese", cast: ["De Niro", "Pesci"] }),
  ];

  it("finds a director's films", () => {
    expect(filmsBy(library, { name: "Mann", role: "director", count: 2 }).map((f) => f.id)).toEqual([
      "dir1",
      "dir2",
    ]);
  });

  it("finds an actor's films wherever they appear in the cast", () => {
    expect(filmsBy(library, { name: "De Niro", role: "actor", count: 2 }).map((f) => f.id)).toEqual([
      "dir1",
      "act1",
    ]);
  });

  // The role is part of the question: asking for films Mann acted in must not
  // return the ones he directed.
  it("does not answer the other role's question", () => {
    expect(filmsBy(library, { name: "Mann", role: "actor", count: 0 })).toEqual([]);
  });
});

describe("rankByBelief", () => {
  const b = (mean: number): Belief => ({ mean, spread: 1 });

  // The whole point of this feature: the evidence outranks the star bucket.
  it("puts a well-regarded 3-star above a 4-star when the evidence says so", () => {
    const films = [film("four", { rating: 4, score: 7000 }), film("three", { rating: 3, score: 5000 })];
    const beliefs = new Map([
      ["four", b(6.0)],
      ["three", b(8.5)],
    ]);
    expect(rankByBelief(films, beliefs).map((f) => f.id)).toEqual(["three", "four"]);
  });

  // Without this an unranked filmography would come back in library order, which
  // looks like a bug rather than an absence of evidence.
  it("falls back to the star rating for films the model has never seen", () => {
    const films = [film("low", { rating: 2 }), film("high", { rating: 5 }), film("mid", { rating: 3 })];
    expect(rankByBelief(films, new Map()).map((f) => f.id)).toEqual(["high", "mid", "low"]);
  });

  it("breaks ties on score, so a placed film sits above an unplaced peer", () => {
    const films = [film("unplaced", { rating: 3, score: 5000 }), film("placed", { rating: 3, score: 5900 })];
    expect(rankByBelief(films, new Map()).map((f) => f.id)).toEqual(["placed", "unplaced"]);
  });

  it("does not mutate the array it is given", () => {
    const films = [film("b", { rating: 2 }), film("a", { rating: 5 })];
    rankByBelief(films, new Map());
    expect(films.map((f) => f.id)).toEqual(["b", "a"]);
  });
});

describe("mergeCredits", () => {
  it("marks which of a filmography you have logged and which you have not", () => {
    const mine = [film("heat", { title: "Heat", year: "1995" })];
    const rows = mergeCredits(mine, [
      { title: "Heat", year: "1995" },
      { title: "Collateral", year: "2004" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].film?.id).toBe("heat");
    expect(rows[1].film).toBeUndefined();
    expect(rows[1].title).toBe("Collateral");
  });

  // Your own poster wins: it is already fetched and already on screen elsewhere,
  // so preferring the filmography's would make the same film flicker between two
  // images depending on which screen you came from.
  it("prefers the poster already in the library", () => {
    const mine = [film("heat", { title: "Heat", year: "1995", poster: "mine.jpg" })];
    const rows = mergeCredits(mine, [{ title: "Heat", year: "1995", poster: "theirs.jpg" }]);
    expect(rows[0].poster).toBe("mine.jpg");
  });

  // A film you own must never vanish because TMDb lists the credit differently.
  it("keeps library films the filmography does not mention", () => {
    const mine = [film("obscure", { title: "Obscure", year: "1988" })];
    const rows = mergeCredits(mine, [{ title: "Famous", year: "1990" }]);
    expect(rows.map((r) => r.title)).toEqual(["Famous", "Obscure"]);
    expect(rows[1].film?.id).toBe("obscure");
  });

  it("is case-insensitive on the title, since the two sources are typed apart", () => {
    const mine = [film("heat", { title: "HEAT", year: "1995" })];
    const rows = mergeCredits(mine, [{ title: "Heat", year: "1995" }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].film?.id).toBe("heat");
  });
});
