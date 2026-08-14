// What there is to do, generated from what you own.
//
// ── Why the RNK screen needed this ─────────────────────────────────────────
//
// It was built twice as a picker and rejected twice: first as a dashboard of
// counts, then as a title card over a poster. Both answered "which tier?" when
// the question a returning player actually has is "what should I do?". A picker
// assumes you already have a plan. This hands you one.
//
// Two groups, and the split is the user's own framing: every tier, obviously,
// and then the personal things — your favourite director, your best genre — that
// only your library can suggest.
//
// ── Nothing here is stored ─────────────────────────────────────────────────
//
// Not one byte. A goal is derived from the library, the saved lists and the
// people the profile already works out, every time the screen renders. There is
// no goals key, no completion table and nothing to migrate, so a goal cannot go
// stale, cannot disagree with the ranking it describes, and survives a restore
// on a new device for free. It is the same discipline `bandsOf` uses to derive
// Rough Cut's piles rather than remembering them.
//
// ── A goal is a RankSubject ────────────────────────────────────────────────
//
// `subject.ts` already owns the four things this app can rank and already has
// `subjectKey`, described there as the primary key of the resume store. So a
// goal does not invent an identity: it carries a subject and borrows its key,
// its title and its eyebrow. That is also what lets completion be a lookup
// against saved lists, which record the same two facts.

import { bandsOf } from "./roughCut";
import { filmsInGenre, MIN_GENRE_RUN } from "./genres";
import type { SavedList } from "./lists";
import { fingerprint, topPeople } from "./profile";
import { tierProgress } from "./progress";
import { subjectKey, subjectTitle, type RankSubject } from "./subject";
import type { Rating } from "./tiers";
import type { Film } from "./types";

/**
 * Below this a tier is quicker to simply climb, so suggesting a Rough Cut first
 * would be extra ceremony for no saving. Above it the climb is quadratic and the
 * cut is one pass, which is the whole argument for that mode existing.
 */
const ROUGH_CUT_WORTH_IT = 30;

/**
 * How much of a tier has to sit outside the middle third before it counts as cut.
 *
 * Not "any film at all", which is what this tested first and which was wrong on
 * the real library: nine films of 185 had been dealt in an abandoned pass, and
 * that was enough to make the app stop suggesting the very thing the user had
 * plainly started doing. Meanwhile every untouched tier shouted the advice. The
 * two tiers with a cut in progress were the only two not offered one.
 */
const CUT_ENOUGH = 0.25;

/**
 * `startRun` throws below two films, and a two-film ranking is one duel, which
 * is not a goal. Three is what `autoCollections` already requires of a
 * collection before it is worth showing.
 */
const MIN_PERSONAL = 3;

/**
 * The biggest curated run a goal will propose.
 *
 * `CuratedPicker` already offers Top 50/25/10 for a large genre, and
 * `autoCollections` already slices to 25. Left uncapped this proposed ranking
 * 320 horror films by hand, which is not a goal anybody completes: it is the
 * quadratic problem Rough Cut exists to avoid, wearing a different hat.
 */
const CURATED_CAP = 25;

/** How many actors get a goal. Enough to be personal, few enough to stay a list. */
const ACTOR_GOALS = 2;

export interface Goal {
  /** `subjectKey(subject)`. Stable across renders and across devices. */
  key: string;
  subject: RankSubject;
  /** What the thing is called: the stars, or the person's or genre's name. */
  title: string;
  /** The status line underneath. Always true, never encouraging for its own sake. */
  note: string;
  done: number;
  total: number;
  complete: boolean;
  /**
   * This tier is big and has never been cut, so the cheap pass should be offered
   * instead of a climb of several thousand duels.
   */
  roughCutFirst?: boolean;
  /** When the list that completed it was saved. Personal goals only. */
  savedAt?: string;
}

export interface Goals {
  /** Every tier you own films in. The structural work.  */
  library: Goal[];
  /** Derived from your taste, so no two libraries suggest the same set. */
  personal: Goal[];
}

/**
 * The subject a saved list was of, as a key.
 *
 * `saveList` records the title and `subjectEyebrow` ("Director" / "Actor" /
 * "Genre"), which are exactly the two halves `subjectKey` is built from. Lower
 * cased on both sides so a rename or a differently-cased credit still matches.
 */
const keyOfList = (l: SavedList): string =>
  `${(l.source ?? "").toLowerCase()}:${l.name.toLowerCase()}`;

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

function tierGoal(
  films: readonly Film[],
  slice: { rating: Rating; total: number; ranked: number },
): Goal {
  const subject: RankSubject = { kind: "tier", rating: slice.rating };
  const left = slice.total - slice.ranked;
  const complete = left === 0;

  // A tier nobody has cut sits entirely on the seed score, which is `tierMid`,
  // so `bandsOf` reads it as all-middle. That is the signal, and it costs no
  // stored flag. See the header of roughCut.ts. Measured as a SHARE, not as a
  // presence — see `CUT_ENOUGH`.
  const bands = bandsOf(films, slice.rating);
  const outside = bands.top.length + bands.bottom.length;
  const uncut = slice.total === 0 || outside / slice.total < CUT_ENOUGH;
  const roughCutFirst = !complete && slice.total >= ROUGH_CUT_WORTH_IT && uncut;

  return {
    key: subjectKey(subject),
    subject,
    title: subjectTitle(subject),
    // Terse. Ten of these stack up, and a sentence on every row is a wall: the
    // first version repeated "Split it into three piles first" seven times, at
    // which point it stopped being advice and became wallpaper. The suggestion
    // now lives in the ACTION the row offers, not in a paragraph under it.
    note: complete
      ? "Every film settled"
      : slice.ranked === 0
        ? plural(slice.total, "film")
        : `${slice.ranked} of ${slice.total} placed`,
    done: slice.ranked,
    total: slice.total,
    complete,
    ...(roughCutFirst ? { roughCutFirst } : {}),
  };
}

function personalGoal(
  subject: RankSubject,
  count: number,
  lists: readonly SavedList[],
  /** The wider pool this run is a top slice of, when it was capped. */
  pool?: number,
): Goal {
  const key = subjectKey(subject);
  const saved = lists.find((l) => keyOfList(l) === key);
  return {
    key,
    subject,
    // A curated run writes no score and no lock, so there is no partial state to
    // report: either you have made this ranking or you have not. Progress is
    // deliberately all-or-nothing rather than invented.
    title: subjectTitle(subject),
    note: saved
      ? `Ranked ${plural(saved.entries.length, "film")}`
      : pool && pool > count
        ? `Top ${count} of ${pool}`
        : plural(count, "film"),
    done: saved ? count : 0,
    total: count,
    complete: !!saved,
    ...(saved ? { savedAt: saved.savedAt } : {}),
  };
}

/**
 * Everything worth doing, given this library and what has already been saved.
 *
 * `lists` decides completion for the personal goals. Pass `loadLists()`; an
 * empty array simply means nothing is ticked yet.
 */
export function buildGoals(films: readonly Film[], lists: readonly SavedList[] = []): Goals {
  const library = tierProgress(films)
    .filter((s) => s.total > 0) // an empty tier is not work, it is an absence
    .map((s) => tierGoal(films, s));

  const top = topPeople(films as Film[]);
  const print = fingerprint(films);
  const personal: Goal[] = [];

  const offer = (subject: RankSubject, count: number, pool?: number) => {
    if (count >= MIN_PERSONAL) personal.push(personalGoal(subject, count, lists, pool));
  };

  if (top.director) offer({ kind: "director", name: top.director.name }, top.director.count);
  for (const a of top.actors.slice(0, ACTOR_GOALS)) offer({ kind: "actor", name: a.name }, a.count);
  // The genre you own most of, matching what the profile already tells you
  // ("You keep returning to"), rather than the best-rated one. Two different
  // claims from one word would be the `GENRE: ACTION` mistake again.
  //
  // Capped: a goal has to be finishable, and 320 films by hand is not.
  if (print.genre) {
    const pool = filmsInGenre(films, print.genre.name).length;
    const size = Math.min(pool, CURATED_CAP);
    if (size >= Math.max(MIN_GENRE_RUN, MIN_PERSONAL)) {
      offer({ kind: "genre", name: print.genre.name }, size, pool);
    }
  }

  // No subgenre goal. `topPeople` finds one and the profile shows it, but a
  // keyword is not a `RankSubject` and nothing in the app can start a run over
  // one — offering a goal you cannot begin is worse than not offering it.
  // Subgenre runs are in the handover's backlog; this is where they would land.

  return { library, personal };
}

/** Unfinished first, and among those the nearest to done. Completed sink quietly. */
export function byUrgency(goals: readonly Goal[]): Goal[] {
  return [...goals].sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    return b.total - a.total;
  });
}
