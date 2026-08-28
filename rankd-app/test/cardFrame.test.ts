import { describe, expect, it } from "vitest";

import { chartsFor } from "@/lib/card/data";
import { BLEED, H, SAFE_BOT, SAFE_H, SAFE_TOP, SCALE, W } from "@/lib/card/frame";
import { decadesIn } from "@/lib/profile";
import type { Film } from "@/lib/types";
import type { Rating } from "@/lib/tiers";

// The cards are the only thing this app produces that other people see, and both
// rules tested here fail SILENTLY — a broken safe area just means somebody's
// Instagram post has its bottom row cut off, and a degenerate chart just draws a
// flat circle that looks like an opinion. Neither throws.

describe("the card frame", () => {
  it("renders at the phone-native 1080x1920", () => {
    expect(W * SCALE).toBe(1080);
    expect(H * SCALE).toBe(1920);
  });

  it("puts a true 4:5 safe area in the middle", () => {
    // 4:5 is what an Instagram or Threads feed crops a portrait post to. If this
    // is not exactly 4:5 the crop takes a slice of real content on one edge.
    expect(SAFE_H / W).toBeCloseTo(5 / 4, 5);
    expect(SAFE_BOT - SAFE_TOP).toBe(SAFE_H);
  });

  it("centres it, so a centre-crop keeps all of it", () => {
    const above = SAFE_TOP;
    const below = H - SAFE_BOT;
    // Within a unit — the region is an odd number of units tall, so one band is
    // allowed to be a single unit deeper than the other.
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
    expect(BLEED).toBe(SAFE_TOP);
  });

  it("leaves enough bleed to be worth having", () => {
    // Under ~100 units the bands are too shallow to hold a wordmark and a footer
    // line, and the design would be pushing content into them out of necessity.
    expect(BLEED).toBeGreaterThan(100);
  });
});

const film = (over: Partial<Film> = {}): Film => ({
  id: over.title ?? "f",
  title: "A Film",
  year: "2001",
  rating: 4 as Rating,
  score: 800,
  ...over,
});

/** n films sharing one genre and one decade — the degenerate case. */
const uniform = (n: number): Film[] =>
  Array.from({ length: n }, (_, i) =>
    film({ id: `u${i}`, title: `Film ${i}`, year: "2004", genres: ["Drama"] }),
  );

describe("chartsFor", () => {
  it("draws nothing at all from an empty ranking", () => {
    expect(chartsFor([])).toBeUndefined();
  });

  it("withholds every chart when there is only one bucket of each", () => {
    // One genre, one decade, one tier. Every chart here would be a single full
    // bar meaning "all of them", which the stat strip says in words already.
    const charts = chartsFor(uniform(8));
    expect(charts?.genres).toBeUndefined();
    expect(charts?.decades).toBeUndefined();
    expect(charts?.tiers).toBeUndefined();
  });

  it("withholds the radar below three axes, because two axes is a line", () => {
    const films = [
      ...Array.from({ length: 4 }, (_, i) =>
        film({ id: `a${i}`, title: `A${i}`, genres: ["Drama"], score: 900 - i }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        film({ id: `b${i}`, title: `B${i}`, genres: ["Crime"], score: 500 - i }),
      ),
    ];
    expect(chartsFor(films)?.taste).toBeUndefined();
  });

  it("gives bars once there is something to compare", () => {
    const films = [
      ...uniform(4),
      film({ id: "x", title: "X", year: "1974", genres: ["Crime"], rating: 5 as Rating }),
      film({ id: "y", title: "Y", year: "1988", genres: ["Comedy"], rating: 3 as Rating }),
    ];
    const charts = chartsFor(films)!;
    expect(charts.genres!.length).toBeGreaterThanOrEqual(2);
    expect(charts.decades!.length).toBeGreaterThanOrEqual(2);
    expect(charts.tiers!.length).toBeGreaterThanOrEqual(2);
  });

  it("orders tiers by the star scale, not by how many are in each", () => {
    const films = [
      film({ id: "lo1", title: "lo1", rating: 2 as Rating }),
      film({ id: "lo2", title: "lo2", rating: 2 as Rating }),
      film({ id: "lo3", title: "lo3", rating: 2 as Rating }),
      film({ id: "hi", title: "hi", rating: 5 as Rating }),
    ];
    // 5★ has one film and 2★ has three, but a chart of a SCALE read out of scale
    // order is not a chart of that scale.
    expect(chartsFor(films)!.tiers!.map((t) => t.count)).toEqual([1, 3]);
  });
});

describe("decadesIn", () => {
  it("counts by decade, commonest first", () => {
    expect(
      decadesIn([{ year: "1994" }, { year: "1999" }, { year: "2001" }]),
    ).toEqual([
      { label: "1990s", count: 2 },
      { label: "2000s", count: 1 },
    ]);
  });

  it("drops films with no usable year rather than inventing a bucket", () => {
    // "Unknown" as a chart segment tells a reader nothing about their taste, and
    // on a fresh import it would frequently be the largest slice.
    expect(decadesIn([{ year: "1994" }, { year: undefined }, { year: "n/a" }])).toEqual([
      { label: "1990s", count: 1 },
    ]);
  });

  it("breaks a tie the same way twice, so a chart does not reshuffle itself", () => {
    const once = decadesIn([{ year: "1985" }, { year: "1995" }]);
    const twice = decadesIn([{ year: "1995" }, { year: "1985" }]);
    expect(once).toEqual(twice);
  });
});
