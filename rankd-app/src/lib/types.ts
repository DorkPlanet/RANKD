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
  // Which TMDb film this is, once anything has resolved it.
  tmdbId?: number;
  // The user said which film this is, so nothing may guess again.
  //
  // Matching by title is a guess and sometimes a wrong one — a niche title
  // returns whatever popular film shares a word with it, and the app then wears
  // that artwork with total confidence. `bestMatch` refuses the worst of those
  // now, but no amount of scoring makes the guess right every time, and a wrong
  // poster is jarring in a way a missing one is not: a blank says "not found",
  // artwork says "found it" and is believed.
  //
  // So a correction has to STICK. Without this the credits sweep would re-ask
  // by title on the next pass, land on the same wrong film, and quietly undo
  // the fix — which is worse than never offering one, because the user would
  // watch their correction evaporate and not know why.
  pinnedMeta?: boolean;
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

  // A promotion run in progress: the contender is working through the weakest
  // films of the tier above, weakest first. Clearing them earns the promotion.
  promotionQueue?: string[];
  /**
   * The run a promotion attempt interrupted, to be handed back when it ends.
   *
   * A promotion is offered one confirm into a King of the Hill climb that may be
   * an hour long, so it has to be something the run RETURNS from rather than
   * something that ends it. This holds the session exactly as it stood at that
   * confirm: losing restores it verbatim, winning restores it with the promoted
   * film lifted out. See `startPromotionDuel`.
   *
   * Never more than one level deep — a run already carrying a `promotionQueue`
   * is refused a promotion of its own, so this cannot chain.
   */
  resumeAfter?: PlacementSession;
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
