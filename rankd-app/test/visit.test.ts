import { describe, expect, it } from "vitest";

import { snapshotOf } from "@/lib/visit";
import type { Film } from "@/lib/types";

// What survives of this suite, and why.
//
// "Last time" was cut on 21 Aug, taking `deltaOf`, `recapLine` and `agoLabel`
// with it. `snapshotOf` stayed, and its tests are now MORE load-bearing rather
// than less: it is the only remaining reason `lib/visit.ts` exists, feeding the
// taste chart's "where you started" outline. Deleting the module wholesale —
// which is what "nothing imports it any more" seemed to suggest — would have
// silently removed that line from the chart.

const film = (over: Partial<Film> = {}): Film => ({
  id: "x",
  title: "X",
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
