// Milestones, derived rather than recorded.
//
// Nothing here is stored: an achievement is a question asked of the library, so
// it can never drift out of sync with the truth, and importing a bigger library
// can't leave you holding a badge you didn't earn. The locked ones are shown
// too — a list you can only see once you've finished it is a trophy cabinet, and
// a list you can see before then is a set of goals.
//
// That derived-ness is also why adding to this list is cheap and safe: a new
// badge applies retroactively to everyone, so nobody has to go back and re-earn
// anything, and nothing needs a migration.
//
// ── What counts ────────────────────────────────────────────────────────────
//
// Some of these reward what you DID here (settling, duelling) and some reward
// what your library IS (its size, its shape, its span). Both are honest, but
// they must not be muddled: a badge for owning films is not a badge for ranking
// them, and calling one the other would cheapen the ones you actually worked
// for. Anything about settling counts HARD locks only — the model placing a film
// is not you deciding.

import type { Film } from "./types";
import { isHard } from "./lock";
import { fingerprint, topPeople } from "./profile";
import { ORDERED_TIERS, starsFor } from "./tiers";

export interface Achievement {
  id: string;
  name: string;
  how: string; // what earns it — shown whether locked or not
  got: boolean;
  progress?: string; // how far along, when it's a countable thing
}

export function achievements(films: Film[]): Achievement[] {
  // HARD locks only. These read "Settle 10 films" and one is called Committed —
  // they reward what the user did, so a soft lock the model granted must not
  // quietly unlock them. Running a shuffle session is not settling a film.
  const placed = films.filter(isHard).length;
  const duels = films.reduce((n, f) => n + (f.duels ?? 0), 0);
  const withCredits = films.filter((f) => f.director).length;

  // A tier counts as finished only when the user has settled every film in it —
  // and an empty tier isn't an achievement, it's an absence. Hard locks again:
  // "Clean sweep" should mean you swept it, not that the model filled it in.
  const finishedTiers = ORDERED_TIERS.filter((t) => {
    const inTier = films.filter((f) => f.rating === t);
    return inTier.length > 0 && inTier.every(isHard);
  });

  // Derived once and shared, rather than each badge walking 861 films again.
  const print = fingerprint(films);
  const top = topPeople(films);

  const decades = new Set<string>();
  const genres = new Map<string, number>();
  const directors = new Map<string, number>();
  const actors = new Map<string, number>();
  let minutes = 0;
  let longest = 0;
  let oldest = Infinity;
  for (const f of films) {
    const y = parseInt(f.year ?? "", 10);
    if (!Number.isNaN(y)) {
      decades.add(`${Math.floor(y / 10) * 10}`);
      oldest = Math.min(oldest, y);
    }
    for (const g of f.genres ?? []) genres.set(g, (genres.get(g) ?? 0) + 1);
    if (f.director) directors.set(f.director, (directors.get(f.director) ?? 0) + 1);
    for (const c of f.cast ?? []) actors.set(c, (actors.get(c) ?? 0) + 1);
    if (f.runtime) {
      minutes += f.runtime;
      longest = Math.max(longest, f.runtime);
    }
  }
  const biggestGenre = Math.max(0, ...genres.values());
  const biggestDirector = Math.max(0, ...directors.values());
  const biggestActor = Math.max(0, ...actors.values());
  const atRating = (r: number) => films.filter((f) => f.rating === r).length;
  const ratingsUsed = ORDERED_TIERS.filter((t) => atRating(t) > 0).length;

  // `need > 0` matters: Completionist's target is "every tier you own films in",
  // which is zero on an empty library — and nobody has completed nothing.
  const count = (id: string, name: string, how: string, have: number, need: number): Achievement => {
    const got = need > 0 && have >= need;
    return { id, name, how, got, progress: got ? undefined : `${Math.min(have, need)} of ${need}` };
  };

  // For the ones that are simply true or not, where a running total would be
  // meaningless ("0 of 1" tells nobody anything).
  const flag = (id: string, name: string, how: string, got: boolean, progress?: string): Achievement => ({
    id,
    name,
    how,
    got,
    progress: got ? undefined : progress,
  });

  return [
    // ── The library itself ────────────────────────────────────────────────
    count("library", "Collector", "Have 100 films in your library", films.length, 100),
    count("big-library", "Archivist", "Have 500 films in your library", films.length, 500),
    count("huge-library", "Curator emeritus", "Have 1,000 films in your library", films.length, 1000),

    // ── What you have settled ─────────────────────────────────────────────
    count("first", "First blood", "Settle your first film", placed, 1),
    count("ten", "Getting somewhere", "Settle 10 films", placed, 10),
    count("fifty", "In deep", "Settle 50 films", placed, 50),
    count("hundred", "Committed", "Settle 100 films", placed, 100),
    count("two-fifty", "Unwavering", "Settle 250 films", placed, 250),
    count("five-hundred", "Iron opinion", "Settle 500 films", placed, 500),
    flag(
      "all-settled",
      "Nothing left to argue",
      "Settle every film in your library",
      films.length > 0 && placed === films.length,
      films.length > 0 ? `${placed} of ${films.length}` : undefined,
    ),

    // ── Duels fought ──────────────────────────────────────────────────────
    count("duel-10", "Opening rounds", "Fight 10 duels", duels, 10),
    count("duel-100", "Hundred rounds", "Fight 100 duels", duels, 100),
    count("duel-1000", "Thousand rounds", "Fight 1,000 duels", duels, 1000),
    count("duel-5000", "No notes", "Fight 5,000 duels", duels, 5000),

    // ── Tiers ─────────────────────────────────────────────────────────────
    flag(
      "tier",
      "Clean sweep",
      "Settle every film in one tier",
      finishedTiers.length > 0,
      "none finished",
    ),
    count(
      "all-tiers",
      "Completionist",
      "Settle every tier you own films in",
      finishedTiers.length,
      ORDERED_TIERS.filter((t) => films.some((f) => f.rating === t)).length,
    ),
    count("top-heavy", "Perfectionist", `Own 10 films at ${starsFor(5)}`, atRating(5), 10),
    count("bottom-feeder", "No mercy", `Own 10 films at ${starsFor(0.5)}`, atRating(0.5), 10),
    // The whole scale used at least once — a library that has actually made up
    // its mind about the bad ones as well as the good.
    count("full-scale", "Full spectrum", "Use all ten star ratings", ratingsUsed, ORDERED_TIERS.length),

    // ── The shape of your taste ───────────────────────────────────────────
    count("decades", "Time traveller", "Own films from 5 different decades", decades.size, 5),
    count("decades-8", "Archivist of ages", "Own films from 8 different decades", decades.size, 8),
    flag(
      "pre-1960",
      "Before your time",
      "Own a film made before 1960",
      oldest < 1960,
      oldest === Infinity ? undefined : `oldest is ${oldest}`,
    ),
    count("genres", "Omnivore", "Own films across 12 genres", genres.size, 12),
    count("genre-deep", "House style", "Own 50 films in one genre", biggestGenre, 50),
    count("one-director", "Devotee", "Own 5 films by one director", biggestDirector, 5),
    count("one-director-10", "Completist", "Own 10 films by one director", biggestDirector, 10),
    count("one-actor", "Familiar face", "Own 10 films with the same actor", biggestActor, 10),

    // ── Time served ───────────────────────────────────────────────────────
    flag(
      "long-film",
      "The long haul",
      "Own a film over three hours",
      longest >= 180,
      longest > 0 ? `longest is ${Math.floor(longest / 60)}h ${longest % 60}m` : undefined,
    ),
    count("watch-time", "A month of cinema", "Own 1,000 hours of film", Math.floor(minutes / 60), 1000),

    // ── What the credits know ─────────────────────────────────────────────
    count("credits", "Well briefed", "Know the credits of 200 films", withCredits, 200),
    count("credits-500", "Fully briefed", "Know the credits of 500 films", withCredits, 500),

    // Derived from the same fingerprint the profile uses, so the badge and the
    // profile can never disagree about what kind of viewer you are.
    flag(
      "generous",
      "Soft touch",
      "Rate more generously than the midpoint, across 100+ films",
      films.length >= 100 && print.generosity?.label === "generous",
      films.length < 100 ? `${films.length} of 100` : undefined,
    ),
    flag(
      "harsh",
      "Hard marker",
      "Rate more harshly than the midpoint, across 100+ films",
      films.length >= 100 && print.generosity?.label === "harsh",
      films.length < 100 ? `${films.length} of 100` : undefined,
    ),
    flag(
      "subgenre",
      "Niche interest",
      "Own enough of one narrow subgenre for it to say something",
      top.subgenre !== undefined,
      "nothing narrow enough yet",
    ),
  ];
}
