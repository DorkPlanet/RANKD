import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { isSandbox, setSandbox } from "@/lib/sandbox";
import { isUntouchedSeed, loadFilms, saveFilms } from "@/lib/store";
import { saveRun } from "@/lib/runs";
import { saveRoughCut } from "@/lib/roughCutRun";
import { SEED_FILMS } from "@/lib/seed";
import type { Film, PlacementSession } from "@/lib/types";

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  rating: 4,
  score: 7500,
  ...over,
});

beforeEach(() => {
  const store = new Map<string, string>();
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = {};
  g.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  setSandbox(false);
});

// A leaked sandbox flag is total, silent data loss — nothing would save again
// for the rest of the session. Cheap insurance against a test leaving it on.
afterEach(() => setSandbox(false));

describe("a new browser", () => {
  it("has no library at all, rather than somebody else's films", () => {
    expect(loadFilms()).toEqual([]);
  });

  it("treats an unreadable library as empty rather than replacing it", () => {
    localStorage.setItem("rankd-app-v1", "{not json");
    expect(loadFilms()).toEqual([]);
  });
});

describe("isUntouchedSeed", () => {
  it("recognises the sample set", () => {
    expect(isUntouchedSeed(SEED_FILMS)).toBe(true);
  });

  // The trap this function exists for: sync must not ask a device holding
  // nothing but samples to choose between them and a real account.
  it("still recognises the OLD ten-film sample set", () => {
    const legacy = [
      "the-godfather-1972",
      "dune-2021",
      "inception-2010",
      "the-dark-knight-2008",
      "interstellar-2014",
      "la-la-land-2016",
      "ex-machina-2014",
      "sicario-2015",
      "gone-girl-2014",
      "drive-2011",
    ].map((id) => film(id));
    expect(isUntouchedSeed(legacy)).toBe(true);
  });

  it("stops counting as untouched once anything has been settled", () => {
    const touched = SEED_FILMS.map((f, i) => (i === 0 ? { ...f, lock: "hard" as const } : f));
    expect(isUntouchedSeed(touched)).toBe(false);
  });

  it("does not call an empty library a sample", () => {
    expect(isUntouchedSeed([])).toBe(false);
  });

  it("does not call a real library a sample", () => {
    expect(isUntouchedSeed([film("a"), film("b")])).toBe(false);
  });
});

describe("the sandbox", () => {
  it("is off unless something turns it on", () => {
    expect(isSandbox()).toBe(false);
  });

  it("keeps tutorial films out of the library", () => {
    saveFilms([film("real")]);
    setSandbox(true);
    saveFilms(SEED_FILMS);
    setSandbox(false);
    expect(loadFilms().map((f) => f.id)).toEqual(["real"]);
  });

  // Not just "does not save" — the clearing paths are the dangerous half. Both
  // stores REMOVE their key when handed something unresumable, so a
  // demonstration ending would have wiped whatever the user had left half done.
  it("does not clear a real half-finished climb", () => {
    const session = {
      tier: 4,
      confirmed: [],
      unconfirmed: ["a", "b"],
      contenderId: "a",
      challengerId: "b",
      needsConfirm: false,
      spanBelow: 0,
      spanAbove: 0,
    } as unknown as PlacementSession;
    saveRun(session);
    const kept = localStorage.getItem("rankd-run-v1");
    expect(kept).not.toBeNull();

    setSandbox(true);
    saveRun(null); // what the end of a demonstration looks like
    setSandbox(false);
    expect(localStorage.getItem("rankd-run-v1")).toBe(kept);
  });

  it("does not clear a real half-finished Rough Cut pass", () => {
    const pool = ["a", "b", "c", "d"].map((id) => film(id));
    saveRoughCut({ tier: 4, films: pool, at: 2, choices: new Map(), n: 1 });
    const kept = localStorage.getItem("rankd-roughcut-v1");
    expect(kept).not.toBeNull();

    setSandbox(true);
    saveRoughCut(null);
    setSandbox(false);
    expect(localStorage.getItem("rankd-roughcut-v1")).toBe(kept);
  });

  it("lets everything save again once it is off", () => {
    setSandbox(true);
    saveFilms([film("ghost")]);
    setSandbox(false);
    saveFilms([film("real")]);
    expect(loadFilms().map((f) => f.id)).toEqual(["real"]);
  });
});
