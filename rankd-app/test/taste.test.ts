import { describe, expect, it } from "vitest";

import {
  axisLabel,
  biggestDisagreement,
  biggestMove,
  lockedShape,
  MIN_FOR_AXIS,
  rankdShape,
  shuffledShape,
  tasteAxes,
  tasteFor,
  tasteShape,
} from "@/lib/taste";
import { seedScore } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  rating: 4,
  score: seedScore(4),
  ...over,
});

/** n placed films of one genre, scored down from `top`. */
const run = (genre: string, n: number, top: number, rating: Film["rating"] = 4): Film[] =>
  Array.from({ length: n }, (_, i) =>
    film(`${genre}-${i}`, { rating, score: top - i, genres: [genre], lock: "hard" }),
  );

describe("what the axes measure", () => {
  it("puts a genre you rank highly above one you rank low", () => {
    const films = [...run("Drama", 3, 900), ...run("Horror", 3, 100)];
    const shape = tasteShape(films, ["Drama", "Horror"]);
    expect(shape.Drama).toBeGreaterThan(shape.Horror);
  });

  it("is about position, not how many you own", () => {
    // Horror is the bigger pile and still sits lower, because its films are
    // lower in the order. A library-share chart would say the opposite.
    const films = [...run("Drama", 3, 900), ...run("Horror", 30, 200)];
    const shape = tasteShape(films, ["Drama", "Horror"]);
    expect(shape.Drama).toBeGreaterThan(shape.Horror);
  });

  it("ignores films nothing has placed", () => {
    const placed = run("Drama", 3, 900);
    const unplaced = Array.from({ length: 20 }, (_, i) =>
      film(`d-un-${i}`, { score: 50 + i, genres: ["Drama"] }),
    );
    // The 20 unplaced films would drag the axis down if they counted, and would
    // change the denominator even if they sat at the top. Adding them must do
    // nothing at all.
    expect(tasteShape([...placed, ...unplaced], ["Drama"])).toEqual(tasteShape(placed, ["Drama"]));
  });

  it("drops a genre with too little behind it", () => {
    const films = [...run("Drama", 3, 900), ...run("Western", MIN_FOR_AXIS - 1, 800)];
    expect(Object.keys(tasteShape(films, ["Drama", "Western"]))).toEqual(["Drama"]);
    expect(tasteAxes(films)).not.toContain("Western");
  });

  it("never invents an axis for a library with nothing placed", () => {
    const films = Array.from({ length: 10 }, (_, i) => film(`u-${i}`, { genres: ["Drama"] }));
    expect(tasteAxes(films)).toEqual([]);
    expect(tasteFor(films)).toEqual([]);
  });
});

describe("the shape is tier-correct without doing anything about tiers", () => {
  // The film card had to scope its "Rankd says" number to a tier, because belief
  // means are not calibrated across tiers. A rank needs no such treatment: tier
  // bands never overlap, so a score sort is already a tier sort. This pins that.
  it("ranks a whole low tier below a whole high tier", () => {
    const films = [
      ...run("Drama", 3, seedScore(5) + 2, 5),
      ...run("Horror", 3, seedScore(1) + 2, 1),
    ];
    const shape = tasteShape(films, ["Drama", "Horror"]);
    expect(shape.Drama).toBeGreaterThan(0.5);
    expect(shape.Horror).toBeLessThan(0.5);
  });
});

describe("what moved", () => {
  it("names the genre that shifted most", () => {
    const was = { Drama: 0.5, Horror: 0.5 };
    const now = { Drama: 0.55, Horror: 0.9 };
    expect(biggestMove(was, now)?.genre).toBe("Horror");
  });

  it("says nothing when nothing moved", () => {
    const shape = { Drama: 0.5, Horror: 0.42 };
    expect(biggestMove(shape, shape)).toBeNull();
  });

  it("ignores a hair of drift", () => {
    // One placement in a big library nudges every axis. That is not news.
    expect(biggestMove({ Drama: 0.5 }, { Drama: 0.502 })).toBeNull();
  });

  it("skips an axis the earlier shape never had", () => {
    expect(biggestMove({}, { Drama: 0.9 })).toBeNull();
  });
});

describe("Rankd's order, next to yours", () => {
  // The two shapes must describe the SAME films, differing only in the ordering.
  // Anything else compares two populations and calls the difference taste.
  it("covers the same films as yours", () => {
    const films = [...run("Drama", 4, 900), ...run("Horror", 4, 300)];
    const axes = tasteAxes(films);
    expect(Object.keys(rankdShape(films, new Map(), axes)).sort()).toEqual(Object.keys(tasteShape(films, axes)).sort());
  });

  // The trap the film card hit: belief means are not calibrated across tiers, so
  // rating has to lead. With no log at all every belief sits at its seed, and a
  // low tier must still land below a high one.
  it("never lets a low tier out-rank a high one", () => {
    const films = [...run("Horror", 3, 10, 1), ...run("Drama", 3, 9000, 5)];
    const shape = rankdShape(films, new Map(), tasteAxes(films));
    expect(shape.Drama).toBeGreaterThan(shape.Horror);
  });

  it("names the genre you and Rankd disagree about most", () => {
    expect(biggestDisagreement({ Drama: 0.9, Horror: 0.5 }, { Drama: 0.4, Horror: 0.48 })?.genre).toBe("Drama");
    expect(biggestDisagreement({ Drama: 0.9 }, { Drama: 0.4 })?.youHigher).toBe(true);
  });

  it("says nothing when you agree", () => {
    const shape = { Drama: 0.7, Horror: 0.3 };
    expect(biggestDisagreement(shape, shape)).toBeNull();
  });
});

describe("axis labels", () => {
  it("shortens the genre names that ran off the chart", () => {
    expect(axisLabel("Science Fiction")).toBe("Sci-Fi");
    expect(axisLabel("Drama")).toBe("Drama");
  });
});

// ── Two POPULATIONS, not two orders ────────────────────────────────────────
//
// The chart used to draw your order against Rankd's over the same films, and
// they are the same order: a soft lock's `score` is written by `respreadTier`,
// which spreads a tier IN BELIEF ORDER, and tier bands never overlap — so
// sorting by score IS sorting by rating then belief. On a library placed by
// Fast Shuffle the two lines were identical and the chart drew one twice.
//
// Reported from a phone with 1 locked film against 234 shuffled: "they overlap
// the exact same." These pin the replacement so it cannot quietly come back.
describe("lockedShape and shuffledShape", () => {
  const mk = (id: string, genre: string, score: number, lock?: "soft" | "hard"): Film =>
    ({ id, title: id, rating: 4, score, genres: [genre], ...(lock ? { lock } : {}) }) as Film;

  // Twelve locked horror films and twelve shuffled dramas, so the two
  // populations genuinely differ and there are enough locks to clear the bar.
  const films = [
    ...Array.from({ length: 12 }, (_, i) => mk("h" + i, "Horror", 7900 - i, "hard")),
    ...Array.from({ length: 12 }, (_, i) => mk("d" + i, "Drama", 7000 - i, "soft")),
  ];
  const axes = ["Horror", "Drama"];

  it("draws the locked films only, and they are not the shuffled ones", () => {
    const locked = lockedShape(films, axes)!;
    const shuffled = shuffledShape(films, axes);
    expect(locked).not.toBeNull();
    // An empty axis is ZERO, not absent. "You have locked no dramas" is an
    // answer, and omitting the axis made the polygon refuse to close — which is
    // how a lock set concentrated in one genre, the interesting case, ended up
    // invisible. The zero is what draws the spike.
    expect(locked.Horror).toBeGreaterThan(0);
    expect(locked.Drama).toBe(0);
    expect(shuffled.Drama).toBeGreaterThan(0);
    expect(shuffled.Horror).toBe(0);
  });

  it("gives every axis a value, so the polygon can always close", () => {
    const locked = lockedShape(films, axes)!;
    const shuffled = shuffledShape(films, axes);
    for (const g of axes) {
      expect(locked[g]).toBeDefined();
      expect(shuffled[g]).toBeDefined();
    }
  });

  it("draws from the very first lock, however thin that makes it", () => {
    // There was a floor of ten here, on the reasoning that a spike from two
    // locked films invites a reading the data will not support. Reversed on the
    // user's call: the gold line is a drawing of what you have LOCKED, not a
    // claim about your taste, and "one horror film" answers that completely. A
    // wall at ten also hid the thing worth watching — the shape growing a limb
    // each time you settle something.
    const thin = [
      mk("h0", "Horror", 7900, "hard"),
      ...Array.from({ length: 12 }, (_, i) => mk("d" + i, "Drama", 7000 - i, "soft")),
    ];
    const shape = lockedShape(thin, axes)!;
    expect(shape).not.toBeNull();
    // A spike on the one genre you locked, and a true zero everywhere else.
    expect(shape.Horror).toBeGreaterThan(0);
    expect(shape.Drama).toBe(0);
    // The shuffled half is unaffected; it never had a minimum of its own.
    expect(shuffledShape(thin, axes).Drama).toBeDefined();
  });

  it("gives back nothing when you have locked nothing", () => {
    // The one case with no membership to draw. The caller says so instead.
    const none = Array.from({ length: 12 }, (_, i) => mk("d" + i, "Drama", 7000 - i, "soft"));
    expect(lockedShape(none, axes)).toBeNull();
  });

  it("scores both populations on the SAME standings", () => {
    // Both take their standings from the whole placed list, so a genre sitting
    // high means the same thing on either line. Separately-normalised shapes
    // would be two charts sharing a dial.
    const locked = lockedShape(films, axes)!;
    const shuffled = shuffledShape(films, axes);
    // Horror occupies the top half of the order, Drama the bottom.
    expect(locked.Horror).toBeGreaterThan(shuffled.Drama);
  });
});
