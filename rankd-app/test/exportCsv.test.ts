// Writing the library out as a CSV the service it came from will take back.
//
// The round-trip tests are the only ones that actually prove "re-uploadable":
// they parse this module's output with the very parser that reads a real
// Letterboxd or Goodreads export, and assert nothing changed. A column renamed
// on either side fails here rather than on somebody's re-upload, which is the
// only place it would otherwise show up.

import { describe, expect, it } from "vitest";
import { toGoodreadsCsv, toLetterboxdCsv } from "@/lib/exportCsv";
import { parseGoodreadsCsv, parseLetterboxdCsv, slugId } from "@/lib/importCsv";
import { ORDERED_TIERS, seedScore, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

const film = (id: string, over: Partial<Film> = {}): Film => ({
  id,
  title: id,
  year: "2001",
  rating: 4 as Rating,
  score: seedScore(4),
  ...over,
});

/** A film whose id matches what an import would rebuild from title + year. */
const real = (title: string, year: string, rating: Rating, over: Partial<Film> = {}): Film => ({
  id: slugId(title, year),
  title,
  year,
  rating,
  score: seedScore(rating),
  ...over,
});

describe("toLetterboxdCsv", () => {
  it("writes the columns the importer requires", () => {
    const [header] = toLetterboxdCsv([film("a")]).split("\r\n");
    expect(header).toBe("Name,Year,Rating");
  });

  it("round-trips every film and rating through the real parser", () => {
    const films = ORDERED_TIERS.map((r, i) => real(`Film ${i}`, `19${70 + i}`, r));
    const { films: back, skipped } = parseLetterboxdCsv(toLetterboxdCsv(films));
    expect(skipped).toBe(0);
    expect(back).toHaveLength(films.length);
    const ratings = new Map(back.map((f) => [f.id, f.rating]));
    for (const f of films) expect(ratings.get(f.id)).toBe(f.rating);
  });

  it("survives a title with a comma", () => {
    const f = real("Good Night, and Good Luck.", "2005", 4);
    const { films: back, skipped } = parseLetterboxdCsv(toLetterboxdCsv([f]));
    expect(skipped).toBe(0);
    expect(back[0].title).toBe("Good Night, and Good Luck.");
    expect(back[0].id).toBe(f.id);
  });

  it("survives a title with a quote", () => {
    const f = real(`The "Human" Factor`, "1979", 3.5);
    const { films: back, skipped } = parseLetterboxdCsv(toLetterboxdCsv([f]));
    expect(skipped).toBe(0);
    expect(back[0].title).toBe(`The "Human" Factor`);
    expect(back[0].rating).toBe(3.5);
  });

  it("writes the library in list order, best first", () => {
    const films = [film("worst", { score: 100 }), film("best", { score: 9999 })];
    const lines = toLetterboxdCsv(films).trim().split("\r\n");
    expect(lines[1].startsWith("best")).toBe(true);
  });

  it("leaves guests out — they were never in the library", () => {
    const films = [real("Mine", "2000", 4), real("Borrowed", "2000", 5, { guest: true })];
    const { films: back } = parseLetterboxdCsv(toLetterboxdCsv(films));
    expect(back.map((f) => f.title)).toEqual(["Mine"]);
  });

  it("writes an empty year rather than the word undefined", () => {
    const text = toLetterboxdCsv([film("a", { year: undefined })]);
    expect(text).not.toMatch(/undefined/);
  });
});

describe("toGoodreadsCsv", () => {
  const book = (title: string, rating: Rating, over: Partial<Film> = {}): Film => ({
    id: slugId(title, ""),
    title,
    rating,
    score: seedScore(rating),
    ...over,
  });

  it("writes the columns the importer requires", () => {
    const [header] = toGoodreadsCsv([book("a", 4)]).split("\r\n");
    expect(header).toBe("Title,Author,ISBN13,My Rating");
  });

  it("round-trips whole ratings through the real parser", () => {
    const books = [book("One", 5), book("Two", 4), book("Three", 3), book("Four", 2), book("Five", 1)];
    const { films: back, skipped } = parseGoodreadsCsv(toGoodreadsCsv(books));
    expect(skipped).toBe(0);
    const ratings = new Map(back.map((f) => [f.title, f.rating]));
    for (const b of books) expect(ratings.get(b.title)).toBe(b.rating);
  });

  it("rounds a half star rather than letting Goodreads drop the row", () => {
    // Goodreads refuses anything but a whole 1-5, so an un-cut library's halves
    // would vanish silently on re-upload.
    const { films: back, skipped } = parseGoodreadsCsv(toGoodreadsCsv([book("Half", 3.5)]));
    expect(skipped).toBe(0);
    expect(back[0].rating).toBe(4);
  });

  it("clamps a half-star bottom rating into the scale Goodreads accepts", () => {
    const { films: back, skipped } = parseGoodreadsCsv(toGoodreadsCsv([book("Low", 0.5)]));
    expect(skipped).toBe(0);
    expect(back[0].rating).toBe(1);
  });

  it("keeps an ISBN13 intact through the Excel guard", () => {
    const { films: back } = parseGoodreadsCsv(
      toGoodreadsCsv([book("Dune", 5, { isbn: "9780441013593" })]),
    );
    expect(back[0].isbn).toBe("9780441013593");
  });

  it("writes an empty guard for a book with no ISBN, as Goodreads does", () => {
    const text = toGoodreadsCsv([book("None", 4)]);
    expect(text).toContain('=""');
    const { films: back } = parseGoodreadsCsv(text);
    expect(back[0].isbn).toBeFalsy();
  });

  it("carries the author across", () => {
    const { films: back } = parseGoodreadsCsv(
      toGoodreadsCsv([book("Dune", 5, { director: "Frank Herbert" })]),
    );
    expect(back[0].director).toBe("Frank Herbert");
  });

  it("leaves guests out", () => {
    const text = toGoodreadsCsv([book("Mine", 4), book("Borrowed", 5, { guest: true })]);
    const { films: back } = parseGoodreadsCsv(text);
    expect(back.map((f) => f.title)).toEqual(["Mine"]);
  });
});
