import { describe, expect, it } from "vitest";

import { buildGoals, byUrgency, type Goal } from "@/lib/goals";
import type { SavedList } from "@/lib/lists";
import { seedScore, tierMax, tierMin } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  rating: 3,
  score: seedScore(3),
  ...over,
});

/** n films in a tier, all on the seed score, so the tier reads as uncut. */
const tier = (n: number, rating: Film["rating"], over: Partial<Film> = {}): Film[] =>
  Array.from({ length: n }, (_, i) =>
    film(`${rating}-${i}`, { rating, score: seedScore(rating), ...over }),
  );

const list = (name: string, source: string, over: Partial<SavedList> = {}): SavedList => ({
  id: `${source}-${name}`,
  name,
  source,
  savedAt: "2026-08-15T10:00:00.000Z",
  entries: [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
  ],
  ...over,
});

const find = (goals: Goal[], title: string) => goals.find((g) => g.title === title);

describe("library goals", () => {
  it("offers one per tier you own films in, and none for empty tiers", () => {
    const { library } = buildGoals([...tier(3, 4), ...tier(2, 1)]);
    expect(library).toHaveLength(2);
    expect(library.map((g) => g.total).sort()).toEqual([2, 3]);
  });

  it("is complete only when every film in the tier is placed", () => {
    const placed = tier(3, 4, { lock: "hard" });
    const { library } = buildGoals(placed);
    expect(library[0].complete).toBe(true);
    expect(library[0].note).toMatch(/settled/i);

    const partial = [...tier(2, 4, { lock: "hard" }), ...tier(1, 4)];
    expect(buildGoals(partial).library[0].complete).toBe(false);
  });

  it("counts soft locks as placed, the same as the list does", () => {
    const { library } = buildGoals(tier(2, 4, { lock: "soft" }));
    expect(library[0].done).toBe(2);
    expect(library[0].complete).toBe(true);
  });
});

// The cheap pass should be offered instead of a climb of several thousand duels,
// but only where it actually saves anything and only if it has not been done.
describe("the Rough Cut hint", () => {
  it("is set on a big tier nobody has cut", () => {
    const { library } = buildGoals(tier(40, 3));
    expect(library[0].roughCutFirst).toBe(true);
    // The suggestion is carried by the flag, which the row turns into its verb.
    // It is deliberately NOT in the note: as a sentence it repeated on seven
    // rows of the real library and stopped being read.
    expect(library[0].note).toBe("40 films");
  });

  it("is absent on a small tier, where climbing is quicker than ceremony", () => {
    const { library } = buildGoals(tier(5, 3));
    expect(library[0].roughCutFirst).toBeUndefined();
  });

  // A cut tier has films above and below the middle third. That is the only
  // record a cut leaves, and it is what `bandsOf` reads.
  it("is absent once the tier has been cut", () => {
    const lo = tierMin(3);
    const hi = tierMax(3);
    const cut = [
      ...tier(20, 3).map((f, i) => ({ ...f, id: `t${i}`, score: hi - 10 })),
      ...tier(20, 3).map((f, i) => ({ ...f, id: `b${i}`, score: lo + 10 })),
    ];
    expect(buildGoals(cut).library[0].roughCutFirst).toBeUndefined();
  });

  it("is absent on a finished tier, however big", () => {
    const { library } = buildGoals(tier(40, 3, { lock: "hard" }));
    expect(library[0].roughCutFirst).toBeUndefined();
  });
});

describe("personal goals", () => {
  const withCredits = [
    ...tier(4, 5, { director: "Denis Villeneuve", genres: ["Sci-Fi"], cast: ["Amy Adams"] }),
    ...tier(3, 4, { director: "Denis Villeneuve", genres: ["Sci-Fi"], cast: ["Amy Adams"] }),
  ];

  it("suggests the director you rate highest", () => {
    const { personal } = buildGoals(withCredits);
    const g = find(personal, "Denis Villeneuve");
    expect(g).toBeDefined();
    expect(g!.subject.kind).toBe("director");
    expect(g!.complete).toBe(false);
    expect(g!.note).toBe("7 films");
  });

  it("suggests the genre you own most of", () => {
    const g = find(buildGoals(withCredits).personal, "Sci-Fi");
    expect(g?.subject.kind).toBe("genre");
  });

  // A keyword is not a RankSubject and nothing can start a run over one, so
  // offering it would be a goal you cannot begin.
  it("never suggests a subgenre, which cannot be run", () => {
    const tagged = withCredits.map((f) => ({ ...f, keywords: ["slasher"] }));
    expect(find(buildGoals(tagged).personal, "slasher")).toBeUndefined();
  });

  // `startRun` throws below two films.
  it("skips anyone with only one film, because the run would throw", () => {
    const solo = [film("x", { director: "Solo Person", genres: ["Noir"] })];
    expect(find(buildGoals(solo).personal, "Solo Person")).toBeUndefined();
  });

  it("says nothing at all about a library with no credits yet", () => {
    expect(buildGoals(tier(5, 3)).personal).toEqual([]);
  });
});

describe("completion, read off the saved lists", () => {
  const films = tier(4, 5, { director: "Denis Villeneuve", genres: ["Sci-Fi"] });

  it("ticks a goal once a matching ranking has been saved", () => {
    const { personal } = buildGoals(films, [list("Denis Villeneuve", "Director")]);
    const g = find(personal, "Denis Villeneuve")!;
    expect(g.complete).toBe(true);
    expect(g.savedAt).toBe("2026-08-15T10:00:00.000Z");
    expect(g.note).toMatch(/ranked/i);
  });

  it("matches whatever the credit's casing was", () => {
    const { personal } = buildGoals(films, [list("denis VILLENEUVE", "director")]);
    expect(find(personal, "Denis Villeneuve")!.complete).toBe(true);
  });

  // A director and a genre could share a name; the kind is half the key.
  it("does not tick a director because a genre of the same name was saved", () => {
    const { personal } = buildGoals(films, [list("Denis Villeneuve", "Genre")]);
    expect(find(personal, "Denis Villeneuve")!.complete).toBe(false);
  });

  it("leaves everything unticked when nothing has been saved", () => {
    expect(buildGoals(films).personal.every((g) => !g.complete)).toBe(true);
  });
});

describe("byUrgency", () => {
  const g = (title: string, total: number, complete: boolean): Goal => ({
    key: title,
    subject: { kind: "genre", name: title },
    title,
    note: "",
    done: complete ? total : 0,
    total,
    complete,
  });

  it("puts unfinished work first and the biggest pile at the top of it", () => {
    const out = byUrgency([g("small", 5, false), g("done", 99, true), g("big", 50, false)]);
    expect(out.map((x) => x.title)).toEqual(["big", "small", "done"]);
  });
});
