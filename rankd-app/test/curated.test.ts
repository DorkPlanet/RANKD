import { describe, expect, it } from "vitest";

import { pileFor, poolForSubject } from "@/lib/curated";
import { liveFilms, liveViews, liveCard, MIN_LIVE_CARD } from "@/lib/card/live";
import { isLiveSubject, subjectEyebrow, subjectKey, subjectTitle } from "@/lib/subject";
import type { RankSubject } from "@/lib/subject";
import type { Film } from "@/lib/types";
import type { Rating } from "@/lib/tiers";

// The two halves of item 3: a run request that cannot be two requests, and a
// card for an order nobody sat down to make.

const film = (over: Partial<Film> & { id: string }): Film => ({
  title: over.id,
  rating: 4 as Rating,
  score: 7500,
  ...over,
});

const library = (): Film[] => [
  film({ id: "heat", director: "Michael Mann", score: 8100, lock: "hard", rating: 5 }),
  film({ id: "collateral", director: "Michael Mann", score: 7900, lock: "hard", rating: 5 }),
  film({ id: "thief", director: "Michael Mann", score: 7200, lock: "soft", rating: 4 }),
  film({ id: "drive", director: "Nicolas Refn", cast: ["Ryan Gosling"], score: 8000, lock: "hard", rating: 5 }),
  film({ id: "unplaced", director: "Nobody", score: 7500, rating: 4 }),
];

describe("poolForSubject", () => {
  it("finds a director's work", () => {
    expect(poolForSubject(library(), { kind: "director", name: "Michael Mann" }).map((f) => f.id)).toEqual([
      "heat",
      "collateral",
      "thief",
    ]);
  });

  it("finds an actor's, which lives on a different field", () => {
    expect(poolForSubject(library(), { kind: "actor", name: "Ryan Gosling" }).map((f) => f.id)).toEqual([
      "drive",
    ]);
  });

  // The important one. A tier is already ordered by the master list, so a run
  // over it would be a second, contradicting answer. Empty here means the
  // caller's own "not enough to duel" guard refuses it, with no special case.
  it("refuses a live subject, so no run can be started over one", () => {
    expect(poolForSubject(library(), { kind: "tier", rating: 5 })).toEqual([]);
    expect(poolForSubject(library(), { kind: "overall" })).toEqual([]);
  });
});

describe("pileFor", () => {
  it("merges guests by id rather than appending them", () => {
    const guest = film({ id: "manhunter", director: "Michael Mann", guest: true });
    const request = { subject: { kind: "director", name: "Michael Mann" } as const, guests: [guest] };
    const once = pileFor(library(), request, []);
    // Run the same request against its own output, which is what React does to
    // an updater in development. A blind concat doubled the pile here.
    const twice = pileFor(once.all, request, []);
    expect(once.order).toHaveLength(4);
    expect(twice.order).toHaveLength(4);
    expect(new Set(twice.all.map((f) => f.id)).size).toBe(twice.all.length);
  });

  it("truncates to the limit a genre picker asked for", () => {
    const films = library().map((f) => ({ ...f, genres: ["Crime"] }));
    const { order } = pileFor(films, { subject: { kind: "genre", name: "Crime" }, limit: 2 }, []);
    expect(order).toHaveLength(2);
  });

  it("leaves a guest out of the library it was borrowed into", () => {
    const guest = film({ id: "manhunter", director: "Michael Mann", guest: true });
    const { all } = pileFor(library(), { subject: { kind: "director", name: "Michael Mann" }, guests: [guest] }, []);
    expect(all.find((f) => f.id === "manhunter")?.guest).toBe(true);
  });
});

describe("live views", () => {
  it("takes placed films only, best first", () => {
    // `unplaced` sits at its tier's seed score. Including it would present the
    // import's own ordering back to the user as an opinion they gave.
    expect(liveFilms(library(), { kind: "overall" }).map((f) => f.id)).toEqual([
      "heat",
      "drive",
      "collateral",
      "thief",
    ]);
  });

  it("scopes a tier subject to that tier", () => {
    expect(liveFilms(library(), { kind: "tier", rating: 5 }).map((f) => f.id)).toEqual([
      "heat",
      "drive",
      "collateral",
    ]);
  });

  // 4★ holds only `thief` once `unplaced` is excluded, which is below the
  // floor — so the fixture proves the ordering AND the omission at once.
  it("offers overall first, then tiers in star order", () => {
    expect(liveViews(library()).map((v) => subjectKey(v.subject))).toEqual(["overall", "tier:5"]);
  });

  it("includes a tier once it has two placed films", () => {
    const plus = [...library(), film({ id: "manhunter", rating: 4, lock: "hard", score: 7100 })];
    expect(liveViews(plus).map((v) => subjectKey(v.subject))).toEqual(["overall", "tier:5", "tier:4"]);
  });

  it("omits a tier with too little order to be a ranking", () => {
    const thin = [film({ id: "only", rating: 2, lock: "hard", score: 3000 })];
    expect(liveViews(thin).some((v) => subjectKey(v.subject) === "tier:2")).toBe(false);
  });

  it("draws no card below the floor", () => {
    const thin = [film({ id: "only", lock: "hard" })];
    expect(liveFilms(thin, { kind: "overall" }).length).toBeLessThan(MIN_LIVE_CARD);
    expect(liveCard(thin, { kind: "overall" })).toBeNull();
  });

  it("draws one above it, of the right subject", () => {
    const card = liveCard(library(), { kind: "overall" });
    expect(card?.title).toBe("Top 10");
    expect(card?.eyebrow).toBe("Your list");
    expect(card?.entries.map((e) => e.title)).toEqual(["heat", "drive", "collateral", "thief"]);
  });

  it("refuses a subject that is not a live one", () => {
    expect(liveCard(library(), { kind: "director", name: "Michael Mann" })).toBeNull();
  });
});

describe("subject", () => {
  const every: RankSubject[] = [
    { kind: "director", name: "Michael Mann" },
    { kind: "actor", name: "Ryan Gosling" },
    { kind: "genre", name: "Crime" },
    { kind: "tier", rating: 5 },
    { kind: "overall" },
  ];

  it("names every kind", () => {
    for (const s of every) {
      expect(subjectTitle(s)).toBeTruthy();
      expect(subjectEyebrow(s)).toBeTruthy();
      expect(subjectKey(s)).toBeTruthy();
    }
  });

  // The dividing line everything that persists depends on: a live subject may
  // be drawn and may never be saved, resumed or pushed.
  it("marks exactly the two live kinds", () => {
    expect(every.filter(isLiveSubject).map((s) => s.kind)).toEqual(["tier", "overall"]);
  });

  it("keys the two live kinds apart", () => {
    expect(subjectKey({ kind: "overall" })).not.toBe(subjectKey({ kind: "tier", rating: 5 }));
  });
});
