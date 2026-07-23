import type { Rating } from "./tiers";

export interface Film {
  id: string;
  title: string;
  year?: string;
  poster?: string;
  tagline?: string;
  rating: Rating; // star rating = tier
  score: number; // position within the tier's score band
  rankLocked?: boolean; // has settled into a slot this run (soft-lock rework: task #5)
}

// One in-flight placement: the contender is inserted among the films ABOVE it
// in stable order. lo = films it's surely beaten (floor); hi = films it could
// still beat (cap). It locks at position lo once lo === hi.
export interface PlacementRun {
  tier: Rating;
  maxDiff: number;
  filmId: string;
  lo: number;
  hi: number;
  capped: boolean; // a loss has capped hi → the window binary-settles
  streak: number;
  skipN: number; // >0 = next probe jumps N films up instead of one
}

export interface RankState {
  films: Film[];
  run: PlacementRun | null;
}
