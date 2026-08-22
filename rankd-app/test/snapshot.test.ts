import { describe, expect, it } from "vitest";

import { buildSnapshot, worthPublishing } from "@/lib/snapshot";
import { tierMid } from "@/lib/tiers";
import type { Film } from "@/lib/types";

// The projection that let the library stay a blob. What is guarded hardest is
// that it publishes ONLY what somebody has actually decided, and that the same
// library always produces the same snapshot.

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id.toUpperCase(),
  rating: 4,
  score: tierMid(4),
  ...over,
});

/** A film somebody has confirmed the position of. */
const placed = (id: string, score: number, over: Partial<Film> = {}) =>
  film(id, { score, lock: "hard", ...over });

describe("what gets published", () => {
  it("ranks placed films best first", () => {
    const snap = buildSnapshot([placed("a", 500), placed("b", 9000), placed("c", 4000)], 0);
    expect(snap.entries.map((e) => e.i)).toEqual(["b", "c", "a"]);
    expect(snap.entries.map((e) => e.r)).toEqual([1, 2, 3]);
  });

  it("leaves UNPLACED films out of the order entirely", () => {
    // An unplaced film carries the tier midpoint it was seeded with, which is a
    // placeholder and not a judgement. Publishing hundreds of them at identical
    // scores would drop a lump into the middle of everybody's order and make
    // two strangers look alike.
    const snap = buildSnapshot([placed("a", 9000), film("b"), film("c")], 0);
    expect(snap.entries.map((e) => e.i)).toEqual(["a"]);
  });

  it("still counts the whole library, because 865 films is a true thing to say", () => {
    const snap = buildSnapshot([placed("a", 9000), film("b"), film("c")], 0);
    expect(snap.filmCount).toBe(3);
    expect(snap.entries).toHaveLength(1);
  });

  it("never publishes a borrowed film as yours", () => {
    // Guests belong to somebody else's filmography. `saveFilms` keeps them out
    // of storage, but a live curated run holds them in the same array.
    const snap = buildSnapshot([placed("a", 9000), placed("guest", 9500, { guest: true })], 0);
    expect(snap.entries.map((e) => e.i)).toEqual(["a"]);
    expect(snap.filmCount).toBe(1);
  });

  it("carries the duel count it was given", () => {
    expect(buildSnapshot([placed("a", 9000)], 1893).duelCount).toBe(1893);
  });
});

describe("held firmly, or not", () => {
  it("marks a position the reader confirmed", () => {
    expect(buildSnapshot([placed("a", 9000)], 0).entries[0].t).toBe(1);
  });

  it("does not mark one the model settled on its own", () => {
    // A soft lock is Rankd's opinion, not a statement by the person. A
    // comparison that weighted the two alike would treat a shrug as conviction.
    const snap = buildSnapshot([film("a", { score: 9000, lock: "soft" })], 0);
    expect(snap.entries[0].t).toBe(0);
  });
});

describe("the same library always produces the same snapshot", () => {
  it("breaks score ties on title, so nothing swaps between pushes", () => {
    // Without a tiebreak, two films on one score can come back in either order
    // and an unchanged library produces a different snapshot each time.
    const one = buildSnapshot([placed("zeta", 9000), placed("alpha", 9000)], 0);
    const two = buildSnapshot([placed("alpha", 9000), placed("zeta", 9000)], 0);
    expect(one.entries.map((e) => e.i)).toEqual(two.entries.map((e) => e.i));
  });

  it("does not reorder the array it was handed", () => {
    // It sorts a copy. Mutating the caller's array would reorder the live
    // library as a side effect of publishing it.
    const films = [placed("a", 500), placed("b", 9000)];
    buildSnapshot(films, 0);
    expect(films.map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("the summary", () => {
  it("shows a top ten and no more", () => {
    const many = Array.from({ length: 25 }, (_, i) => placed(`f${i}`, 9000 - i));
    expect(buildSnapshot(many, 0).summary.topFilms).toHaveLength(10);
  });

  it("carries enough of a film to actually draw it", () => {
    const snap = buildSnapshot(
      [placed("heat-1995", 9800, { title: "Heat", year: "1995", poster: "/p.jpg" })],
      0,
    );
    expect(snap.summary.topFilms[0]).toEqual({
      id: "heat-1995",
      title: "Heat",
      year: "1995",
      poster: "/p.jpg",
      rating: 4,
    });
  });

  it("keeps the rank order free of anything renderable", () => {
    // The split is the whole point: `entries` is carried once per film and stays
    // tiny, `summary` is a fixed handful with artwork and does not grow.
    const snap = buildSnapshot([placed("a", 9000, { title: "Heat", poster: "/p.jpg" })], 0);
    expect(Object.keys(snap.entries[0]).sort()).toEqual(["i", "r", "s", "t"]);
  });
});

describe("whether to send it at all", () => {
  it("publishes a library with something placed in it", () => {
    expect(worthPublishing(buildSnapshot([placed("a", 9000)], 0))).toBe(true);
  });

  it("does not publish one with nothing placed", () => {
    // No order to show and nothing to compare against. Skipping keeps empty
    // accounts out of every future discovery query for free.
    expect(worthPublishing(buildSnapshot([film("a"), film("b")], 0))).toBe(false);
    expect(worthPublishing(buildSnapshot([], 0))).toBe(false);
  });
});
