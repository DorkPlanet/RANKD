import { describe, expect, it } from "vitest";

import { mergeLogs, parseLog, serialiseLog, type Judgement } from "@/lib/log";
import { canMerge, mergeFilmLists, mergeKeys, rederive } from "@/lib/mergeLibrary";
import type { Film } from "@/lib/types";
import type { Rating } from "@/lib/tiers";

// Two devices, both played, now reconciling.
//
// The chooser used to be the only answer here, on the argument in `reconcile.ts`
// that two libraries cannot be combined without inventing judgements. That is
// true of the derived state and false of the evidence: every row in a union is a
// duel somebody really fought. These tests pin the difference.

const j = (id: string, a: string, b: string, t: number, o: "a" | "b" = "a"): Judgement => ({
  id,
  a,
  b,
  o,
  m: "koth",
  t,
});

const film = (over: Partial<Film> & { id: string }): Film => ({
  title: over.id,
  rating: 4 as Rating,
  score: 7500,
  ...over,
});

const asFile = (js: Judgement[], tombstones: string[] = []) =>
  serialiseLog({ judgements: js, tombstones });

describe("mergeLogs", () => {
  it("keeps every judgement from both sides", () => {
    const mine = parseLog(asFile([j("1-aa", "heat", "drive", 100)]));
    const theirs = parseLog(asFile([j("2-bb", "dune", "alien", 200)]));

    expect(mergeLogs(mine, theirs).judgements.map((x) => x.id)).toEqual(["1-aa", "2-bb"]);
  });

  // Rows both devices hold from an earlier sync carry identical ids. Doubling
  // them would be two votes for one judgement, which skews every belief.
  it("does not double a row both sides already had", () => {
    const shared = j("1-aa", "heat", "drive", 100);
    const merged = mergeLogs(parseLog(asFile([shared])), parseLog(asFile([shared])));

    expect(merged.judgements).toHaveLength(1);
  });

  it("returns them oldest first, whichever side they came from", () => {
    const mine = parseLog(asFile([j("3-aa", "a", "b", 300)]));
    const theirs = parseLog(asFile([j("1-bb", "c", "d", 100), j("2-bb", "e", "f", 200)]));

    expect(mergeLogs(mine, theirs).judgements.map((x) => x.t)).toEqual([100, 200, 300]);
  });

  // The dangerous one. Undo removes a row locally; the other device still holds
  // it, and a naive union hands the mis-tap straight back.
  it("does not resurrect a retracted judgement", () => {
    const row = j("1-aa", "heat", "drive", 100);
    const undone = parseLog(asFile([], ["1-aa"]));
    const stale = parseLog(asFile([row]));

    const merged = mergeLogs(undone, stale);

    expect(merged.judgements).toHaveLength(0);
    expect(merged.tombstones).toContain("1-aa");
  });

  it("carries tombstones through a round trip", () => {
    const file = parseLog(serialiseLog({ judgements: [], tombstones: ["gone"] }));
    expect(file.tombstones).toEqual(["gone"]);
  });

  // Two devices disagreeing about the same pair is two real opinions, and the
  // fit absorbs the contradiction. Deduping by pair would be picking a winner,
  // which is the one thing a merge may not do.
  it("keeps contradictory judgements about the same pair", () => {
    const mine = parseLog(asFile([j("1-aa", "heat", "drive", 100, "a")]));
    const theirs = parseLog(asFile([j("2-bb", "heat", "drive", 200, "b")]));

    expect(mergeLogs(mine, theirs).judgements).toHaveLength(2);
  });

  it("reads a log written before tombstones existed", () => {
    const old = JSON.stringify({ v: 1, f: ["heat", "drive"], r: [["1", 0, 1, "a", "k", 100]] });
    expect(parseLog(old).judgements).toHaveLength(1);
    expect(parseLog(old).tombstones).toEqual([]);
  });
});

describe("mergeFilmLists", () => {
  it("takes the union, not the intersection", () => {
    const merged = mergeFilmLists([film({ id: "heat" })], [film({ id: "drive" })]);
    expect(merged.map((f) => f.id).sort()).toEqual(["drive", "heat"]);
  });

  // A confirm is a commitment. Losing one silently is the outcome the whole
  // exercise exists to avoid.
  it("keeps a hard lock from either side", () => {
    const a = mergeFilmLists([film({ id: "heat", lock: "hard" })], [film({ id: "heat" })]);
    const b = mergeFilmLists([film({ id: "heat" })], [film({ id: "heat", lock: "hard" })]);

    expect(a[0].lock).toBe("hard");
    expect(b[0].lock).toBe("hard");
  });

  it("keeps a poster correction the user made", () => {
    const merged = mergeFilmLists(
      [film({ id: "heat" })],
      [film({ id: "heat", pinnedMeta: true, tmdbId: 949 })],
    );
    expect(merged[0].pinnedMeta).toBe(true);
  });

  it("fills a gap on one side from the other", () => {
    const merged = mergeFilmLists(
      [film({ id: "heat", duels: 9 })],
      [film({ id: "heat", duels: 1, poster: "/heat.jpg" })],
    );
    expect(merged[0].poster).toBe("/heat.jpg");
    expect(merged[0].duels).toBe(9);
  });
});

describe("rederive", () => {
  it("counts duels from the evidence rather than trusting either tally", () => {
    const films = [film({ id: "heat", duels: 99 }), film({ id: "drive", duels: 0 })];
    const log = [j("1-aa", "heat", "drive", 100), j("2-aa", "heat", "drive", 200)];

    const out = rederive(films, log);

    expect(out.find((f) => f.id === "heat")!.duels).toBe(2);
    expect(out.find((f) => f.id === "drive")!.duels).toBe(2);
  });

  it("leaves a hard lock alone", () => {
    const films = [film({ id: "heat", lock: "hard" }), film({ id: "drive" })];
    const out = rederive(films, [j("1-aa", "heat", "drive", 100)]);
    expect(out.find((f) => f.id === "heat")!.lock).toBe("hard");
  });
});

describe("canMerge", () => {
  const played = asFile([j("1-aa", "a", "b", 100)]);
  const noEvidence = asFile([]);

  // The rule used to be "both logs must be non-empty", which conflated two
  // completely different reasons a log can be empty. The comment here always
  // described the RIGHT one; there was simply no way to tell them apart.
  it("refuses when this browser's log was emptied on purpose", () => {
    // "Clear my ranking" throws the log away so the model cannot re-place
    // everything from the same duels. A union hands it straight back.
    expect(canMerge(noEvidence, played, true)).toBe(false);
  });

  it("merges when this browser simply has not played yet", () => {
    // A second device that imported a CSV. The union of an empty log and a real
    // one IS the real one — nothing is invented and nothing can be lost — yet
    // this used to send the user to the chooser on their very first sync.
    expect(canMerge(noEvidence, played, false)).toBe(true);
  });

  it("defaults to the cautious answer when the caller does not say", () => {
    // Only matters for the flag's own case; the caller in sync.ts always says.
    expect(canMerge(noEvidence, played)).toBe(true);
  });

  it("merges when neither side has any evidence at all", () => {
    // Two libraries with nothing to disagree about. Asking someone to pick one
    // here DELETES the other side's films to settle a difference of opinion
    // that does not exist.
    expect(canMerge(noEvidence, noEvidence)).toBe(true);
  });

  it("still asks when the SERVER's log is empty and this one is not", () => {
    // The mirror of the first case, seen from the other device — and the only
    // protection for a "Clear my ranking" performed elsewhere. Nothing in this
    // payload distinguishes "they cleared it" from "they imported and never
    // played", so it stays a question.
    expect(canMerge(played, noEvidence)).toBe(false);
  });

  it("allows it when both sides have really played", () => {
    expect(canMerge(played, asFile([j("2-bb", "c", "d", 200)]))).toBe(true);
  });
});

describe("mergeKeys", () => {
  it("produces one payload holding both sides' work", () => {
    const mine = {
      "rankd-app-v1": JSON.stringify([film({ id: "heat", lock: "hard" })]),
      "rankd-log-v1": asFile([j("1-aa", "heat", "drive", 100)]),
      "rankd-brightness": "0.13",
    };
    const theirs = {
      "rankd-app-v1": JSON.stringify([film({ id: "drive" })]),
      "rankd-log-v1": asFile([j("2-bb", "dune", "alien", 200)]),
      "rankd-brightness": "0.9",
    };

    const merged = mergeKeys(mine, theirs);

    const films = JSON.parse(merged["rankd-app-v1"]) as Film[];
    expect(films.map((f) => f.id).sort()).toEqual(["drive", "heat"]);
    expect(films.find((f) => f.id === "heat")!.lock).toBe("hard");
    expect(parseLog(merged["rankd-log-v1"]).judgements).toHaveLength(2);
    // A preference is this device's own; neither side's is more correct.
    expect(merged["rankd-brightness"]).toBe("0.13");
  });
});
