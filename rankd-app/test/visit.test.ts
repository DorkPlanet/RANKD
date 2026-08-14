import { describe, expect, it } from "vitest";

import { agoLabel, deltaOf, recapLine, snapshotOf, type Snapshot, type VisitRecord } from "@/lib/visit";
import type { Film } from "@/lib/types";

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  at: "2026-08-13T10:00:00.000Z",
  films: 861,
  settled: 40,
  duels: 500,
  badges: 12,
  ...over,
});

describe("deltaOf", () => {
  // A first visit has nothing to compare against, and a row of zeros is not a
  // recap — it is an accusation, aimed at someone who has just arrived.
  it("says nothing on a first visit", () => {
    expect(deltaOf({ current: snap() })).toBeNull();
  });

  it("says nothing when a sitting achieved nothing", () => {
    expect(deltaOf({ prev: snap(), current: snap({ at: "2026-08-14T10:00:00.000Z" }) })).toBeNull();
  });

  it("reports what the previous sitting amounted to", () => {
    const out = deltaOf({
      prev: snap(),
      current: snap({ at: "2026-08-14T10:00:00.000Z", duels: 524, settled: 46, badges: 14 }),
    });
    expect(out).toMatchObject({ duels: 24, settled: 6, badges: 2, films: 0 });
  });

  it("carries the date the previous sitting began", () => {
    const out = deltaOf({ prev: snap({ at: "2026-08-01T09:00:00.000Z" }), current: snap({ duels: 501 }) });
    expect(out?.since).toBe("2026-08-01T09:00:00.000Z");
  });

  it("notices a library that grew", () => {
    const out = deltaOf({ prev: snap(), current: snap({ films: 900 }) });
    expect(out?.films).toBe(39);
  });

  // Clearing the ranking moves every one of these counts DOWN. "-154 duels" is
  // not something anyone should read on their own profile.
  it("never reports a negative, so a reset cannot produce one", () => {
    const out = deltaOf({ prev: snap(), current: snap({ duels: 0, settled: 0, badges: 3, films: 861 }) });
    expect(out).toBeNull();
  });

  it("still reports the gains when only some counts fell", () => {
    const out = deltaOf({ prev: snap(), current: snap({ duels: 0, settled: 0, films: 870 }) });
    expect(out).toMatchObject({ films: 9, duels: 0, settled: 0 });
  });
});

const film = (over: Partial<Film> = {}): Film => ({
  id: `${over.title ?? "f"}-${over.year ?? "2000"}`,
  title: "A Film",
  year: "2000",
  rating: 3,
  score: 0,
  ...over,
});

describe("snapshotOf", () => {
  it("counts only hard locks as settled", () => {
    const out = snapshotOf(
      [film({ id: "a", lock: "hard" }), film({ id: "b", lock: "soft" }), film({ id: "c" })],
      0,
    );
    expect(out.settled).toBe(1);
    expect(out.films).toBe(3);
  });

  // The per-film `duels` counter is incremented on BOTH sides of every duel, so
  // summing it double-counts. The recap has to agree with the number RunStatus
  // showed the player during that same sitting, which comes from the log.
  it("takes duels from the log, not from the per-film counter", () => {
    const out = snapshotOf([film({ id: "a", duels: 9 }), film({ id: "b", duels: 9 })], 9);
    expect(out.duels).toBe(9);
  });

  it("survives an empty library", () => {
    expect(snapshotOf([], 0)).toMatchObject({ films: 0, settled: 0, duels: 0 });
  });
});

describe("recapLine", () => {
  const delta = (over: Partial<Parameters<typeof recapLine>[0]> = {}) => ({
    duels: 0,
    settled: 0,
    films: 0,
    badges: 0,
    since: "2026-08-13T10:00:00.000Z",
    ...over,
  });

  it("reads as a sentence, in the separator RunStatus already uses", () => {
    expect(recapLine(delta({ duels: 24, settled: 6 }))).toBe("24 duels · 6 settled");
  });

  // "0 settled" appended to a sitting spent duelling reads as something missing.
  it("omits the parts that did not move", () => {
    expect(recapLine(delta({ duels: 24 }))).toBe("24 duels");
  });

  it("counts one of anything in the singular", () => {
    expect(recapLine(delta({ duels: 1, films: 1, badges: 1 }))).toBe("1 duel · 1 film added · 1 badge");
  });

  it("says what happened to the library, not just to the ranking", () => {
    expect(recapLine(delta({ films: 39, badges: 2 }))).toBe("39 films added · 2 badges");
  });
});

describe("agoLabel", () => {
  const at = (iso: string) => new Date(iso);

  it("calls the same day today", () => {
    expect(agoLabel("2026-08-14T09:00:00", at("2026-08-14T21:00:00"))).toBe("earlier today");
  });

  // Nine hours away across midnight is yesterday to everyone except a clock.
  it("counts calendar days, not 24-hour blocks", () => {
    expect(agoLabel("2026-08-13T23:00:00", at("2026-08-14T08:00:00"))).toBe("yesterday");
  });

  it("does not call 20 hours within one day yesterday", () => {
    expect(agoLabel("2026-08-14T01:00:00", at("2026-08-14T21:00:00"))).toBe("earlier today");
  });

  it("counts days inside the first week", () => {
    expect(agoLabel("2026-08-11T10:00:00", at("2026-08-14T10:00:00"))).toBe("3 days ago");
  });

  it("gets vaguer as it gets older", () => {
    expect(agoLabel("2026-08-06T10:00:00", at("2026-08-14T10:00:00"))).toBe("last week");
    expect(agoLabel("2026-07-24T10:00:00", at("2026-08-14T10:00:00"))).toBe("3 weeks ago");
    expect(agoLabel("2026-05-14T10:00:00", at("2026-08-14T10:00:00"))).toBe("3 months ago");
  });

  // A clock that has gone backwards, or a snapshot written on a device set to
  // tomorrow. Never "-2 days ago".
  it("does not go negative", () => {
    expect(agoLabel("2026-08-20T10:00:00", at("2026-08-14T10:00:00"))).toBe("earlier today");
  });

  it("says nothing at all rather than Invalid Date", () => {
    expect(agoLabel("not a date")).toBe("");
  });
});
