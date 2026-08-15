import type { Rating } from "./tiers";
import type { Judgement } from "./log";
import type { Lock } from "./lock";

export interface Film {
  id: string;
  title: string;
  year?: string;
  poster?: string;
  tagline?: string;
  rating: Rating; // star rating = tier
  score: number; // derived position within the tier's band (written on confirm)
  // How this film came to have a position — see lib/lock.ts. "hard" is a
  // placement the user committed to and the model may never move; "soft" is the
  // model's own, which counts but stays open to revision. Absent means unplaced,
  // and an unplaced film shows no number in the list.
  lock?: Lock;
  // Kept so a film can be found by who made it. These arrive on the very same
  // response as the poster and used to be thrown away, so storing them costs no
  // extra requests — only the bytes. Absent until that film's artwork is fetched.
  director?: string;
  cast?: string[];
  // Same free ride as the credits: genre and runtime come back on the response
  // that fetches the poster. Kept because they're what the profile uses to say
  // what kind of viewer you are, which no amount of ordering can tell it.
  genres?: string[];
  // TMDb's keywords, which are the only place anything like a subgenre lives —
  // its genre list is 19 flat labels with no children, so "slasher" and "found
  // footage" are keywords or they're nothing.
  keywords?: string[];
  runtime?: number;
  // TMDb had nothing under this title and year. Remembered so the fetch queue
  // stops retrying it every session — an unmatched film never becomes matched.
  noMatch?: boolean;
  // How many duels this film has been through. Cheap to keep, and it's the only
  // record of how much evidence sits behind a placement.
  duels?: number;
  // A film borrowed for one session and never added to the library.
  //
  // Ranking a director means ranking their work, not the subset of it you have
  // logged — so a person run can pull in films you have not seen. Those must not
  // silently join your library: you never rated them, and they would appear in
  // your list, your tier counts and your profile as though you had.
  //
  // So they are marked, and the two writes that could persist them —
  // `onFilms` and `onMeta` in the duel screen — drop them on the way out. The
  // flag exists on Film rather than in a side-set because every function that
  // handles films can then see it; a set held elsewhere is a rule you have to
  // remember, and this one is only load-bearing at the moment it is forgotten.
  guest?: boolean;
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
  // Films the subject was declared too close to call against. Kept apart from
  // wins and losses rather than folded into either, because a draw is neither —
  // and a session that consisted only of draws still fought, so the summary and
  // the "did this run establish anything?" check must be able to see them.
  spotDraws?: string[];
  // A promotion run in progress: the subject is working through the weakest
  // films of the tier above, weakest first. Emptying it earns the promotion.
  promotionQueue?: string[];
  // This run's pile spans star ratings, so its order is not a claim about any
  // one tier — and `confirm` therefore writes no score and no lock. The order
  // lives in `confirmed` and nowhere else, which is what lets a 3★ sit above a
  // 4★ here without a band being broken anywhere in the library. Set by a
  // person run; see the header of lib/people.ts for why that has to be true.
  crossTier?: boolean;
  /**
   * Confine this run's written scores to a slice of its tier, best-first.
   *
   * Set only for an `only` run inside one tier — "rank the upper pile of a Rough
   * Cut", where the films already occupy a sub-band and must stay in it. Without
   * it the first confirm re-spreads them across the whole tier and scatters the
   * pile back through the ones it was separated from. See `writeScores`.
   */
  band?: [number, number];
}

export interface RankState {
  films: Film[];
  session: PlacementSession | null;
  // Duels settled but not yet written to the evidence log. The engine is pure —
  // it does no IO — so it hands judgements up here and the shell drains them.
  // Every row carries an id, so draining twice writes once (see lib/log.ts).
  journal: Judgement[];
}
