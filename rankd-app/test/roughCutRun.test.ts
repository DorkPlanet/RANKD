import { beforeEach, describe, expect, it } from "vitest";

import { clearRoughCut, loadRoughCut, saveRoughCut } from "@/lib/roughCutRun";
import type { Bucket } from "@/lib/roughCut";
import type { Film } from "@/lib/types";

const film = (id: string): Film => ({ id, title: id, rating: 4, score: 7500 });
const pool = ["a", "b", "c", "d", "e"].map(film);

const pass = (at: number, choices: [string, Bucket][] = [], n = 1) => ({
  tier: 4 as const,
  films: pool,
  at,
  choices: new Map<string, Bucket>(choices),
  n,
});

// Same standing-up as lists.test.ts: the module guards on `typeof window` and
// the round trip through JSON is part of what is being tested, so this is a real
// map rather than a mock.
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

describe("saveRoughCut / loadRoughCut", () => {
  it("brings a half-finished pass back where it was left", () => {
    saveRoughCut(pass(2, [["a", "top"], ["b", "bottom"]]));

    const back = loadRoughCut(pool, 4);
    expect(back).not.toBeNull();
    expect(back!.at).toBe(2);
    expect(back!.films.map((f) => f.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect([...back!.choices]).toEqual([["a", "top"], ["b", "bottom"]]);
  });

  it("keeps the queue's order rather than the library's", () => {
    // The pass was dealt best-first; the library is handed back shuffled.
    saveRoughCut(pass(1));
    const shuffled = [pool[3], pool[0], pool[4], pool[1], pool[2]];
    expect(loadRoughCut(shuffled, 4)!.films.map((f) => f.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("remembers which pass it was, so a refine still says pass 2", () => {
    saveRoughCut(pass(1, [], 2));
    expect(loadRoughCut(pool, 4)!.n).toBe(2);
  });

  it("offers nothing for a different tier", () => {
    saveRoughCut(pass(2));
    expect(loadRoughCut(pool, 3)).toBeNull();
  });

  // Refusing rather than repairing is the whole safety story: a pass rebuilt
  // against a library that moved would file films into piles nobody chose.
  it("refuses when a film has left the library", () => {
    saveRoughCut(pass(2));
    expect(loadRoughCut(pool.filter((f) => f.id !== "d"), 4)).toBeNull();
  });

  it("stores nothing for a pass that has not started", () => {
    saveRoughCut(pass(0));
    expect(loadRoughCut(pool, 4)).toBeNull();
  });

  it("stores nothing for a pass that has finished", () => {
    saveRoughCut(pass(pool.length));
    expect(loadRoughCut(pool, 4)).toBeNull();
  });

  it("clears a stored pass when one is finished or abandoned", () => {
    saveRoughCut(pass(2));
    expect(loadRoughCut(pool, 4)).not.toBeNull();
    clearRoughCut();
    expect(loadRoughCut(pool, 4)).toBeNull();
  });

  it("saving null clears rather than throws", () => {
    saveRoughCut(pass(2));
    saveRoughCut(null);
    expect(loadRoughCut(pool, 4)).toBeNull();
  });

  it("survives a corrupt record without taking the screen down", () => {
    localStorage.setItem("rankd-roughcut-v1", "{not json");
    expect(loadRoughCut(pool, 4)).toBeNull();
  });
});
