import type { Rating } from "./tiers";
import type { Judgement } from "./log";
import type { Lock } from "./lock";
import type { Oracle } from "./relations";
import type { Take } from "./social/takes";

/**
 * A duel the climb settled from the record instead of putting on screen.
 *
 * Reported so the saving can be shown ("skipped 6 you'd already decided") rather
 * than happening invisibly. Carries no judgement id because it MINTED no
 * judgement: the user answered this pair once already, and writing a second row
 * saying so would be fabricating evidence out of the act of reading it.
 */
export interface AutoStep {
  a: string;
  b: string;
  o: "a" | "b" | "draw";
}

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
  // ── Why a film is where it is ────────────────────────────────────────────
  //
  // Up to three from the fixed set in lib/tags.ts, plus one short line. They sit
  // HERE, beside `lock`, because they are the same kind of thing: your judgement
  // of a film rather than a fact about it. That keeps them local, synchronous,
  // backed up with everything else, and out of the duel loop.
  //
  // A ranking says WHERE something sits and nothing about why. This is the why,
  // and it is deliberately not a review — see the header of lib/tags.ts for what
  // that distinction buys.
  tags?: string[];
  note?: string;
  // The moment you would point at, and whether pointing at it gives the film
  // away. `spoiler` covers the scene AND the note, because a line about a
  // scene is usually the same disclosure as the scene. See lib/tags.ts.
  scene?: string;
  spoiler?: boolean;
  // Published, and when, and where it sat at the time.
  //
  // The tags and note above are private by default and always have been. This
  // records the moment somebody chose to publish them, which is what turns them
  // into a take other people can read and reply to. Its ABSENCE means private,
  // so every film tagged before takes existed stays private, with no migration
  // and no promise broken retroactively. See lib/social/takes.ts.
  take?: Take;
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
  // Where it was made, and what it was shot in.
  //
  // The same free ride as the credits: both arrive on the response that fetches
  // the poster, so they cost no extra request, only the bytes. Kept because how
  // much of what you watch was made somewhere else is a fact about YOU that no
  // amount of ordering can say — and because a library that has never left one
  // country is worth being told so.
  //
  // ISO codes, not names. Two letters each rather than "United States of
  // America" 700 times over, in a store that shares one 5MB budget with the log.
  countries?: string[];
  language?: string;
  // TMDb had nothing under this title and year. Remembered so the fetch queue
  // stops retrying it every session — an unmatched film never becomes matched.
  noMatch?: boolean;
  // Which TMDb film this is, once anything has resolved it.
  tmdbId?: number;
  // ── The same question, asked of a book ───────────────────────────────────
  //
  // Google Books volume ids are opaque strings, so they cannot share `tmdbId`'s
  // number without widening a field that is persisted, synced and present in
  // every backup ever written. A second optional field costs nothing on a film
  // — it is simply absent — and avoids migrating live data to tidy up a type.
  //
  // `isbn` rides along because it is not merely an identifier: it IS the Open
  // Library cover URL, so a book that has one can be re-dressed without asking
  // Google anything. Kept for the same reason the credits are — it arrives on
  // the response that fetches the artwork, so it costs no extra request, and
  // throwing it away would mean paying for the whole library again to get it
  // back.
  bookId?: string;
  isbn?: string;
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
  /**
   * The user chose this artwork, so nothing may replace it.
   *
   * ── Why this is separate from `pinnedMeta` ──────────────────────────────
   *
   * `pinnedMeta` answers "which record is this", and it stops the whole sweep:
   * a corrected record is finished, whatever fields it is missing. That is far
   * too much to freeze over a cover. Somebody who picks a different edition's
   * artwork has not said the book is wrong, and the app should still go and
   * learn its page count and its categories.
   *
   * So this pins ONE field. `withMeta` keeps the stored poster when it is set
   * and takes everything else as usual, and the record still qualifies for the
   * queue — which is the difference between "I like this cover better" and "you
   * have the wrong book".
   *
   * Cleared by a match correction, because that IS a different book and its
   * cover belongs to the old one. See `withMeta`.
   */
  pinnedArt?: boolean;
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

  /**
   * Films the user has gathered to travel together, held contiguously in
   * `unconfirmed`.
   *
   * The fatigue this exists to answer: ten minutes into a climb you can see five
   * films that plainly belong beside each other, and the pile makes you carry
   * each of them up separately. A cluster carries them up once. One duel places
   * all five against an outsider instead of five near-identical climbs.
   *
   * ── What a cluster does and does not claim ────────────────────────────────
   *
   * It claims ADJACENCY — "these belong together" — and nothing about the order
   * inside it. That order is whatever the pile already had, which is to say
   * Rough Cut's scores plus whatever duels have been fought; `nudgeConfirmed`
   * corrects it. This is deliberately the same footing `flickToTop` and
   * `skipToFilm` stand on: a user assertion, supplied directly rather than
   * earned a duel at a time, committing nothing until a confirm.
   *
   * Which is why grouping writes NO judgements. There is no evidence that five
   * films are adjacent — there is only the user saying so — and minting rows for
   * pairs nobody was shown would put fabricated evidence into the log that
   * lib/relations.ts then reads back as fact. Only the block's face fights, and
   * only the face's duel is recorded.
   */
  clusters?: string[][];

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
  /**
   * What the user has already decided, so the climb stops asking twice.
   *
   * Built from the evidence log by lib/relations.ts and handed in by the shell,
   * which keeps the engine pure — it consults this, it never reads storage. Duels
   * whose answer this already holds are settled from the record instead of being
   * put on screen.
   *
   * OPTIONAL, and that is load-bearing: with no oracle the climb behaves exactly
   * as it always has, which is what lets every existing test stand unchanged and
   * gives the feature an off switch that is a single undefined.
   */
  oracle?: Oracle;
  /**
   * Duels THIS transition settled from the record — for the receipt on screen.
   *
   * Transient, and deliberately not on `PlacementSession`: `saveRun` serialises
   * the session, so a field there would round-trip through localStorage and
   * re-announce "skipped 6" every time the run was resumed.
   */
  resolved?: readonly AutoStep[];
}
