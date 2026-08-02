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
  // Kept so a film can be found by who made it. These arrive on the very same
  // response as the poster and used to be thrown away, so storing them costs no
  // extra requests — only the bytes. Absent until that film's artwork is fetched.
  director?: string;
  cast?: string[];
}

// One in-flight tier placement. The only committed data is `confirmed`; the
// `unconfirmed` list is a live, ephemeral shuffle that records nothing until a
// film is confirmed. Films climb from the bottom of `unconfirmed`; whoever
// reaches the top is confirmed by the user, then the climb restarts.
export type Mode = "koth" | "spotlight";

export interface PlacementSession {
  tier: Rating;
  // How far the pool reaches either side of `tier`, in stars, set independently:
  // a 1★ run can pull in 0.5★ below and 1.5★ above without being symmetric.
  spanBelow: number;
  spanAbove: number;
  confirmed: string[]; // committed ranking, top → down (confirmed[0] = #1)
  unconfirmed: string[]; // live order, index 0 = top of the pile, last = bottom
  contenderId: string; // the film currently climbing
  challengerId: string; // the film directly above it (its opponent); "" at the top
  needsConfirm: boolean; // contender reached the top → awaiting the user's confirm

  mode: Mode;
  // Spotlight only. `subjectId` is the film being re-placed — it's the one that
  // climbs, and the run ends when it settles rather than rolling on to the next.
  // `origScore`/`origRating` restore it if the run is abandoned part-way, since
  // starting a spotlight moves the film before it has earned anything.
  subjectId?: string;
  origScore?: number;
  origRating?: Rating;
  origIndex?: number; // where it stood in the tier before any of this
  // The slice of the tier the subject could still belong to, as indices into the
  // pile WITH THE SUBJECT REMOVED (that order never changes during a spotlight,
  // so the indices stay valid). Every duel narrows it by half; when `spotLo`
  // passes `spotHi` there is nowhere left it could be and the film is placed.
  spotLo?: number;
  spotHi?: number;
  spotWins?: string[];
  spotLosses?: string[];
  // A promotion run in progress: the subject is working through the weakest
  // films of the tier above, weakest first. Emptying it earns the promotion.
  promotionQueue?: string[];
}

export interface RankState {
  films: Film[];
  session: PlacementSession | null;
}
