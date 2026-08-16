import { describe, expect, it } from "vitest";

import { needsCredits, needsMeta, needsPoster, withMeta, type FilmMeta } from "@/lib/meta";
import type { Film } from "@/lib/types";

// The wrong film's artwork, as an import would have guessed it.
const wrong = (): Film => ({
  id: "godzilla-1954",
  title: "Godzilla",
  year: "1954",
  rating: 4,
  score: 7501,
  poster: "https://image.tmdb.org/t/p/w342/WRONG-1998.jpg",
  director: "Roland Emmerich",
  cast: ["Matthew Broderick"],
  genres: ["Action"],
  keywords: ["monster"],
  runtime: 139,
  duels: 12,
  lock: "hard",
});

// What TMDb returns for the film the user actually meant.
const right: FilmMeta = {
  tmdbId: 1678,
  poster: "https://image.tmdb.org/t/p/w342/RIGHT-1954.jpg",
  director: "Ishirō Honda",
  cast: ["Akira Takarada"],
  genres: ["Horror", "Science Fiction"],
  keywords: ["kaiju"],
  runtime: 96,
};

describe("correcting a wrong match", () => {
  it("replaces the other film's details rather than merging them", () => {
    const fixed = withMeta(wrong(), right, true);
    expect(fixed.poster).toBe(right.poster);
    expect(fixed.director).toBe("Ishirō Honda");
    expect(fixed.cast).toEqual(["Akira Takarada"]);
    expect(fixed.genres).toEqual(["Horror", "Science Fiction"]);
    expect(fixed.runtime).toBe(96);
  });

  // The failure that matters most: a card showing the new poster over the old
  // film's director reads as correct and is not.
  it("leaves nothing behind from the film it replaced", () => {
    const fixed = withMeta(wrong(), right, true);
    expect(fixed.director).not.toBe("Roland Emmerich");
    expect(fixed.cast).not.toContain("Matthew Broderick");
    expect(fixed.keywords).not.toContain("monster");
  });

  // A correction says which film the ARTWORK is of. It must not touch which
  // film this is in your library, or what you decided about it.
  it("does not disturb the film's identity or its ranking", () => {
    const before = wrong();
    const fixed = withMeta(before, right, true);
    expect(fixed.id).toBe(before.id);
    expect(fixed.title).toBe(before.title);
    expect(fixed.year).toBe(before.year);
    expect(fixed.rating).toBe(before.rating);
    expect(fixed.score).toBe(before.score);
    expect(fixed.lock).toBe("hard");
    expect(fixed.duels).toBe(12);
  });

  it("records which TMDb film was chosen", () => {
    expect(withMeta(wrong(), right, true).tmdbId).toBe(1678);
  });

  // Without this the credits sweep asks by title on the next pass, lands on the
  // same wrong film, and the user watches their correction evaporate.
  it("is never asked about again", () => {
    const fixed = withMeta(wrong(), right, true);
    expect(needsPoster(fixed)).toBe(false);
    expect(needsMeta(fixed)).toBe(false);
    expect(needsCredits(fixed)).toBe(false);
  });

  it("stays out of the queue even when the chosen film has gaps", () => {
    const sparse = withMeta(wrong(), { tmdbId: 9, poster: "p.jpg" }, true);
    expect(sparse.director).toBeUndefined();
    expect(needsMeta(sparse)).toBe(false);
    expect(needsCredits(sparse)).toBe(false);
  });

  // A film TMDb could not find by title has just been found by hand.
  it("clears noMatch, so nothing still treats it as unmatched", () => {
    const unmatched = { ...wrong(), noMatch: true, poster: undefined };
    expect(withMeta(unmatched, right, true).noMatch).toBe(false);
  });
});

describe("an ordinary backfill, which must not change", () => {
  it("fills gaps without overwriting what is already known", () => {
    const partial: Film = { id: "a", title: "A", rating: 4, score: 7501, director: "Known" };
    const filled = withMeta(partial, { poster: "p.jpg", cast: [], genres: [] });
    expect(filled.poster).toBe("p.jpg");
    expect(filled.director).toBe("Known");
    expect(filled.pinnedMeta).toBeUndefined();
  });

  it("still marks an empty response as no match", () => {
    const film: Film = { id: "a", title: "A", rating: 4, score: 7501 };
    expect(withMeta(film, {}).noMatch).toBe(true);
  });

  it("leaves a pinned film alone in every queue", () => {
    const pinned: Film = { id: "a", title: "A", rating: 4, score: 7501, pinnedMeta: true };
    expect(needsPoster(pinned)).toBe(false);
    expect(needsMeta(pinned)).toBe(false);
    expect(needsCredits(pinned)).toBe(false);
  });
});
