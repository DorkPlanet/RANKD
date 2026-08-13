import { describe, expect, it } from "vitest";

import { deltaOf, type Snapshot, type VisitRecord } from "@/lib/visit";

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
