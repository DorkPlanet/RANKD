// Milestones, derived rather than recorded.
//
// Nothing here is stored: an achievement is a question asked of the library, so
// it can never drift out of sync with the truth, and importing a bigger library
// can't leave you holding a badge you didn't earn. The locked ones are shown
// too — a list you can only see once you've finished it is a trophy cabinet, and
// a list you can see before then is a set of goals.

import type { Film } from "./types";
import { ORDERED_TIERS, starsFor } from "./tiers";

export interface Achievement {
  id: string;
  name: string;
  how: string; // what earns it — shown whether locked or not
  got: boolean;
  progress?: string; // how far along, when it's a countable thing
}

export function achievements(films: Film[]): Achievement[] {
  const placed = films.filter((f) => f.confirmed).length;
  const duels = films.reduce((n, f) => n + (f.duels ?? 0), 0);
  const withCredits = films.filter((f) => f.director).length;

  // A tier counts as finished only when every film in it has been confirmed —
  // and an empty tier isn't an achievement, it's an absence.
  const finishedTiers = ORDERED_TIERS.filter((t) => {
    const inTier = films.filter((f) => f.rating === t);
    return inTier.length > 0 && inTier.every((f) => f.confirmed);
  });

  // `need > 0` matters: Completionist's target is "every tier you own films in",
  // which is zero on an empty library — and nobody has completed nothing.
  const count = (id: string, name: string, how: string, have: number, need: number): Achievement => {
    const got = need > 0 && have >= need;
    return { id, name, how, got, progress: got ? undefined : `${Math.min(have, need)} of ${need}` };
  };

  return [
    count("library", "Collector", "Have 100 films in your library", films.length, 100),
    count("big-library", "Archivist", "Have 500 films in your library", films.length, 500),
    count("first", "First blood", "Settle your first film", placed, 1),
    count("ten", "Getting somewhere", "Settle 10 films", placed, 10),
    count("hundred", "Committed", "Settle 100 films", placed, 100),
    count("duel-100", "Hundred rounds", "Fight 100 duels", duels, 100),
    count("duel-1000", "Thousand rounds", "Fight 1,000 duels", duels, 1000),
    {
      id: "tier",
      name: "Clean sweep",
      how: "Settle every film in one tier",
      got: finishedTiers.length > 0,
      progress: finishedTiers.length ? undefined : "none finished",
    },
    count(
      "all-tiers",
      "Completionist",
      "Settle every tier you own films in",
      finishedTiers.length,
      ORDERED_TIERS.filter((t) => films.some((f) => f.rating === t)).length,
    ),
    count("credits", "Well briefed", "Know the credits of 200 films", withCredits, 200),
    count("top-heavy", "Perfectionist", `Own 10 films at ${starsFor(5)}`, films.filter((f) => f.rating === 5).length, 10),
  ];
}
