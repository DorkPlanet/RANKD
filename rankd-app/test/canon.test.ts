import { describe, expect, it } from "vitest";

import { placeCanon, scoreWithinTier, tierForRank } from "@/lib/canon/place";
import { keepers } from "@/lib/canon/retention";
import { describeMove, movement } from "@/lib/canon/movement";
import { TIER_RANGE } from "@/lib/tiers";
import type { SnapshotEntry } from "@/lib/snapshot";

const at = (iso: string) => new Date(iso);
const entry = (i: string, r: number): SnapshotEntry => ({ i, r, s: 10000 - r, t: 0 });

describe("placing the canon", () => {
  it("puts the top of the list at the top of the scale", () => {
    // Fractions of the canon, so the shape is the same whatever its size.
    expect(tierForRank(1, 250)).toBe(5);
    expect(tierForRank(25, 250)).toBe(5);
    expect(tierForRank(26, 250)).toBe(4.5);
    expect(tierForRank(75, 250)).toBe(4.5);
    expect(tierForRank(76, 250)).toBe(4);
    expect(tierForRank(151, 250)).toBe(3.5);
    expect(tierForRank(250, 250)).toBe(3.5);
  });

  it("fills all four tiers at 250, which absolute cut points did not", () => {
    // The bug this replaced: a ladder tuned for 1000 films put 80% of a 250-film
    // canon at 4.5 or better and left the bottom two tiers empty, so every film
    // read as a masterpiece and the rating said nothing.
    const tiers = new Set(placeCanon(250).map((p) => p.rating));
    expect([...tiers].sort()).toEqual([3.5, 4, 4.5, 5]);
  });

  it("keeps the same shape at any canon size", () => {
    for (const size of [100, 250, 1000]) {
      const counts = new Map<number, number>();
      for (const p of placeCanon(size)) counts.set(p.rating, (counts.get(p.rating) ?? 0) + 1);
      // Roughly a tenth five-star, whatever the size.
      expect(counts.get(5)! / size, `five-star share at ${size}`).toBeCloseTo(0.1, 1);
      expect(new Set(counts.keys()).size, `tiers used at ${size}`).toBe(4);
    }
  });

  it("clamps a rank past the end rather than falling through", () => {
    expect(tierForRank(100_000, 250)).toBe(3.5);
    expect(tierForRank(0, 250)).toBe(5);
  });

  it("survives an empty canon being asked about", () => {
    expect(tierForRank(1, 0)).toBe(5);
  });

  it("never runs a tier out of band, which is the reason rank drives this", () => {
    // Every TIER_RANGE band is exactly 1000 wide, so a tier holds at most 1000
    // distinct scores. Mapping TMDb's vote average instead would pile most of a
    // canon into one or two bands, because those ratings cluster between 7 and
    // 8.7 while positions spread by construction.
    const placed = placeCanon(1000);
    const perTier = new Map<number, number>();
    for (const p of placed) perTier.set(p.rating, (perTier.get(p.rating) ?? 0) + 1);
    for (const [rating, count] of perTier) {
      const [min, max] = TIER_RANGE[rating];
      expect(count, `tier ${rating}`).toBeLessThanOrEqual(max - min + 1);
    }
  });

  it("keeps every score inside its own tier's band", () => {
    for (const p of placeCanon(1000)) {
      const [min, max] = TIER_RANGE[p.rating];
      expect(p.score).toBeGreaterThanOrEqual(min);
      expect(p.score).toBeLessThanOrEqual(max);
    }
  });

  it("orders the whole canon strictly, so rank 1 really is first", () => {
    const placed = placeCanon(300);
    for (let i = 1; i < placed.length; i++) {
      // A later position must never outscore an earlier one, across tiers as
      // well as within them. This is what makes `buildSnapshot`'s score sort
      // reproduce the canon order exactly.
      expect(placed[i].score, `position ${i + 1}`).toBeLessThan(placed[i - 1].score);
    }
  });

  it("puts a lone film in a tier at the top of its band rather than dividing by zero", () => {
    expect(scoreWithinTier(5, 0, 1)).toBe(TIER_RANGE[5][1]);
  });

  it("spreads a tier from the top of its band to the bottom", () => {
    const [min, max] = TIER_RANGE[4];
    expect(scoreWithinTier(4, 0, 10)).toBe(max);
    expect(scoreWithinTier(4, 9, 10)).toBe(min);
  });

  it("handles an empty canon", () => {
    expect(placeCanon(0)).toEqual([]);
  });
});

describe("what to keep", () => {
  const now = at("2026-08-22T00:00:00Z");

  it("keeps every recent capture at full resolution", () => {
    const recent = [
      at("2026-08-22T00:00:00Z"),
      at("2026-08-15T00:00:00Z"),
      at("2026-08-08T00:00:00Z"),
      at("2026-08-01T00:00:00Z"),
    ];
    expect(keepers(recent, now).size).toBe(4);
  });

  it("thins older captures to one a month", () => {
    // Four in the same month, all past the weekly window.
    const march = [
      at("2026-03-01T00:00:00Z"),
      at("2026-03-08T00:00:00Z"),
      at("2026-03-15T00:00:00Z"),
      at("2026-03-22T00:00:00Z"),
    ];
    const kept = keepers(march, now);
    expect(kept.size).toBe(1);
    // The LATEST of the month, not the earliest. Keeping the earliest would make
    // "six months ago" drift further into the past as newer rows are discarded.
    expect(kept.has(at("2026-03-22T00:00:00Z").toISOString())).toBe(true);
  });

  it("thins ancient captures to one a year", () => {
    const old = [
      at("2019-01-05T00:00:00Z"),
      at("2019-06-05T00:00:00Z"),
      at("2019-11-05T00:00:00Z"),
      at("2018-04-05T00:00:00Z"),
    ];
    expect(keepers(old, now).size).toBe(2); // one for 2019, one for 2018
  });

  it("stays bounded over five years of weekly captures", () => {
    // The actual requirement: answerable forever, and it stops growing.
    const weekly: Date[] = [];
    for (let w = 0; w < 5 * 52; w++) {
      weekly.push(new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000));
    }
    const kept = keepers(weekly, now);
    expect(kept.size).toBeLessThan(45);
    expect(kept.size).toBeGreaterThan(25);
  });

  it("can still answer a week ago and six months ago after five years", () => {
    const weekly: Date[] = [];
    for (let w = 0; w < 5 * 52; w++) {
      weekly.push(new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000));
    }
    const kept = [...keepers(weekly, now)].map((iso) => new Date(iso).getTime());
    const DAY = 24 * 60 * 60 * 1000;
    const near = (target: number, tolerance: number) =>
      kept.some((t) => Math.abs(t - target) <= tolerance);

    expect(near(now.getTime() - 7 * DAY, 2 * DAY), "a week ago").toBe(true);
    expect(near(now.getTime() - 182 * DAY, 31 * DAY), "six months ago").toBe(true);
  });

  it("never drops the newest capture, even if the clock has jumped", () => {
    // Every rule is relative to `now`. A clock far in the future would put every
    // capture past the yearly cutoff and thin them all, including one written
    // seconds ago, on a table whose entire job is to remember.
    const captures = [at("2026-08-22T00:00:00Z"), at("2026-08-15T00:00:00Z")];
    const kept = keepers(captures, at("2099-01-01T00:00:00Z"));
    expect(kept.has(at("2026-08-22T00:00:00Z").toISOString())).toBe(true);
  });

  it("handles having nothing to keep", () => {
    expect(keepers([], now).size).toBe(0);
  });
});

describe("what moved", () => {
  it("reports a rise as a positive number", () => {
    // Ranks count DOWN towards the top, so going up is a decrease. The reader
    // sees "up 4", so the arithmetic has to come out positive.
    const now = [entry("heat", 6)];
    const then = [entry("heat", 10)];
    expect(movement(now, then).get("heat")).toBe(4);
  });

  it("reports a fall as a negative number", () => {
    // Sixth becomes tenth, so it dropped FOUR places. The distance is the
    // difference between the ranks, not the new rank.
    expect(movement([entry("heat", 10)], [entry("heat", 6)]).get("heat")).toBe(-4);
  });

  it("calls a film that was not there NEW, rather than inventing a distance", () => {
    // "Up 400 places" for something that was never in the canon would be
    // claiming a position it never held.
    expect(movement([entry("x", 12)], []).get("x")).toBe("new");
  });

  it("does not report a film that has left", () => {
    const moves = movement([entry("a", 1)], [entry("a", 1), entry("gone", 2)]);
    expect(moves.has("gone")).toBe(false);
  });

  it("says Held rather than nothing when a film has not moved", () => {
    expect(movement([entry("a", 3)], [entry("a", 3)]).get("a")).toBe(0);
  });
});

describe("how a move reads", () => {
  it("uses the words, not the numbers, for the two special cases", () => {
    expect(describeMove("new", "week")).toBe("New this week");
    expect(describeMove(0, "week")).toBe("Held");
  });

  it("says up and down in plain words", () => {
    expect(describeMove(4, "week")).toBe("Up 4 this week");
    expect(describeMove(-4, "week")).toBe("Down 4 this week");
  });

  it("says nothing at all when there is nothing to say", () => {
    // So the caller renders nothing rather than an empty chip.
    expect(describeMove(undefined, "week")).toBeNull();
  });

  it("never writes an em dash", () => {
    // VOICE.md rule 2, and these strings go on a page.
    for (const m of ["new" as const, 0, 4, -4]) {
      expect(describeMove(m, "week")).not.toContain("—");
    }
  });
});
