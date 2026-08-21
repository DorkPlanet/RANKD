import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearCuratedRun, loadCuratedRun, saveCuratedRun, type CuratedRun } from "@/lib/runs";
import type { Film, PlacementSession } from "@/lib/types";

// Resuming a curated run (B7).
//
// The climb store next door rebuilds from ids, because every film in a climb is
// in your library. A curated run can BORROW — a director's work you have never
// seen is pulled in for the run and persisted nowhere else — so the whole films
// go in, and validation has to count the guests as present.
//
// That last part is the one that matters: checking ids against the library
// alone would throw away every run that borrowed anything, which is most of
// them, and it would do it silently.

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

const film = (id: string): Film => ({ id, title: id, rating: 4, score: 7000 }) as Film;

const session = (over: Partial<PlacementSession> = {}): PlacementSession =>
  ({
    tier: 4,
    confirmed: [],
    unconfirmed: ["mine", "guest"],
    contenderId: "mine",
    challengerId: "guest",
    crossTier: true,
    ...over,
  }) as PlacementSession;

const run = (over: Partial<CuratedRun> = {}): CuratedRun => ({
  session: session(),
  subject: { kind: "director", name: "Michael Mann" },
  guests: [film("guest")],
  ...over,
});

describe("curated run storage", () => {
  it("comes back with its guests intact", () => {
    saveCuratedRun(run());
    const back = loadCuratedRun([film("mine")]);
    expect(back?.subject).toEqual({ kind: "director", name: "Michael Mann" });
    expect(back?.guests.map((g) => g.id)).toEqual(["guest"]);
  });

  it("counts guests as present when validating ids", () => {
    // "guest" is NOT in the library and never will be. A run naming it must
    // still resume — this is the whole reason the store holds whole films.
    saveCuratedRun(run());
    expect(loadCuratedRun([film("mine")])).not.toBeNull();
  });

  it("refuses a run naming a film that is neither in the library nor a guest", () => {
    saveCuratedRun(run({ session: session({ unconfirmed: ["mine", "vanished"] }) }));
    expect(loadCuratedRun([film("mine")])).toBeNull();
  });

  it("refuses to store a climb — that is the other key's job", () => {
    // The inverse of `isResumable`'s first clause. A curated session IS
    // cross-tier; that flag is what makes it one.
    saveCuratedRun(run({ session: session({ crossTier: false }) }));
    expect(loadCuratedRun([film("mine")])).toBeNull();
  });

  it("clears rather than keeping a stale run when handed nothing", () => {
    saveCuratedRun(run());
    saveCuratedRun(null);
    expect(loadCuratedRun([film("mine")])).toBeNull();
  });

  it("refuses a run with nothing left to climb", () => {
    saveCuratedRun(run({ session: session({ unconfirmed: ["mine"] }) }));
    expect(loadCuratedRun([film("mine")])).toBeNull();
  });

  it("forgets an unreadable record rather than wedging on it", () => {
    store.set("rankd-run-curated-v1", "{ not json");
    expect(loadCuratedRun([film("mine")])).toBeNull();
  });

  it("forgets a record that is the right JSON but the wrong shape", () => {
    store.set("rankd-run-curated-v1", JSON.stringify({ session: null, guests: "nope" }));
    expect(loadCuratedRun([film("mine")])).toBeNull();
  });

  it("clears on request", () => {
    saveCuratedRun(run());
    clearCuratedRun();
    expect(loadCuratedRun([film("mine")])).toBeNull();
  });
});
