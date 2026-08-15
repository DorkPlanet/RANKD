// Star ratings act as tiers; each tier owns a non-overlapping score band, so
// global order is preserved while films are placed within their own tier.
// Ported verbatim from the prototype (rankd.html).

export type Rating = 5 | 4.5 | 4 | 3.5 | 3 | 2.5 | 2 | 1.5 | 1 | 0.5;

export const TIER_RANGE: Record<number, [number, number]> = {
  5: [9001, 10000],
  4.5: [8001, 9000],
  4: [7001, 8000],
  3.5: [6001, 7000],
  3: [5001, 6000],
  2.5: [4001, 5000],
  2: [3001, 4000],
  1.5: [2001, 3000],
  1: [1001, 2000],
  0.5: [1, 1000],
};

export const ORDERED_TIERS: Rating[] = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];

export const tierMin = (r: number): number => (TIER_RANGE[r] ?? TIER_RANGE[0.5])[0];
export const tierMax = (r: number): number => (TIER_RANGE[r] ?? TIER_RANGE[0.5])[1];
export const tierMid = (r: number): number => Math.round((tierMin(r) + tierMax(r)) / 2);

// Seed score for a freshly-rated film — the midpoint of its tier.
export const seedScore = (r: number): number => tierMid(r);

// A rating drawn as stars — "★★★★" / "★★★★½" — so a tier reads as what it is
// rather than as a number beside a symbol.
export const starsFor = (r: number): string => "★".repeat(Math.floor(r)) + (r % 1 ? "½" : "");

// The next rating up, or undefined at 5★. Used by promotion.
export const tierAbove = (r: number): Rating | undefined => {
  const i = ORDERED_TIERS.indexOf(r as Rating);
  return i > 0 ? ORDERED_TIERS[i - 1] : undefined; // ORDERED_TIERS runs 5 → 0.5
};
