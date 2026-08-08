// What a curated ranking is *about*.
//
// Four things can be ranked and shared — a director, an actor, a genre, a star
// tier — and almost everything downstream needs to ask the same three questions
// of them: what do I call this, what kind of thing is it, and is it the same
// subject as that other one. Without a single type for that, each of those
// questions gets answered slightly differently in the card renderer, the resume
// store and the profile shelf, and they drift.
//
// ── Why this is separate from `Person` ─────────────────────────────────────
//
// `people.ts` owns `Person`, which carries a `count` and means "someone the
// library knows about". A subject means "the thing this ranking is of", which a
// genre and a tier also are and a `Person` cannot be. Folding them together
// would put a meaningless `count` on every genre. `subjectFromPerson` bridges.
//
// ── Why tier is here but never persisted ───────────────────────────────────
//
// A tier card is a live view over the master ranking rather than a curated run:
// King of the Hill over a tier DOES write scores and locks, so a second,
// cross-tier ordering of the same tier would be a rival answer to a question the
// main list has already settled. So `kind: "tier"` is a legitimate card subject
// and never a saved list or a resumable run. See HANDOVER.md.

import { starsFor, type Rating } from "./tiers";
import type { Person } from "./people";

export type RankSubject =
  | { kind: "director" | "actor"; name: string; portrait?: string }
  | { kind: "genre"; name: string }
  | { kind: "tier"; rating: Rating };

export type SubjectKind = RankSubject["kind"];

/**
 * Stable identity, and the primary key of the resume store.
 *
 * Asking to rank the same director twice must resume the run you left rather
 * than fork a second one, so this has to be derived from what the subject IS —
 * not from a generated id, which would be different every time you asked.
 */
export function subjectKey(s: RankSubject): string {
  return s.kind === "tier" ? `tier:${s.rating}` : `${s.kind}:${s.name.toLowerCase()}`;
}

/** What the card and the shelf call it. */
export function subjectTitle(s: RankSubject): string {
  return s.kind === "tier" ? starsFor(s.rating) : s.name;
}

/** The small uppercase line above the title. */
export function subjectEyebrow(s: RankSubject): string {
  switch (s.kind) {
    case "director":
      return "Director";
    case "actor":
      return "Actor";
    case "genre":
      return "Genre";
    case "tier":
      return "Tier";
  }
}

/** Only people have a face; genre and tier cards enlarge the #1 poster instead. */
export const hasPortrait = (s: RankSubject): boolean => s.kind === "director" || s.kind === "actor";

export const subjectFromPerson = (p: Person, portrait?: string): RankSubject => ({
  kind: p.role,
  name: p.name,
  ...(portrait ? { portrait } : {}),
});
