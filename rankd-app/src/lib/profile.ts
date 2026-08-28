// Who the library belongs to.
//
// ── Three fields left this file, and why ──────────────────────────────────
//
// `name`, `bio` and `avatarUrl` used to live here, in localStorage, synced only
// as part of the library blob. They are PUBLIC now: a stranger reads them off a
// profile. A public field held only on a phone has no uniqueness, no moderation
// surface, and no way for a second person to read it at all, so all three moved
// to the `user` row. See `Me` in lib/account.ts.
//
// What stayed is everything relative to a LIBRARY rather than to a person: a
// banner is a frame from a film you own, a pin names a ranking or a director you
// rate. Those describe this library. They are not your identity.
//
// `takeLegacyIdentity` at the bottom is the one-way door between the two, run
// once per browser by `HandleGate`.
//
// Nothing here stores an image — only ever a reference to one. A banner is a
// film id and a still URL; an avatar is a URL too. The poster art is already in
// the library, uploads live in blob storage, and the whole profile costs a few
// hundred bytes instead of competing with 861 films for the same 5MB of
// localStorage. Adding `avatarUrl` did not change that rule, it used it.

import type { Film } from "./types";
import type { Rating } from "./tiers";
import { markDirty } from "./syncState";

const KEY = "rankd-profile-v1";

export interface Profile {
  bannerFilmId?: string;
  // A frame from a scene, not a poster — posters are the library's currency and
  // seeing one more of them at the top of your own profile goes stale fast. Held
  // as a plain URL, so the whole profile stays a few hundred bytes.
  bannerStill?: string;
  /**
   * Saved rankings you chose to show, newest pin last, capped at `MAX_PINNED`.
   *
   * Ids rather than copies: a pinned ranking is the SAME list you can open from
   * the shelf, so renaming or deleting it has to be felt in one place. A pin
   * naming a list that has since been deleted is simply skipped when rendering,
   * which is why nothing needs to clean up after `deleteList`.
   */
  pinnedListIds?: string[];
  /**
   * Directors and actors you chose to keep at the top, newest pin last.
   *
   * ── Why the role is part of the id ──────────────────────────────────────
   *
   * Stored as `"director:Name"` and `"actor:Name"` rather than a bare name,
   * because plenty of people are both — Eastwood, Gerwig, Affleck, Wong. A bare
   * name would pin somebody in a group they were never pinned in, or in both at
   * once, and there would be no way to say which you meant.
   *
   * Same self-cleaning property as `pinnedListIds`: a pin naming somebody whose
   * films have since gone is skipped when the list is built, so nothing has to
   * tidy up after a removal.
   */
  pinnedPeople?: string[];
}

/** How a pinned person is identified. The role is part of it — see above. */
export const personKey = (role: "director" | "actor", name: string): string => `${role}:${name}`;

/** Three is "a couple" with room to breathe, and it keeps the row one line. */
export const MAX_PINNED = 3;

/**
 * Its own number rather than `MAX_PINNED`, and deliberately larger.
 *
 * Three is right for saved rankings because they share a single row. This is
 * two groups — directors and actors — and three each is the natural read, so
 * reusing the rankings' number would quietly halve it for a different shape of
 * thing. Numbers that mean different things get different names.
 */
export const MAX_PINNED_PEOPLE = 6;

// Every field is optional now that identity has moved out, so an empty profile
// really is empty. Kept as a shared constant rather than an inline `{}` so the
// "nothing set yet" state has one identity and reference equality still holds.
export const EMPTY_PROFILE: Profile = {};

export function loadProfile(): Profile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Profile) };
  } catch {
    // corrupt or unavailable — a default profile is always better than nothing
  }
  return EMPTY_PROFILE;
}

export function saveProfile(p: Profile): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    markDirty();
  } catch {
    // storage full — the library matters more than the profile, so drop it
  }
}

// A film chosen by id, or a sensible fallback: the best-placed film with
// artwork. A profile should look like something on the day it's created.
/**
 * Which picture to draw for someone, in priority order.
 *
 * Three sources, and the order is the whole point:
 *
 *  1. An UPLOAD. The only one the user deliberately chose, so it outranks
 *     everything — including a Google photo that arrived later on a new sign-in.
 *  2. The ACCOUNT photo, which `provisionUser` already stores. Free, and better
 *     than a letter for anyone who has signed in and not thought about it.
 *  3. The INITIAL. Always available, needs no network and no account, and is
 *     what a signed-out user has always had.
 *
 * Returned as a discriminated shape rather than a URL-or-null so the caller
 * cannot forget the letter case and render an empty circle.
 */
export type Avatar = { kind: "image"; url: string } | { kind: "initial"; letter: string };

/**
 * The public half of a person, as this module needs to see it.
 *
 * Structural on purpose. `Me` in lib/account.ts satisfies it, and so does a
 * `user` row read on the server, so one function draws an avatar for your own
 * profile and for a stranger's without this module importing either. That also
 * keeps profile.ts free of anything that fetches, which is what lets it stay
 * testable without a network.
 */
export interface Identity {
  /** The name they CHOSE. This is the identity, and it outranks the rest. */
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/**
 * What to call somebody. There is only one answer, and it is the handle.
 *
 * ── Rankd has no display name, and that is the decision ────────────────────
 *
 * It had one, briefly, and it was a mistake with a very clear symptom: a profile
 * headed JARRAD BISHOP (UNKNOWNENTITY) with "Jarrad Bishop (UnknownEntity)"
 * repeated underneath it. Both lines were `display_name`, which arrives from
 * Google at provision carrying whatever a person happens to have typed into
 * their email account years ago, brackets and all.
 *
 * A second name was never worth its cost. It duplicates the handle when they
 * agree, contradicts it when they don't, doubles the moderation surface, and
 * puts a legal name on a public page nobody asked to publish. The handle is a
 * name somebody chose, for this app, knowing it would be seen.
 *
 * `displayName` remains on the row for accounts that have not been through the
 * gate yet. It is a fallback, never a preference, and nothing offers to edit it.
 */
export function publicName(identity: Identity): string {
  return identity.handle || identity.displayName?.trim() || "You";
}

export function avatarOf(identity: Identity, accountImage?: string | null): Avatar {
  if (identity.avatarUrl) return { kind: "image", url: identity.avatarUrl };
  if (accountImage) return { kind: "image", url: accountImage };
  return { kind: "initial", letter: publicName(identity).charAt(0).toUpperCase() || "?" };
}

// ── The one-way door ───────────────────────────────────────────────────────

/** What an older build of Rankd kept on this device. Any of it may be absent. */
export interface LegacyIdentity {
  name?: string;
  bio?: string;
  avatarUrl?: string;
}

/**
 * Take the identity fields an older build left in localStorage, and remove them.
 *
 * Read RAW rather than through `loadProfile`, because these keys no longer exist
 * on `Profile` and the point is to see what the type has stopped describing.
 *
 * ── Why it strips as it reads ──────────────────────────────────────────────
 *
 * Leaving them behind would be harmless right up until somebody edits their name
 * on the web and then restores a backup taken today, at which point a stale
 * local `name` is sitting next to a server one with no rule about which wins.
 * That is exactly the "can disagree forever" problem this move was made to end,
 * so the local copy goes at the moment it has been handed over.
 *
 * Idempotent. A second call finds nothing and returns an empty object, which is
 * what makes it safe on the path `HandleGate` runs it from.
 */
export function takeLegacyIdentity(): LegacyIdentity {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const taken: LegacyIdentity = {};
    if (typeof stored.name === "string") taken.name = stored.name;
    if (typeof stored.bio === "string") taken.bio = stored.bio;
    if (typeof stored.avatarUrl === "string") taken.avatarUrl = stored.avatarUrl;
    if (Object.keys(taken).length === 0) return {};

    delete stored.name;
    delete stored.bio;
    delete stored.avatarUrl;
    // Written back through the same key rather than through `saveProfile`, so
    // the object keeps any field a NEWER build might have added and this one
    // does not know about. A round trip through `Profile` would drop it.
    localStorage.setItem(KEY, JSON.stringify(stored));
    markDirty();
    return taken;
  } catch {
    // Corrupt or unavailable. Nothing to hand over is a fine answer, and it is
    // the same answer a fresh install gives.
    return {};
  }
}

export interface PersonStat {
  name: string;
  count: number;
  avg: number; // mean star rating across their films in your library
}

// Whose films you rate highest.
//
// Scored on star ratings rather than on placements, deliberately. Requiring a
// confirmed placement would be the purer measure, but with fifteen films settled
// out of eight hundred it would read as empty for months — and a star rating is
// still your own judgement, it just arrived with the import instead of from a
// duel. Two films minimum, so one lucky five-star doesn't crown anybody.
//
// Only films that know their credits can contribute and credits arrive with
// artwork, so this is always a view of part of the library. `coverage` comes
// back alongside so the screen can admit that rather than imply otherwise.
const MIN_FILMS = 2;

export interface TopThings {
  /**
   * Best-rated directors, most first.
   *
   * Three, not one. A single name is a fact rather than a taste — everybody has
   * a top-rated director and at the two-film floor it is often a fluke. Three is
   * enough to see a pattern in, and it fixes a layout problem at the same time:
   * one director beside four actors could never fill a two-up grid, so the top
   * row held a name and a hole for everybody.
   */
  directors: PersonStat[];
  actors: PersonStat[];
  genre?: PersonStat;
  subgenre?: PersonStat;
  coverage: number;
}

const DIRECTOR_SLOTS = 3;
const ACTOR_SLOTS = 4;

export function topPeople(films: Film[], pinned: readonly string[] = []): TopThings {
  const directors = new Map<string, number[]>();
  const actors = new Map<string, number[]>();
  const genres = new Map<string, number[]>();
  const keywords = new Map<string, number[]>();
  let coverage = 0;

  for (const f of films) {
    if (!f.director && !f.cast?.length && !f.genres?.length) continue;
    coverage++;
    const add = (m: Map<string, number[]>, name: string) =>
      m.set(name, [...(m.get(name) ?? []), f.rating]);
    if (f.director) add(directors, f.director);
    for (const c of f.cast ?? []) add(actors, c);
    for (const g of f.genres ?? []) add(genres, g);
    for (const k of f.keywords ?? []) add(keywords, k);
  }

  // Best average first; a longer body of work breaks a tie. `least` guards the
  // subgenre case: keywords include broad tags like "based on a novel" that
  // attach to hundreds of films and say nothing about taste, so a subgenre has
  // to be narrow enough to actually mean something.
  const rank = (m: Map<string, number[]>, least = MIN_FILMS, most = Infinity): PersonStat[] =>
    [...m.entries()]
      .filter(([, rs]) => rs.length >= least && rs.length <= most)
      .map(([name, rs]) => ({ name, count: rs.length, avg: rs.reduce((a, b) => a + b, 0) / rs.length }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);

  // ── Pins beat slots ─────────────────────────────────────────────────────
  //
  // `rank` sorts by average and the slice keeps the top few, so somebody you
  // pinned who sits outside that would simply vanish from a list they are
  // supposed to be at the top of. `withPins` puts them back and floats them,
  // and it lives here rather than in the component because the rule about who
  // APPEARS belongs with the rule about who is computed.
  const withPins = (all: PersonStat[], slots: number, role: "director" | "actor"): PersonStat[] => {
    const isPinned = (p: PersonStat) => pinned.includes(personKey(role, p.name));
    const kept = all.slice(0, slots);
    // Anyone pinned but sliced off comes back. `all` is already filtered by
    // MIN_FILMS, so a pin for somebody whose films have gone finds nothing here
    // and is skipped — which is the self-cleaning half of the contract.
    const rescued = all.filter((p) => isPinned(p) && !kept.includes(p));
    return [...kept, ...rescued].sort((a, b) => Number(isPinned(b)) - Number(isPinned(a)));
  };

  return {
    directors: withPins(rank(directors), DIRECTOR_SLOTS, "director"),
    actors: withPins(rank(actors), ACTOR_SLOTS, "actor"),
    genre: rank(genres)[0],
    // A keyword on more than a fifth of the library is a label, not a taste.
    subgenre: rank(keywords, 3, Math.max(3, Math.round(films.length / 5)))[0],
    coverage,
  };
}

// ── What kind of viewer you are ───────────────────────────────────────────
//
// The list enumerates; this characterises. None of these restate the ranking —
// they describe the person who made it, which is the only thing the profile can
// say that the list can't. Everything is derived, nothing is stored, and every
// one of them has to survive an empty library without producing a NaN.

export interface Fingerprint {
  homeTier?: Rating; // the tier you own most of
  genre?: { name: string; count: number };
  decade?: { label: string; count: number };
  generosity?: { mean: number; label: string };
  duels: number;
}

const LIBRARY_MIDPOINT = 2.75; // halfway up the half-star scale

/**
 * How many films fall in each decade, commonest first.
 *
 * Lifted out of `fingerprint`, which computed exactly this and then threw all
 * but the top row away. The dossier card wants the whole distribution for its
 * decade chart, and a second tally written beside this one would be a second
 * answer to "which decade" that could disagree with the stat printed under it.
 *
 * A film with no year, or a year that will not parse, is simply not counted —
 * the same thing `fingerprint` always did. It is not a decade called "unknown",
 * because a chart segment for "we don't know" tells the reader nothing about
 * their taste.
 */
export function decadesIn(
  films: readonly Pick<Film, "year">[],
): { label: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const f of films) {
    const y = parseInt(f.year ?? "", 10);
    if (Number.isNaN(y)) continue;
    const label = `${Math.floor(y / 10) * 10}s`;
    tally.set(label, (tally.get(label) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([label, count]) => ({ label, count }))
    // Commonest first so a chart can take the top n, then chronological within a
    // tie so two decades of equal size do not swap places between renders.
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// Takes the fields it actually reads rather than a whole `Film`, so a share card
// can characterise a saved ranking's entries without inventing an `id` and a
// `score` for rows that have neither. Every existing caller still passes `Film[]`.
export function fingerprint(
  films: readonly Pick<Film, "rating" | "year" | "genres" | "duels">[],
): Fingerprint {
  const duels = films.reduce((n, f) => n + (f.duels ?? 0), 0);
  if (films.length === 0) return { duels };

  const topOf = <T,>(counts: Map<T, number>) =>
    [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

  const tiers = new Map<Rating, number>();
  const genres = new Map<string, number>();
  let total = 0;

  for (const f of films) {
    tiers.set(f.rating, (tiers.get(f.rating) ?? 0) + 1);
    total += f.rating;
    for (const g of f.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1);
  }

  const mean = total / films.length;
  const g = topOf(genres);
  // `decadesIn` is already sorted commonest-first, so the head is the top row.
  const d = decadesIn(films)[0];

  return {
    homeTier: topOf(tiers)?.[0],
    genre: g && { name: g[0], count: g[1] },
    decade: d,
    generosity: {
      mean,
      label: mean > LIBRARY_MIDPOINT + 0.35 ? "generous" : mean < LIBRARY_MIDPOINT - 0.35 ? "harsh" : "even-handed",
    },
    duels,
  };
}

export interface Superlative {
  label: string;
  value: string;
  note?: string;
}

// Facts, not rankings. Each one is a single film or a single number, so none of
// them can turn into another version of the list.
/**
 * Below this a superlative is arithmetic rather than a fact about you.
 *
 * Every screen in the app has a zero state and, until now, none of these had a
 * THIN one — so a library of four films produced "Oldest", "Longest" and a
 * biggest year with the same confidence as a library of nine hundred. Naming
 * the oldest of four is not a discovery, it is a sort.
 *
 * Ten is where the answer stops being obvious to the person who owns the list.
 * `notes.ts` already gates itself at 8, 10, 20 and 40 depending on the claim;
 * this brings the facts beside it into line rather than inventing a new idea.
 */
const MIN_FOR_FACT = 10;

export function superlatives(films: Film[]): Superlative[] {
  const out: Superlative[] = [];
  if (films.length < MIN_FOR_FACT) return out;
  const withYear = films.filter((f) => /^\d{4}$/.test(f.year ?? ""));

  const oldest = withYear.sort((a, b) => Number(a.year) - Number(b.year))[0];
  if (oldest) out.push({ label: "Oldest", value: oldest.title, note: oldest.year });

  const years = new Map<string, number>();
  for (const f of withYear) years.set(f.year!, (years.get(f.year!) ?? 0) + 1);
  const busiest = [...years.entries()].sort((a, b) => b[1] - a[1])[0];
  // "Biggest year" reads as the year you watched the most films. It is not —
  // Rankd has no viewing dates, only release years, so this is the year the most
  // of your films were MADE. Reported from a phone: "I'm pretty sure my biggest
  // year was much more than 65 films… unless you're saying I've seen 65 films
  // made in that year", which is exactly the ambiguity. "Most from" can only
  // mean the one thing.
  //
  // And a second bar on top of the library one: a "biggest" year that holds two
  // films has not beaten anything, it has tied with half the list and won on
  // sort order. Three is the fewest that can look like a pattern.
  if (busiest && busiest[1] >= 3) {
    out.push({ label: "Most from", value: busiest[0], note: `${busiest[1]} films` });
  }

  const longest = films.filter((f) => f.runtime).sort((a, b) => b.runtime! - a.runtime!)[0];
  if (longest) {
    const h = Math.floor(longest.runtime! / 60);
    out.push({ label: "Longest", value: longest.title, note: `${h}h ${longest.runtime! % 60}m` });
  }

  // Same again: one duel is not an argument, and "most argued over · 1 duel"
  // says the opposite of what it means.
  const mostFought = films.filter((f) => (f.duels ?? 0) >= 3).sort((a, b) => b.duels! - a.duels!)[0];
  if (mostFought) {
    const n = mostFought.duels!;
    out.push({ label: "Most argued over", value: mostFought.title, note: `${n} duel${n === 1 ? "" : "s"}` });
  }

  return out;
}

export interface AutoCollection {
  title: string;
  blurb: string;
  films: Film[];
}

// Collections that fall out of the ranking rather than being curated. They're
// the same shape user-made lists will be, so when those arrive they join this
// row and nothing about the display has to change.
//
// `ranked` must already be sorted best-first — every collection is a filter over
// it, so they inherit the order for free.
const MIN_COLLECTION = 3;

export function autoCollections(ranked: Film[], print: Fingerprint, top: TopThings): AutoCollection[] {
  const out: AutoCollection[] = [];
  const take = (title: string, blurb: string, films: Film[]) => {
    if (films.length >= MIN_COLLECTION) out.push({ title, blurb, films: films.slice(0, 25) });
  };

  if (print.genre) {
    take(
      `Your best ${print.genre.name}`,
      `The ${print.genre.name} films you rate highest.`,
      ranked.filter((f) => f.genres?.includes(print.genre!.name)),
    );
  }
  if (top.subgenre) {
    take(
      top.subgenre.name,
      `Everything you own tagged ${top.subgenre.name}.`,
      ranked.filter((f) => f.keywords?.includes(top.subgenre!.name)),
    );
  }
  const bestDirector = top.directors[0];
  if (bestDirector) {
    take(
      bestDirector.name,
      "Their whole filmography in your library.",
      ranked.filter((f) => f.director === bestDirector.name),
    );
  }
  if (print.decade) {
    const from = parseInt(print.decade.label, 10);
    take(
      `The ${print.decade.label}`,
      `Your best of the decade you own most of.`,
      ranked.filter((f) => {
        const y = parseInt(f.year ?? "", 10);
        return !Number.isNaN(y) && y >= from && y < from + 10;
      }),
    );
  }
  return out;
}
