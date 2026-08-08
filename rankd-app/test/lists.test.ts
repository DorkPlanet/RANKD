import { beforeEach, describe, expect, it } from "vitest";

import { deleteList, hydrate, loadLists, renameList, saveList } from "@/lib/lists";
import { tierMid } from "@/lib/tiers";
import type { Film } from "@/lib/types";

// The one behaviour worth guarding hardest: a saved list is a SNAPSHOT. It was
// nearly built as a live query, which would have let the model quietly rearrange
// an order the user sat through duels to settle on.

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id.toUpperCase(),
  rating: 4,
  score: tierMid(4),
  ...over,
});

// Same standing-up as log.test.ts: lists.ts guards on `typeof window` and talks
// to localStorage, and the round trip through JSON is part of what's being
// tested — so a real map rather than a mock.
beforeEach(() => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = {};
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe("saving a list", () => {
  it("keeps the order it was given, not a sorted one", () => {
    const list = saveList("Mann", [film("c", { score: 10 }), film("a", { score: 9000 }), film("b")]);
    expect(list.entries.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });

  it("survives a reload", () => {
    saveList("Mann", [film("a"), film("b")]);
    expect(loadLists()).toHaveLength(1);
    expect(loadLists()[0].name).toBe("Mann");
  });

  it("puts the newest first", () => {
    saveList("first", [film("a"), film("b")]);
    saveList("second", [film("a"), film("b")]);
    expect(loadLists().map((l) => l.name)).toEqual(["second", "first"]);
  });

  it("names an unnamed list rather than saving a blank one", () => {
    expect(saveList("   ", [film("a")]).name).toBe("Untitled list");
  });

  it("gives two lists saved together different ids", () => {
    const a = saveList("Mann", [film("a")]);
    const b = saveList("Mann", [film("a")]);
    expect(a.id).not.toBe(b.id);
  });

  it("remembers the title and poster, so a row outlives its film", () => {
    const [entry] = saveList("Mann", [film("a", { title: "Heat", year: "1995", poster: "p.jpg" })]).entries;
    expect(entry).toMatchObject({ title: "Heat", year: "1995", poster: "p.jpg" });
  });

  it("records that a film was borrowed rather than owned", () => {
    const [entry] = saveList("Mann", [film("a", { guest: true })]).entries;
    expect(entry.guest).toBe(true);
  });
});

describe("reading a saved list back", () => {
  it("does NOT re-derive the order when the library moves on", () => {
    const list = saveList("Mann", [film("a"), film("b")]);
    // `b` has since overtaken `a` everywhere else in the app.
    const later = [film("a", { score: 10 }), film("b", { score: 9000 })];
    expect(hydrate(list, later).map((r) => r.entry.id)).toEqual(["a", "b"]);
  });

  it("picks up artwork that arrived after the save", () => {
    const list = saveList("Mann", [film("a")]);
    const [row] = hydrate(list, [film("a", { poster: "late.jpg" })]);
    expect(row.film?.poster).toBe("late.jpg");
  });

  it("keeps a row whose film has left the library", () => {
    const list = saveList("Mann", [film("a", { title: "Heat" }), film("b")]);
    const rows = hydrate(list, [film("b")]);
    expect(rows).toHaveLength(2);
    expect(rows[0].film).toBeUndefined();
    expect(rows[0].entry.title).toBe("Heat");
  });
});

describe("managing the shelf", () => {
  it("deletes only the list asked for", () => {
    const a = saveList("a", [film("x")]);
    saveList("b", [film("x")]);
    deleteList(a.id);
    expect(loadLists().map((l) => l.name)).toEqual(["b"]);
  });

  it("renames in place", () => {
    const a = saveList("a", [film("x")]);
    renameList(a.id, "Michael Mann");
    expect(loadLists()[0].name).toBe("Michael Mann");
  });

  it("refuses to rename a list to nothing", () => {
    const a = saveList("a", [film("x")]);
    renameList(a.id, "  ");
    expect(loadLists()[0].name).toBe("a");
  });

  it("treats corrupt storage as an empty shelf", () => {
    localStorage.setItem("rankd-lists-v1", "{not json");
    expect(loadLists()).toEqual([]);
  });
});
