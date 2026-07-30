import type { Rating } from "./tiers";

export interface Film {
  id: string;
  title: string;
  year?: string;
  poster?: string;
  tagline?: string;
  rating: Rating; // star rating = tier
  score: number; // derived position within the tier's band (written on confirm)
  confirmed?: boolean; // committed placement this tier — soft, re-openable
}

// One in-flight tier placement. The only committed data is `confirmed`; the
// `unconfirmed` list is a live, ephemeral shuffle that records nothing until a
// film is confirmed. Films climb from the bottom of `unconfirmed`; whoever
// reaches the top is confirmed by the user, then the climb restarts.
export interface PlacementSession {
  tier: Rating;
  maxDiff: number;
  confirmed: string[]; // committed ranking, top → down (confirmed[0] = #1)
  unconfirmed: string[]; // live order, index 0 = top of the pile, last = bottom
  contenderId: string; // the film currently climbing
  challengerId: string; // the film directly above it (its opponent); "" at the top
  needsConfirm: boolean; // contender reached the top → awaiting the user's confirm
}

export interface RankState {
  films: Film[];
  session: PlacementSession | null;
}
