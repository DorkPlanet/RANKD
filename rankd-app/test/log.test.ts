import { beforeEach, describe, expect, it } from "vitest";

import { appendJudgements, loadLog, logFor, logSize, newJudgement } from "@/lib/log";

// log.ts guards on `typeof window` and talks to localStorage, so stand both up.
// A real map, not a mock: the round trip through JSON — encode, intern, decode —
// is exactly what these tests are for, and a mock would skip it.
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

describe("newJudgement", () => {
  it("mints unique ids even for duels landing in the same millisecond", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newJudgement("a", "b", "a", "koth").id));
    expect(ids.size).toBe(1000);
  });

  it("records exactly what happened and nothing more", () => {
    const j = newJudgement("drive", "heat", "draw", "shuffle");
    expect(j.a).toBe("drive");
    expect(j.b).toBe("heat");
    expect(j.o).toBe("draw");
    expect(j.m).toBe("shuffle");
  });
});

describe("the log", () => {
  it("starts empty", async () => {
    expect(await loadLog()).toEqual([]);
  });

  it("round-trips a judgement through the interned encoding intact", async () => {
    const j = newJudgement("gone-girl-2014", "drive-2011", "b", "spotlight");
    await appendJudgements([j]);
    expect(await loadLog()).toEqual([j]);
  });

  it("keeps every mode and outcome legible after a round trip", async () => {
    const rows = [
      newJudgement("a", "b", "a", "koth"),
      newJudgement("b", "c", "b", "spotlight"),
      newJudgement("c", "d", "draw", "shuffle"),
      newJudgement("d", "e", "a", "promotion"),
    ];
    await appendJudgements(rows);
    expect(await loadLog()).toEqual(rows);
  });

  it("appends in order rather than replacing", async () => {
    const first = newJudgement("a", "b", "a", "koth");
    const second = newJudgement("c", "d", "b", "koth");
    await appendJudgements([first]);
    await appendJudgements([second]);
    expect((await loadLog()).map((j) => j.id)).toEqual([first.id, second.id]);
  });

  // The property the whole drain design rests on: one duel counted twice would be
  // two pieces of evidence for one judgement, and every belief would inherit it.
  it("writes a duel exactly once however many times it is drained", async () => {
    const j = newJudgement("a", "b", "a", "koth");
    await appendJudgements([j]);
    await appendJudgements([j]);
    await appendJudgements([j, j]);
    expect(await loadLog()).toHaveLength(1);
  });

  it("takes the new rows from a batch that partly overlaps what is stored", async () => {
    const old = newJudgement("a", "b", "a", "koth");
    const fresh = newJudgement("c", "d", "a", "koth");
    await appendJudgements([old]);
    await appendJudgements([old, fresh]);
    expect((await loadLog()).map((j) => j.id)).toEqual([old.id, fresh.id]);
  });

  it("reads a corrupt log as empty rather than taking the app down", async () => {
    localStorage.setItem("rankd-log-v1", "{ this is not json");
    expect(await loadLog()).toEqual([]);
  });

  it("survives a log whose shape it doesn't recognise", async () => {
    localStorage.setItem("rankd-log-v1", JSON.stringify({ v: 99, nonsense: true }));
    expect(await loadLog()).toEqual([]);
  });

  it("finds every judgement naming a film, either side", async () => {
    const rows = [
      newJudgement("drive", "heat", "a", "koth"),
      newJudgement("heat", "drive", "b", "koth"),
      newJudgement("other", "films", "a", "koth"),
    ];
    await appendJudgements(rows);
    expect(logFor(await loadLog(), "drive")).toHaveLength(2);
    expect(logFor(await loadLog(), "nobody")).toHaveLength(0);
  });
});

describe("logSize", () => {
  it("reports nothing for an empty log", () => {
    expect(logSize([])).toEqual({ rows: 0, bytes: expect.any(Number) });
  });

  // Interning film ids is what keeps this affordable — measured at ~47 bytes a
  // row against a realistic library, versus ~83 storing the slugs inline. If this
  // regresses, the storage ceiling roughly halves.
  it("stays well under 60 bytes a row on a realistic library", () => {
    const titles = Array.from({ length: 800 }, (_, i) => `some-fairly-long-film-title-${i}-2011`);
    const rows = Array.from({ length: 5000 }, (_, i) =>
      newJudgement(titles[i % 800], titles[(i * 7) % 800], i % 3 === 0 ? "draw" : "a", "shuffle"),
    );
    const { bytes, rows: n } = logSize(rows);
    expect(n).toBe(5000);
    expect(bytes / n).toBeLessThan(60);
  });
});
