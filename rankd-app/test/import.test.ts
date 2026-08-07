import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { beliefsFor } from "@/lib/beliefs";
import { mergeFilms, parseLetterboxdCsv, slugId } from "@/lib/importCsv";
import { buildList } from "@/lib/list";
import { newJudgement } from "@/lib/log";
import { nextPair } from "@/lib/matchmaker";
import { startRun, startSpotlight } from "@/lib/ladder";
import { ORDERED_TIERS, tierMax, tierMin } from "@/lib/tiers";

// A REAL Letterboxd export, not a hand-written fixture.
//
// Everything else in this suite runs on synthetic films with tidy ids and
// well-behaved ratings. This one runs on the actual library the app exists to
// rank — 861 films with real titles, which means commas, quotes, colons,
// non-ASCII, remakes sharing a name, and whatever else twenty years of cinema
// throws at a slug function. It is the difference between "the parser works"
// and "the parser works on the thing it was built for".
//
// THE FIXTURE IS NOT IN THE REPOSITORY, deliberately. It is one person's
// complete viewing history and this repository is public, so `ratings.csv` is
// gitignored. That means these tests cannot run on a fresh clone — so rather
// than failing there and training everyone to ignore a red suite, they skip and
// say so. On a machine that has the file they run for real.
//
// To enable them: drop a Letterboxd `ratings.csv` export at the path below.
const FIXTURE = fileURLToPath(new URL("./fixtures/ratings.csv", import.meta.url));
const hasFixture = existsSync(FIXTURE);

const parsed = hasFixture
  ? parseLetterboxdCsv(readFileSync(FIXTURE, "utf8"))
  : { films: [], skipped: 0 };

// Everything below needs the real export, so it is one switch rather than a
// guard repeated in every test.
const withFixture = hasFixture ? describe : describe.skip;

// The announcement lives in a test BODY, not at module scope, because vitest
// swallows console output during collection — a warning up there prints
// nowhere and the skip becomes silent, which is the one thing it must not be.
// A test body's output is reported, so this is the version that actually shows.
describe("the real-library fixture", () => {
  it(hasFixture ? "is present, so the real-library tests ran" : "is ABSENT — real-library tests skipped", () => {
    if (!hasFixture) {
      // eslint-disable-next-line no-console
      console.warn(
        "no test/fixtures/ratings.csv — parsing, re-import, slug collisions and\n" +
          "  the 861-film performance check were NOT verified in this run.\n" +
          "  Drop a Letterboxd ratings.csv export there to enable them.",
      );
    }
    expect(hasFixture).toBe(hasFixture); // records the state; never fails a clone
  });
});

withFixture("the real export", () => {
  it("imports essentially all of it", () => {
    expect(parsed.films.length).toBeGreaterThan(800);
    // A handful of skips is fine (unrated, or a duplicate slug); a lot is a bug.
    expect(parsed.skipped).toBeLessThan(parsed.films.length * 0.02);
  });

  it("gives every film a title, a legal rating and a seeded score in-band", () => {
    for (const f of parsed.films) {
      expect(f.title.length).toBeGreaterThan(0);
      expect(ORDERED_TIERS).toContain(f.rating);
      expect(f.score).toBeGreaterThanOrEqual(tierMin(f.rating));
      expect(f.score).toBeLessThanOrEqual(tierMax(f.rating));
    }
  });

  it("gives every film a distinct id", () => {
    expect(new Set(parsed.films.map((f) => f.id)).size).toBe(parsed.films.length);
  });

  it("survives titles with commas and quotes", () => {
    // Quoted fields are the classic CSV trap: a naive split on "," would shear
    // these titles in half and shift every later column.
    const tricky = parsed.films.filter((f) => /[,"]/.test(f.title));
    for (const f of tricky) {
      expect(f.rating).toBeDefined();
      expect(f.year).toMatch(/^\d{4}$/);
    }
  });

  it("keeps a sane year on effectively every row", () => {
    const dated = parsed.films.filter((f) => f.year);
    expect(dated.length).toBeGreaterThan(parsed.films.length * 0.98);
    for (const f of dated) expect(Number(f.year)).toBeGreaterThan(1870);
  });

  it("spreads across many tiers — a real library is not one flat block", () => {
    const tiers = new Set(parsed.films.map((f) => f.rating));
    expect(tiers.size).toBeGreaterThan(4);
  });
});

withFixture("re-importing", () => {
  it("keeps placements already earned", () => {
    const placed = parsed.films.map((f, i) => (i < 50 ? { ...f, lock: "hard" as const, score: f.score + 1 } : f));
    const merged = mergeFilms(placed, parsed.films);
    expect(merged.filter((f) => f.lock === "hard")).toHaveLength(50);
  });

  it("adds nothing on a second identical import", () => {
    expect(mergeFilms(parsed.films, parsed.films)).toHaveLength(parsed.films.length);
  });

  it("takes an updated star rating without touching the placement", () => {
    const first = parsed.films[0];
    const placed = [{ ...first, lock: "hard" as const, score: 7777 }];
    const rerated = mergeFilms(placed, [{ ...first, rating: first.rating === 5 ? 4 : 5 }]);
    expect(rerated[0].rating).not.toBe(first.rating);
    expect(rerated[0].lock).toBe("hard");
    expect(rerated[0].score).toBe(7777);
  });
});

describe("slugId", () => {
  it("separates a remake from its original by year", () => {
    expect(slugId("Suspiria", "1977")).not.toBe(slugId("Suspiria", "2018"));
  });

  it("survives punctuation and accents without collapsing distinct films", () => {
    expect(slugId("Amélie", "2001")).not.toBe(slugId("Amelia", "2001"));
    expect(slugId("WALL·E", "2008")).toBeTruthy();
  });
});

withFixture("the whole library, end to end", () => {
  it("builds a list at zero comparisons without claiming any ranks", () => {
    const model = buildList(parsed.films);
    expect(model.total).toBe(parsed.films.length);
    // Nothing is confirmed yet, so nothing has earned a number.
    expect(model.placedCount).toBe(0);
    expect(model.sections.every((s) => s.placed.length === 0)).toBe(true);
  });

  it("can start a run on the biggest tier", () => {
    const counts = new Map<number, number>();
    for (const f of parsed.films) counts.set(f.rating, (counts.get(f.rating) ?? 0) + 1);
    const biggest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const state = startRun(parsed.films, biggest as never);
    expect(state.session!.unconfirmed.length).toBe(counts.get(biggest));
  });

  it("can spotlight a film out of the real library", () => {
    const subject = parsed.films.find((f) => parsed.films.filter((o) => o.rating === f.rating).length > 5)!;
    const state = startSpotlight(parsed.films, subject.id);
    expect(state.session!.challengerId).toBeTruthy();
  });

  it("serves a pair from the whole library with no evidence at all", () => {
    const pair = nextPair(parsed.films, [], new Map(), { scope: { kind: "all" }, shouldExplore: () => false });
    expect(pair).not.toBeNull();
    expect(pair![0].id).not.toBe(pair![1].id);
  });

  // The one number worth knowing before trusting the model on a real library.
  //
  // The batch fit is O(entries x edges) per sweep and converges in however many
  // sweeps the evidence demands, so an empty log is NOT the interesting case —
  // with no edges it has nothing to iterate and finishes instantly, which would
  // be a reassuring and completely meaningless measurement. What matters is the
  // cost at the volumes a real user reaches.
  it("fits the whole library fast enough to stay off the interaction path", () => {
    const films = parsed.films;
    const timings: string[] = [];

    for (const count of [0, 2_000, 10_000, 40_000]) {
      // Judgements between films near each other in the seeded order — which is
      // what the matchmaker actually serves, and far harder to fit than random
      // pairs, since near-equal films take more sweeps to separate.
      const log = Array.from({ length: count }, (_, i) => {
        const a = films[i % films.length];
        const b = films[(i + 1 + (i % 7)) % films.length];
        return newJudgement(a.id, b.id, i % 5 === 0 ? "draw" : "a", "shuffle");
      });
      const started = performance.now();
      const beliefs = beliefsFor(films, log);
      const ms = performance.now() - started;
      expect(beliefs.size).toBe(films.length);
      timings.push(`${count.toLocaleString()} judgements → ${ms.toFixed(0)}ms`);
      // Generous, because CI machines vary. The point is to catch an order-of-
      // magnitude regression, not to police milliseconds.
      expect(ms).toBeLessThan(15_000);
    }

    // eslint-disable-next-line no-console
    console.log(`[perf] fitBeliefs over ${films.length} films — ${timings.join(" · ")}`);
  });
});
