// The feed's diff — what a push is worth saying about.

import { describe, expect, it } from "vitest";

import { diffToActivity, MAX_CARDS, MIN_CLIMB, ratingOfScore } from "@/lib/social/feed";
import type { SnapshotEntry, SnapshotFilm } from "@/lib/snapshot";
import { seedScore, tierMax, tierMin } from "@/lib/tiers";

const entry = (i: string, r: number, s = seedScore(4)): SnapshotEntry => ({ i, r, s, t: 0 });
const film = (id: string, rating = 4): SnapshotFilm => ({ id, title: id.toUpperCase(), rating });

/** A run of films at ranks 1..n, so a diff has something to be a diff against. */
const order = (ids: string[], score = seedScore(4)): SnapshotEntry[] =>
  ids.map((id, i) => entry(id, i + 1, score));

describe("ratingOfScore", () => {
  it("reads every band off TIER_RANGE rather than guessing", () => {
    for (const rating of [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5]) {
      expect(ratingOfScore(tierMin(rating))).toBe(rating);
      expect(ratingOfScore(tierMax(rating))).toBe(rating);
      expect(ratingOfScore(seedScore(rating))).toBe(rating);
    }
  });
});

describe("diffToActivity", () => {
  it("says nothing about a first-ever snapshot", () => {
    // Otherwise importing a CSV fills your followers' feeds with the contents of
    // a spreadsheet. Bookkeeping, not a statement.
    const after = order(["a", "b", "c"]);
    expect(diffToActivity([], after, [film("a"), film("b"), film("c")])).toEqual([]);
  });

  it("says nothing when the same library is pushed twice", () => {
    // THE property that removes the need for a dedupe index: the diff of a thing
    // against itself is empty, so a re-sync cannot become a firehose.
    const same = order(["a", "b", "c"]);
    expect(diffToActivity(same, same, [film("a"), film("b"), film("c")])).toEqual([]);
  });

  it("reports a climb, with where it came from", () => {
    const before = order(["a", "b", "c", "d", "e"]);
    const after = order(["e", "a", "b", "c", "d"]);
    const cards = diffToActivity(before, after, [film("e")]);
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("climb");
    expect(cards[0].subjectId).toBe("e");
    expect(cards[0].meta).toMatchObject({ from: 5, rank: 1, places: 4, title: "E" });
  });

  it("ignores a move too small to mean anything", () => {
    const before = order(["a", "b", "c", "d", "e"]);
    // b moves up one. The ranking breathing, not news.
    const after = order(["b", "a", "c", "d", "e"]);
    expect(diffToActivity(before, after, [film("b")]).filter((c) => c.kind === "climb")).toEqual([]);
    expect(MIN_CLIMB).toBeGreaterThan(1);
  });

  it("reports a tier promotion by band, not by score", () => {
    // Same rank throughout — only the band changed, which is the whole event.
    const before = [entry("a", 1, seedScore(4))];
    const after = [entry("a", 1, seedScore(5))];
    const cards = diffToActivity(before, after, [film("a", 5)]);
    expect(cards).toHaveLength(1);
    expect(cards[0].kind).toBe("promotion");
    expect(cards[0].meta).toMatchObject({ from: 4, to: 5 });
  });

  it("does not call a nudge inside one band a promotion", () => {
    const before = [entry("a", 1, tierMin(4))];
    const after = [entry("a", 1, tierMax(4))];
    expect(diffToActivity(before, after, [film("a")])).toEqual([]);
  });

  it("reports a film arriving straight into the top ten", () => {
    const before = order(["a", "b"]);
    const after = order(["a", "new", "b"]);
    const cards = diffToActivity(before, after, [film("new")]);
    expect(cards.some((c) => c.kind === "arrival" && c.subjectId === "new")).toBe(true);
  });

  it("only names films the snapshot can name", () => {
    // `entries` carries ids alone; titles live on the top ten. A film that
    // climbed but is not up there has no title to print, and is not news anyway.
    const before = order(["a", "b", "c", "d", "e"]);
    const after = order(["e", "a", "b", "c", "d"]);
    expect(diffToActivity(before, after, [])).toEqual([]);
  });

  it("caps a five-hundred-film shuffle at a readable handful", () => {
    const ids = Array.from({ length: 500 }, (_, i) => `f${i}`);
    const before = order(ids);
    // Everything moves: the last fifty all vault to the front.
    const after = order([...ids.slice(450), ...ids.slice(0, 450)]);
    const top = ids.slice(450).map((id) => film(id));
    const cards = diffToActivity(before, after, top);
    expect(cards.length).toBeLessThanOrEqual(MAX_CARDS);
    expect(cards.length).toBeGreaterThan(0);
  });

  it("puts the biggest news first", () => {
    const before = [entry("a", 10, seedScore(4)), entry("b", 11, seedScore(4))];
    const after = [entry("a", 2, seedScore(4)), entry("b", 1, seedScore(5))];
    const cards = diffToActivity(before, after, [film("b", 5), film("a")]);
    // A tier crossing outranks a climb; both outrank the quiet count card.
    expect(cards[0].kind).toBe("promotion");
    expect(cards.map((c) => c.kind)).toContain("climb");
  });

  it("still says something when nothing moved at the top but films were placed", () => {
    const before = order(["a", "b"]);
    const after = order(["a", "b", "c", "d", "e"]);
    const cards = diffToActivity(before, after, [film("a"), film("b")]);
    const placed = cards.find((c) => c.kind === "placed");
    expect(placed?.meta).toMatchObject({ count: 3 });
  });

  it("never reports films disappearing as a placement", () => {
    // Deleting films must not read as ranking them.
    const before = order(["a", "b", "c", "d"]);
    const after = order(["a", "b"]);
    expect(diffToActivity(before, after, [film("a"), film("b")]).some((c) => c.kind === "placed")).toBe(false);
  });
});
