// The feed's diff — what a push is worth saying about.

import { describe, expect, it } from "vitest";

import {
  crossed,
  diffToActivity,
  DUEL_MARKS,
  escapeForLike,
  LOCK_DEPTH,
  MAX_CARDS,
  MIN_MOVE,
  ratingOfScore,
  shortAgo,
} from "@/lib/social/feed";
import type { NamedFilm, SnapshotEntry } from "@/lib/snapshot";
import { seedScore, tierMax, tierMin } from "@/lib/tiers";

const entry = (i: string, r: number, s = seedScore(4), t: 0 | 1 = 0): SnapshotEntry => ({ i, r, s, t });
const name = (i: string): NamedFilm => ({ i, t: i.toUpperCase() });

/** A run of films at ranks 1..n, so a diff has something to be a diff against. */
const order = (ids: string[], s = seedScore(4)): SnapshotEntry[] => ids.map((id, i) => entry(id, i + 1, s));
const names = (ids: string[]): NamedFilm[] => ids.map(name);

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
    // Otherwise importing a library fills your followers' feeds with the
    // contents of a spreadsheet. Bookkeeping, not a statement.
    expect(diffToActivity([], order(["a", "b"]), names(["a", "b"]))).toEqual([]);
  });

  it("says nothing when the same library is pushed twice", () => {
    // THE property that removes any need for a dedupe index: the diff of a thing
    // against itself is empty, so a re-sync cannot become a firehose.
    const same = order(["a", "b", "c"]);
    expect(diffToActivity(same, same, names(["a", "b", "c"]))).toEqual([]);
  });

  describe("added — the engine", () => {
    it("names the film and where it landed", () => {
      const cards = diffToActivity(order(["a", "b"]), order(["a", "new", "b"]), names(["a", "new", "b"]));
      const added = cards.find((c) => c.kind === "added");
      expect(added?.subjectId).toBe("new");
      expect(added?.meta).toMatchObject({ title: "NEW", rank: 2 });
    });

    it("carries the star band, not just the rank", () => {
      const after = [entry("new", 1, seedScore(5))];
      const cards = diffToActivity(order(["old"]), after, names(["new"]));
      expect(cards.find((c) => c.kind === "added")?.meta).toMatchObject({ rating: 5 });
    });

    it("fires at ANY depth, not only the top ten", () => {
      // The whole reason the snapshot now names 250 films.
      const before = order(Array.from({ length: 200 }, (_, i) => `f${i}`));
      const after = order([...Array.from({ length: 180 }, (_, i) => `f${i}`), "late"]);
      const cards = diffToActivity(before, after, names(["late"]));
      expect(cards.some((c) => c.kind === "added" && c.subjectId === "late")).toBe(true);
    });

    it("stays quiet about a film it cannot name, but still counts the work", () => {
      const cards = diffToActivity(order(["a"]), order(["a", "unnamed"]), names(["a"]));
      expect(cards.some((c) => c.kind === "added")).toBe(false);
      expect(cards.find((c) => c.kind === "session")?.meta).toMatchObject({ added: 1 });
    });
  });

  describe("locked — the strongest signal", () => {
    const soft = entry("a", 5, seedScore(4), 0);
    const hard = entry("a", 5, seedScore(4), 1);

    it("fires on the transition to held-firmly", () => {
      const cards = diffToActivity([soft], [hard], names(["a"]));
      expect(cards.find((c) => c.kind === "locked")?.meta).toMatchObject({ title: "A", rank: 5 });
    });

    it("never fires twice for the same film", () => {
      expect(diffToActivity([hard], [hard], names(["a"])).some((c) => c.kind === "locked")).toBe(false);
    });

    it("ignores a commitment made deep in the list", () => {
      // A lock at 400th is a filing decision, and the feed is not a cabinet.
      const deepSoft = entry("a", LOCK_DEPTH + 1, seedScore(4), 0);
      const deepHard = entry("a", LOCK_DEPTH + 1, seedScore(4), 1);
      expect(diffToActivity([deepSoft], [deepHard], names(["a"])).some((c) => c.kind === "locked")).toBe(false);
    });

    it("leads the feed when a sitting produced both a lock and work", () => {
      const before = [soft, ...order(["b", "c", "d", "e"]).map((e) => ({ ...e, r: e.r + 10 }))];
      const after = [hard, ...order(["e", "b", "c", "d"]).map((e) => ({ ...e, r: e.r + 10 }))];
      const cards = diffToActivity(before, after, names(["a", "b", "c", "d", "e"]));
      expect(cards[0].kind).toBe("locked");
    });
  });

  describe("session — the work, credited to the person", () => {
    it("is ONE card however much moved", () => {
      const ids = Array.from({ length: 300 }, (_, i) => `f${i}`);
      const after = order([...ids.slice(250), ...ids.slice(0, 250)]);
      const cards = diffToActivity(order(ids), after, names(ids));
      expect(cards.filter((c) => c.kind === "session")).toHaveLength(1);
    });

    it("names the single biggest riser", () => {
      const before = order(["a", "b", "c", "d", "e"]);
      const after = order(["e", "a", "b", "c", "d"]);
      const cards = diffToActivity(before, after, names(["a", "b", "c", "d", "e"]));
      expect(cards.find((c) => c.kind === "session")?.meta).toMatchObject({ bestTitle: "E", bestRank: 1 });
    });

    it("does not appear at all for a sitting that only nudged things", () => {
      // Two films swapping is one place each — the ranking breathing. It earns
      // no card rather than a card announcing that nothing happened.
      const cards = diffToActivity(order(["a", "b"]), order(["b", "a"]), names(["a", "b"]));
      expect(cards).toEqual([]);
      expect(MIN_MOVE).toBeGreaterThan(1);
    });

    it("is absent when nothing happened at all", () => {
      const same = order(["a", "b"]);
      expect(diffToActivity(same, same, names(["a", "b"]))).toEqual([]);
    });

    it("never counts films disappearing as work", () => {
      const cards = diffToActivity(order(["a", "b", "c"]), order(["a"]), names(["a"]));
      expect(cards.some((c) => c.kind === "session")).toBe(false);
    });
  });

  it("caps a marathon at a readable handful", () => {
    const ids = Array.from({ length: 400 }, (_, i) => `f${i}`);
    const after = [...ids.map((id, i) => entry(id, i + 1)), entry("x1", 401), entry("x2", 402)];
    const cards = diffToActivity(order(ids), after, names([...ids, "x1", "x2"]));
    expect(cards.length).toBeLessThanOrEqual(MAX_CARDS);
  });

  it("has no changelog cards left", () => {
    // The kinds that started all this: deltas rather than placements.
    const before = order(["a", "b", "c", "d", "e"]);
    const after = order(["e", "a", "b", "c", "d"]);
    const kinds = diffToActivity(before, after, names(["a", "b", "c", "d", "e"])).map((c) => c.kind);
    for (const gone of ["climb", "arrival", "placed", "promotion"]) {
      expect(kinds).not.toContain(gone);
    }
  });
});

describe("crossed", () => {
  it("only fires on the step that passes the mark", () => {
    expect(crossed(DUEL_MARKS, 99, 100)).toBe(100);
    expect(crossed(DUEL_MARKS, 100, 140)).toBeNull();
    expect(crossed(DUEL_MARKS, 40, 90)).toBeNull();
  });

  it("reports the biggest mark when a session vaults several", () => {
    // Telling somebody who just passed a thousand that they passed a hundred
    // undersells it.
    expect(crossed(DUEL_MARKS, 50, 1200)).toBe(1000);
  });

  it("never fires backwards", () => {
    expect(crossed(DUEL_MARKS, 500, 200)).toBeNull();
  });
});

describe("milestones", () => {
  it("outrank everything, being rare by construction", () => {
    const cards = diffToActivity(order(["a", "b"]), order(["b", "a", "c"]), names(["a", "b", "c"]), {
      was: { duels: 990, placed: 2 },
      now: { duels: 1010, placed: 3 },
    });
    expect(cards[0].kind).toBe("milestone");
    expect(cards[0].meta).toMatchObject({ of: "duels", at: 1000 });
  });

  it("stay silent when the caller gives no counts", () => {
    const cards = diffToActivity(order(["a"]), order(["a", "b"]), names(["a", "b"]));
    expect(cards.some((c) => c.kind === "milestone")).toBe(false);
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
    expect(at("2026-06-01T10:00:00Z", "2026-08-23T10:00:00Z")).not.toMatch(/^\d+d$/);
  });
});
