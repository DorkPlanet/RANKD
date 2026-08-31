// Writing the library back out as a CSV the place it came from will accept.
//
// ── Why this is the inverse of importCsv.ts and nothing more ───────────────
//
// The app has never had a way out. `backup.ts` writes a JSON blob that only
// Rankd can read, and the whole point of ranking a Letterboxd library is to put
// the answer back on Letterboxd. So this is deliberately the narrowest possible
// thing: the columns those two importers actually require, in the format their
// own exports use, and nothing else.
//
// Every decision here is a consequence of something in lib/importCsv.ts, and
// the round-trip test in test/exportCsv.test.ts is what keeps the two honest —
// it parses this file's output with that file's parser and asserts nothing
// changed. A column renamed on either side fails there rather than on somebody's
// re-upload.
//
// ── What is deliberately NOT exported ──────────────────────────────────────
//
// Guests. A guest is borrowed for one session and was never in the library
// (see the note on `Film.guest`), so putting one in an export would add a film
// to somebody's Letterboxd account that they never rated.

import { currentMedium } from "./medium";
import type { Film } from "./types";

/**
 * One CSV field.
 *
 * Quoted only when it has to be, because Letterboxd's and Goodreads' own
 * exports quote only when they have to be and a diff between the two files
 * should show ratings changing and nothing else. The doubling rule matches what
 * `splitRow` parses in lib/importCsv.ts — a literal quote is two quotes.
 *
 * One asymmetry worth knowing: `parseGoodreadsCsv` splits lines with the
 * quote-aware `splitCsvLines`, but `parseLetterboxdCsv` splits on `/\r?\n/`, so
 * a newline INSIDE a Letterboxd field would break that file whatever this does
 * with it. Titles do not contain newlines, and quoting one here is still right —
 * it is the commas and quotes that actually occur, and `splitRow` handles both.
 */
const field = (v: string | number | undefined): string => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const rows = (lines: readonly (readonly (string | number | undefined)[])[]): string =>
  // CRLF, which is what both services emit and what a spreadsheet on Windows
  // expects. `splitCsvLines` consumes either.
  lines.map((cells) => cells.map(field).join(",")).join("\r\n") + "\r\n";

/** Films that belong in an export, in the order the list shows them. */
const exportable = (films: readonly Film[]): Film[] =>
  [...films].filter((f) => !f.guest).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));

/**
 * Letterboxd.
 *
 * `parseLetterboxdCsv` requires `Name` and `Rating` and reads `Year` when it is
 * there; it looks columns up by header name, so the order below is for a human
 * opening the file, not for the parser. Letterboxd's importer keys on name and
 * year, which is also all `slugId` needs to rebuild the same film id — so a
 * three-column file is a complete round trip even though the app stores far
 * more.
 *
 * Half stars pass through untouched: Letterboxd rates on the same scale Rankd
 * does, which is why films get all ten tiers in lib/cuts.ts.
 */
export function toLetterboxdCsv(films: readonly Film[]): string {
  return rows([
    ["Name", "Year", "Rating"],
    ...exportable(films).map((f) => [f.title, f.year ?? "", f.rating]),
  ]);
}

/**
 * Goodreads.
 *
 * Three things this has to get right, all of them from `parseGoodreadsCsv`:
 *
 * · The rating column is `My Rating`, not `Rating`.
 * · Goodreads rates 1–5 in WHOLE stars and refuses everything else, `0`
 *   included. A book cut set only ever produces whole ratings (see BOOK_TIERS),
 *   but a library that has not been cut can still hold halves from a climb, so
 *   they are rounded here rather than silently dropped on re-upload. Rounding up
 *   at the half is Goodreads' own convention.
 * · ISBN13 goes out inside the `="…"` Excel guard. Without it a spreadsheet
 *   reads a 13-digit string as a number and writes back `9.78044E+12`, and
 *   `unarmour` then returns empty for every book in the file.
 *
 * `Author` is `film.director` — the same field the importer writes an author
 * into, since a book and a film share one shape.
 */
export function toGoodreadsCsv(films: readonly Film[]): string {
  return rows([
    ["Title", "Author", "ISBN13", "My Rating"],
    ...exportable(films).map((f) => [
      f.title,
      f.director ?? "",
      f.isbn ? `="${f.isbn}"` : `=""`,
      Math.min(5, Math.max(1, Math.round(f.rating))),
    ]),
  ]);
}

/** Which writer this library wants, and what to call the file. */
export function csvFor(films: readonly Film[]): { text: string; filename: string } {
  const book = currentMedium() === "book";
  const day = new Date().toISOString().slice(0, 10);
  return book
    ? { text: toGoodreadsCsv(films), filename: `rankd-goodreads-${day}.csv` }
    : { text: toLetterboxdCsv(films), filename: `rankd-letterboxd-${day}.csv` };
}

/**
 * Hand the file to the browser.
 *
 * The same shape as `exportBackup` in lib/backup.ts, including the revoke —
 * without it the blob is held for the life of the document, and this one is the
 * whole library as text.
 *
 * `text/csv;charset=utf-8` with a BOM: titles carry accents and non-Latin
 * scripts, and Excel reads a BOM-less UTF-8 CSV as the system codepage, which
 * turns every one of them into mojibake before the user has done anything. A
 * BOM survives the round trip because both parsers lowercase and `trim()` the
 * header cells, and `trim` treats U+FEFF as whitespace.
 */
export function downloadCsv(films: readonly Film[]): void {
  const { text, filename } = csvFor(films);
  const url = URL.createObjectURL(
    new Blob(["﻿", text], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
