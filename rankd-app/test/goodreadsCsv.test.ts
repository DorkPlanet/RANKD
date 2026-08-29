// Goodreads' export, which is the only realistic way a book library gets in.
//
// The header names and the quirks below are from a real export, not invented:
// identifiers arrive Excel-armoured as `="9780441013593"`, ratings are whole
// stars with `0` meaning "not rated", and `My Review` is free text that can and
// does contain newlines.

import { describe, expect, it } from "vitest";
import { parseGoodreadsCsv } from "@/lib/importCsv";

/** The columns a real export writes, in a real export's order. */
const HEADER =
  "Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating," +
  "Average Rating,Publisher,Binding,Number of Pages,Year Published," +
  "Original Publication Year,Date Read,Date Added,Bookshelves," +
  "Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes," +
  "Read Count,Owned Copies";

/** One row, filled in by column name so the tests read as data not positions. */
function row(over: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    "Book Id": "1",
    Title: "Dune",
    Author: "Frank Herbert",
    "Author l-f": "Herbert, Frank",
    "Additional Authors": "",
    ISBN: '=""',
    ISBN13: '="9780441013593"',
    "My Rating": "5",
    "Average Rating": "4.25",
    Publisher: "Ace",
    Binding: "Paperback",
    "Number of Pages": "412",
    "Year Published": "2005",
    "Original Publication Year": "1965",
    "Date Read": "",
    "Date Added": "2020/01/01",
    Bookshelves: "read",
    "Bookshelves with positions": "read (#1)",
    "Exclusive Shelf": "read",
    "My Review": "",
    Spoiler: "",
    "Private Notes": "",
    "Read Count": "1",
    "Owned Copies": "0",
  };
  Object.assign(base, over);
  return HEADER.split(",")
    .map((h) => {
      const v = base[h] ?? "";
      return v.includes(",") || v.includes('"') || v.includes("\n")
        ? `"${v.replace(/"/g, '""')}"`
        : v;
    })
    .join(",");
}

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

describe("parseGoodreadsCsv", () => {
  it("reads a book, its author, its pages and its original year", () => {
    const { films } = parseGoodreadsCsv(csv(row()));
    expect(films).toHaveLength(1);
    expect(films[0]).toMatchObject({
      title: "Dune",
      // ORIGINAL publication year, not the 2005 reprint this edition is. The
      // year is half the id, so two people holding different editions must
      // still hold the same record.
      year: "1965",
      rating: 5,
      director: "Frank Herbert",
      runtime: 412,
      isbn: "9780441013593",
    });
  });

  it("gives every book a head start on a cover, with no metadata request", () => {
    // The reason this parser earns its place on a deployment with no Google
    // Books key: the ISBN *is* the cover URL, so an import has artwork the
    // instant it lands.
    //
    // A head start rather than an answer. It is UNVERIFIED — checking 400 of
    // them from a phone mid-import is not worth the wait — so `default=false`
    // is what makes the guess fail visibly when it is wrong, and the sweep's
    // `coverFor` pass is what replaces it. See `needsMeta` in lib/meta.ts for
    // how an already-imported book gets that pass.
    const { films } = parseGoodreadsCsv(csv(row()));
    expect(films[0].poster).toBe(
      "https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg?default=false",
    );
  });

  it("strips the Excel armour off the ISBN", () => {
    // `="…"` is a formula guard Goodreads adds so a spreadsheet does not render
    // a long digit string as 9.78044E+12. Passed through, every cover URL 404s.
    const { films } = parseGoodreadsCsv(csv(row()));
    expect(films[0].isbn).not.toContain("=");
    expect(films[0].isbn).not.toContain('"');
  });

  it("leaves a book with no ISBN without a cover rather than a broken one", () => {
    const { films } = parseGoodreadsCsv(csv(row({ ISBN13: '=""', Title: "Obscure" })));
    expect(films[0].isbn).toBeUndefined();
    expect(films[0].poster).toBeUndefined();
  });

  it("skips a shelved-but-unrated book instead of rating it nought", () => {
    // `0` means "on a shelf, no opinion". Treated as a rating it would drop an
    // entire to-read shelf into the bottom tier.
    const out = parseGoodreadsCsv(csv(row({ "My Rating": "0", Title: "To Read" })));
    expect(out.films).toHaveLength(0);
    expect(out.skipped).toBe(1);
  });

  it("keeps every whole star from 1 to 5", () => {
    const rows = [1, 2, 3, 4, 5].map((r, i) =>
      row({ "My Rating": String(r), Title: `Book ${i}`, "Book Id": String(i) }),
    );
    const { films } = parseGoodreadsCsv(csv(...rows));
    expect(films.map((f) => f.rating)).toEqual([1, 2, 3, 4, 5]);
  });

  it("survives a review containing newlines", () => {
    // THE reason `splitCsvLines` exists. A naive line split cuts this review
    // into fragments, counts each as a skipped book, and shifts every column
    // after it — an ISBN can land in the year.
    const withReview = row({
      Title: "Piranesi",
      "Book Id": "2",
      "My Rating": "5",
      ISBN13: '="9781526622426"',
      "My Review": "Loved it.\n\nEspecially the middle.\nTwice.",
    });
    const out = parseGoodreadsCsv(csv(row(), withReview));
    expect(out.films).toHaveLength(2);
    expect(out.films[1]).toMatchObject({ title: "Piranesi", isbn: "9781526622426" });
    expect(out.skipped).toBe(0);
  });

  it("survives a review containing escaped quotes", () => {
    const withQuotes = row({
      Title: "Wolf Hall",
      "Book Id": "3",
      ISBN13: '=""',
      "My Review": 'He said "so be it" and meant it.',
    });
    const out = parseGoodreadsCsv(csv(withQuotes));
    expect(out.films).toHaveLength(1);
    expect(out.films[0].title).toBe("Wolf Hall");
  });

  it("handles a title with a comma in it", () => {
    const { films } = parseGoodreadsCsv(
      csv(row({ Title: "Girl, Woman, Other", "Book Id": "4" })),
    );
    expect(films[0].title).toBe("Girl, Woman, Other");
  });

  it("keeps the first of two rows for the same book", () => {
    const out = parseGoodreadsCsv(csv(row(), row({ "Book Id": "9", "My Rating": "2" })));
    expect(out.films).toHaveLength(1);
    expect(out.films[0].rating).toBe(5);
    expect(out.skipped).toBe(1);
  });

  it("reads a file with CRLF endings", () => {
    const out = parseGoodreadsCsv([HEADER, row()].join("\r\n"));
    expect(out.films).toHaveLength(1);
  });

  it("returns nothing for a Letterboxd file rather than half-importing it", () => {
    // Handed the wrong export, this must find no columns and say so — not
    // silently produce rows with no titles.
    const letterboxd = "Date,Name,Year,Letterboxd URI,Rating\n2020-01-01,Dune,2021,x,4";
    const out = parseGoodreadsCsv(letterboxd);
    expect(out.films).toHaveLength(0);
  });

  it("returns nothing for an empty file", () => {
    expect(parseGoodreadsCsv("").films).toHaveLength(0);
    expect(parseGoodreadsCsv(HEADER).films).toHaveLength(0);
  });
});
