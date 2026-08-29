import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPoint,
  clearPoints,
  dropPoint,
  loadPoints,
  MAX_POINTS,
  missingFrom,
  snapshot,
  takePoint,
} from "@/lib/restore";
import { FILE_KEYS_BY_FORMAT, SYNC_KEYS } from "@/lib/backupFormat";
import type { Film } from "@/lib/types";
import type { Rating } from "@/lib/tiers";

// The undo stack, and the two promises it makes.
//
// It restores placements EXACTLY — rating, score and lock, byte for byte — and
// it touches nothing else. The second half is the one worth guarding: a restore
// point is not a backup, and the moment it starts putting back titles or
// artwork it becomes one, with none of a backup's validation behind it.

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

const film = (id: string, over: Partial<Film> = {}): Film =>
  ({ id, title: id, rating: 4 as Rating, score: 7500, ...over }) as Film;

const library = () => [
  film("a", { rating: 5, score: 9500, lock: "hard" }),
  film("b", { rating: 4, score: 7200, lock: "soft" }),
  film("c", { rating: 3, score: 5100 }),
];

describe("snapshot", () => {
  it("keeps the four placement fields and nothing else", () => {
    const snaps = snapshot([film("a", { rating: 5, score: 9500, lock: "hard", poster: "p.jpg" })]);
    expect(snaps).toEqual([{ id: "a", rating: 5, score: 9500, lock: "hard" }]);
  });

  it("omits the lock entirely when a film is unplaced", () => {
    const [snap] = snapshot([film("c", { rating: 3, score: 5100 })]);
    expect("lock" in snap).toBe(false);
  });
});

describe("taking a point", () => {
  it("records the library as it stands", () => {
    const point = takePoint("Cleared the ranking", library());
    expect(point?.label).toBe("Cleared the ranking");
    expect(point?.films).toHaveLength(3);
    expect(loadPoints()).toHaveLength(1);
  });

  it("takes nothing for an empty library", () => {
    expect(takePoint("Cleared the ranking", [])).toBeNull();
    expect(loadPoints()).toEqual([]);
  });

  it("puts the newest first", () => {
    takePoint("first", library());
    takePoint("second", library());
    expect(loadPoints().map((p) => p.label)).toEqual(["second", "first"]);
  });

  it("caps the stack, dropping the oldest", () => {
    for (let i = 0; i < MAX_POINTS + 3; i++) takePoint(`op ${i}`, library());
    const points = loadPoints();
    expect(points).toHaveLength(MAX_POINTS);
    // The most recent survive; the first three are gone.
    expect(points[0].label).toBe(`op ${MAX_POINTS + 2}`);
    expect(points.map((p) => p.label)).not.toContain("op 0");
  });

  it("gives every point a distinct id, even taken back to back", () => {
    const ids = [takePoint("a", library()), takePoint("b", library())].map((p) => p?.id);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("restoring", () => {
  it("returns rating, score and lock exactly", () => {
    const before = library();
    const point = takePoint("Cleared the ranking", before)!;
    // Something destructive happens.
    const after = before.map((f) => ({ ...f, rating: 1 as Rating, score: 1000, lock: undefined }));
    const back = applyPoint(point, after);
    expect(back.map((f) => ({ rating: f.rating, score: f.score, lock: f.lock }))).toEqual(
      before.map((f) => ({ rating: f.rating, score: f.score, lock: f.lock })),
    );
  });

  it("clears a lock that was not there, rather than leaving the newer one", () => {
    const point = takePoint("op", [film("c", { rating: 3, score: 5100 })])!;
    const after = [film("c", { rating: 3, score: 5100, lock: "hard" })];
    const [back] = applyPoint(point, after);
    expect(back.lock).toBeUndefined();
    expect("lock" in back).toBe(false);
  });

  it("leaves everything that is not a placement alone", () => {
    const point = takePoint("op", [film("a", { title: "Old", poster: "old.jpg" })])!;
    const after = [film("a", { title: "New", poster: "new.jpg", score: 1 })];
    const [back] = applyPoint(point, after);
    expect(back.title).toBe("New");
    expect(back.poster).toBe("new.jpg");
    expect(back.score).toBe(7500);
  });

  it("does not delete films added since the point was taken", () => {
    const point = takePoint("op", library())!;
    const after = [...library(), film("d")];
    expect(applyPoint(point, after).map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("counts films it can no longer put back", () => {
    const point = takePoint("op", library())!;
    const after = library().filter((f) => f.id !== "b");
    expect(missingFrom(point, after)).toBe(1);
    // And says so without pretending to restore it.
    expect(applyPoint(point, after).map((f) => f.id)).toEqual(["a", "c"]);
  });
});

describe("forgetting", () => {
  it("drops one point by id", () => {
    const keep = takePoint("keep", library())!;
    const go = takePoint("go", library())!;
    dropPoint(go.id);
    expect(loadPoints().map((p) => p.id)).toEqual([keep.id]);
  });

  it("clears the lot", () => {
    takePoint("a", library());
    clearPoints();
    expect(loadPoints()).toEqual([]);
  });

  it("survives a corrupt stack rather than taking the screen down", () => {
    store.set("rankd-restore-v1", "{not json");
    expect(loadPoints()).toEqual([]);
  });
});

// ── The exclusions, which are the whole reason this is device-local ────────
//
// An undo stack records what THIS device did in the last few minutes. Syncing
// one has no correct merge, and restoring one from a FILE would offer to undo an
// operation that happened on another machine. Both are one line away from being
// true, so both are asserted.
describe("never leaves the device", () => {
  it("is absent from the synced payload", () => {
    expect(SYNC_KEYS.some((k) => k.startsWith("rankd-restore-v1"))).toBe(false);
  });

  it("is absent from every file format, including the current one", () => {
    for (const [format, keys] of Object.entries(FILE_KEYS_BY_FORMAT)) {
      expect(
        keys.some((k) => k.startsWith("rankd-restore-v1")),
        `format ${format} must not own the undo stack`,
      ).toBe(false);
    }
  });
});
