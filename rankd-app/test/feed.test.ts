// The feed's diff — what a push is worth saying about.

import { describe, expect, it } from "vitest";

import {
  crossed,
  diffToActivity,
  escapeForLike,
  DUEL_MARKS,
  MAX_CARDS,
  MIN_CLIMB,
  ratingOfScore,
  shortAgo,
} from "@/lib/social/feed";
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

describe("shortAgo", () => {
  const at = (iso: string, now: string) => shortAgo(iso, Date.parse(now));

  it("says now for anything just happened", () => {
    expect(at("2026-08-23T10:00:00Z", "2026-08-23T10:00:10Z")).toBe("now");
  });

  it("counts in whole units", () => {
    expect(at("2026-08-23T10:00:00Z", "2026-08-23T10:05:00Z")).toBe("5m");
    expect(at("2026-08-23T10:00:00Z", "2026-08-23T13:00:00Z")).toBe("3h");
    expect(at("2026-08-20T10:00:00Z", "2026-08-23T10:00:00Z")).toBe("3d");
  });

  it("never says 0m, because something that happened did happen", () => {
    expect(at("2026-08-23T10:00:00Z", "2026-08-23T10:00:50Z")).toBe("1m");
  });

  it("switches to a date once days stop meaning anything", () => {
    // "63d" is not a length of time anybody feels.
    expect(at("2026-06-01T10:00:00Z", "2026-08-23T10:00:00Z")).not.toMatch(/^\d+d$/);
  });
});

describe("crossed", () => {
  it("only fires on the step that passes the mark", () => {
    expect(crossed(DUEL_MARKS, 99, 100)).toBe(100);
    expect(crossed(DUEL_MARKS, 100, 140)).toBeNull(); // already past it
    expect(crossed(DUEL_MARKS, 40, 90)).toBeNull(); // never reached one
  });

  it("reports the biggest mark when a session vaults several", () => {
    // A long import or a marathon can cross more than one. Announcing "you
    // passed 100" to somebody who just passed 1000 undersells it.
    expect(crossed(DUEL_MARKS, 50, 1200)).toBe(1000);
  });

  it("never fires backwards", () => {
    expect(crossed(DUEL_MARKS, 500, 200)).toBeNull();
  });
});

describe("milestones in the diff", () => {
  const before = order(["a", "b"]);
  const after = order(["a", "b"]);

  it("says nothing when no mark was passed", () => {
    const cards = diffToActivity(before, after, [film("a")], {
      was: { duels: 10, placed: 2 },
      now: { duels: 20, placed: 2 },
    });
    expect(cards.filter((c) => c.kind === "milestone")).toEqual([]);
  });

  it("announces a duel milestone, and puts it first", () => {
    const climbBefore = order(["a", "b", "c", "d", "e"]);
    const climbAfter = order(["e", "a", "b", "c", "d"]);
    const cards = diffToActivity(climbBefore, climbAfter, [film("e")], {
      was: { duels: 990, placed: 5 },
      now: { duels: 1010, placed: 5 },
    });
    // Rare by construction, so it outranks the third climb of the evening.
    expect(cards[0].kind).toBe("milestone");
    expect(cards[0].meta).toMatchObject({ of: "duels", at: 1000 });
  });

  it("counts PLACED films, not the whole library", () => {
    // `filmCount` includes everything still un-rnkd. A milestone is about work
    // done, not films owned.
    const wide = order(Array.from({ length: 25 }, (_, i) => `f${i}`));
    const cards = diffToActivity(order(["f0"]), wide, [], {
      was: { duels: 0, placed: 1 },
      now: { duels: 0, placed: 25 },
    });
    expect(cards.some((c) => c.kind === "milestone" && (c.meta as { at: number }).at === 25)).toBe(true);
  });

  it("stays silent when the caller gives no counts", () => {
    expect(diffToActivity(before, after, [film("a")]).filter((c) => c.kind === "milestone")).toEqual([]);
  });
});

describe("escapeForLike", () => {
  // Invisible until somebody with an underscore in their name starts getting
  // another person's notifications, which is a horrible way to find out.
  it("escapes the character that is both legal and a wildcard", () => {
    expect(escapeForLike("sam_j")).toBe("sam\\_j");
  });

  it("escapes the other wildcard and the escape character itself", () => {
    expect(escapeForLike("a%b")).toBe("a\\%b");
    expect(escapeForLike("a\\b")).toBe("a\\\\b");
  });

  it("leaves an ordinary handle exactly as it was", () => {
    expect(escapeForLike("donnie")).toBe("donnie");
    expect(escapeForLike("rankd2")).toBe("rankd2");
  });

  it("stops one handle matching another", () => {
    // The whole point: unescaped, `sam_j` as a LIKE pattern matches `samxj`.
    const pattern = escapeForLike("sam_j");
    expect(pattern.includes("\_")).toBe(true);
    expect(pattern).not.toBe("sam_j");
  });
});
