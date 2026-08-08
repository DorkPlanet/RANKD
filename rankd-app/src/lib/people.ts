// Films by the people who made them.
//
// The library has carried `director` and `cast` on every film since the poster
// backfill — kept deliberately, because they arrive on the same TMDb response as
// the artwork and throwing them away would have meant paying for 828 fetches
// again later. This is the "later".
//
// ── Why this one is allowed to cross tier bands ─────────────────────────────
//
// Everywhere else in the app a 3★ can never outrank a 4★, and that is load-
// bearing: `score` lives inside a tier's band, and `respreadTier` keeps it there
// structurally rather than by remembering to clamp. A person's filmography is
// the one question that is inherently cross-tier — "my top ten Nolan films" does
// not care which star bucket each one landed in — so this had to break the rule
// or be useless.
//
// It breaks it by NOT WRITING ANYTHING. A person ranking is a view, derived from
// the Bayesian belief means, which live on a single 1–10 scale that has never
// known about tiers. So the cross-tier order is real, it is backed by the same
// evidence as everything else, and the tier bands in `score` are untouched —
// there is no second ordering to keep in sync, because there is no second
// ordering stored at all.
//
// The consequence worth stating plainly: ranking Nolan films against each other
// will NOT reorder your main list across tiers. It records the duels, the model
// learns from them, and the main list still respects the stars you gave. If a
// cross-tier duel keeps disagreeing with your ratings, that is what the review
// card is for.

import type { Belief } from "./bayes";
import type { Film } from "./types";

/** How someone was involved. A person can be both, and is listed under each. */
export type Role = "director" | "actor";

export interface Person {
  name: string;
  role: Role;
  /** How many films in the library they appear on, in that role. */
  count: number;
}

/**
 * Every person the library knows about, most films first.
 *
 * Directors and actors are kept as separate entries even for the same name —
 * Eastwood directing and Eastwood acting are different questions, and merging
 * them would make "rank his films" ambiguous in a way no UI could unpick.
 */
export function peopleIn(films: readonly Film[]): Person[] {
  const tally = new Map<string, Person>();
  const bump = (name: string, role: Role) => {
    const key = `${role}:${name}`;
    const at = tally.get(key);
    if (at) at.count++;
    else tally.set(key, { name, role, count: 1 });
  };

  for (const f of films) {
    if (f.director) bump(f.director, "director");
    for (const name of f.cast ?? []) bump(name, "actor");
  }

  return [...tally.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/**
 * The films in the library credited to this person in this role.
 *
 * Matched on the stored name string, because that is all there is — the library
 * holds names, not TMDb person ids. Two different people with the same name
 * would collapse into one entry. That is a real limitation and it is the honest
 * one to accept here: fixing it means storing person ids per film, which is
 * another 828 fetches, and the failure mode is rare and visible rather than
 * silent and wrong.
 */
export function filmsBy(films: readonly Film[], person: Person): Film[] {
  return films.filter((f) =>
    person.role === "director" ? f.director === person.name : (f.cast ?? []).includes(person.name),
  );
}

/**
 * A person's films in order, best first — across tiers.
 *
 * Belief means are the ordering, since they are the only number in the app that
 * spans the whole library. Films the model has never heard of fall back to their
 * star rating on the same scale (`rating × 2`, the seed `beliefs.ts` uses), so an
 * unranked filmography still comes back in a sensible order rather than an
 * arbitrary one.
 *
 * Ties break on `score`, which puts films the user actually placed above films
 * merely sharing their rating, and then on title so the order never wobbles
 * between renders.
 */
export function rankByBelief(films: readonly Film[], beliefs: Map<string, Belief>): Film[] {
  const meanOf = (f: Film) => beliefs.get(f.id)?.mean ?? f.rating * 2;
  return [...films].sort(
    (a, b) => meanOf(b) - meanOf(a) || b.score - a.score || a.title.localeCompare(b.title),
  );
}

/** One entry in a person's filmography — yours, or one you haven't logged. */
export interface CreditRow {
  title: string;
  year: string;
  poster?: string;
  /** The library film, when you have it. Absent means you have not logged it. */
  film?: Film;
}

/**
 * Merge a person's full filmography from TMDb with what the library already
 * holds, so the view can show both at once.
 *
 * The point is the gap. Seeing which of a director's films you have not logged
 * is the reason to open this screen at all — a list of only what you already
 * have answers a question you could already answer.
 *
 * Matched on title and year, the same key the library uses for film ids, so a
 * film you logged by hand and the same film arriving from a filmography resolve
 * to one row rather than two.
 */
export function mergeCredits(
  mine: readonly Film[],
  filmography: readonly { title: string; year: string; poster?: string }[],
): CreditRow[] {
  const key = (t: string, y: string) => `${t.toLowerCase()}|${y}`;
  const byKey = new Map(mine.map((f) => [key(f.title, f.year ?? ""), f]));

  const rows: CreditRow[] = filmography.map((c) => {
    const film = byKey.get(key(c.title, c.year));
    if (film) byKey.delete(key(c.title, c.year));
    return { title: c.title, year: c.year, poster: film?.poster ?? c.poster, film };
  });

  // Anything left over is in the library but not in the filmography TMDb
  // returned — a credit it lists differently, or one it has under another title.
  // Keeping them means the screen never appears to have lost a film you own.
  for (const f of byKey.values()) {
    rows.push({ title: f.title, year: f.year ?? "", poster: f.poster, film: f });
  }
  return rows;
}
