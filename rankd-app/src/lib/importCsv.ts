import type { Film } from "./types";
import type { Rating } from "./tiers";
import { seedScore } from "./tiers";
import { looksLikeZip, readFromZip, wantRatingsCsv } from "./zip";
import { lex } from "./lexicon";

// Letterboxd's ratings.csv: Date,Name,Year,Letterboxd URI,Rating
// Only rated films appear in it, and ratings come in half stars — which is
// exactly the tier scale, so they map straight across with no rounding.

const RATINGS: Rating[] = [5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5];

// Split one CSV line, honouring quoted fields — film titles contain commas
// ("Lock, Stock and Two Smoking Barrels") and escaped quotes.
function splitRow(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"'; // "" is a literal quote
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(field);
      field = "";
    } else field += c;
  }
  out.push(field);
  return out;
}

/**
 * Split a CSV into ROWS, honouring newlines inside quoted fields.
 *
 * ── Why `text.split(/\r?\n/)` is not enough here ─────────────────────────
 *
 * It is enough for Letterboxd, whose ratings.csv is five columns of dates,
 * titles, years and numbers with no free text in it. Goodreads exports
 * `My Review` and `Private Notes`, which are whatever the reader typed —
 * paragraphs included.
 *
 * A naive split cuts one of those reviews into pieces and hands each piece to
 * `splitRow` as though it were a book. The fragments have no rating, so they are
 * counted as skipped, and the reader is told their import skipped 340 rows with
 * no hint why. Worse, the quote state never recovers within a fragment, so
 * columns after the review shift and an ISBN can land in the year.
 *
 * So quotes are tracked across the whole file and a newline only ends a row when
 * it is not inside one. Left as a separate function rather than folded into the
 * existing parser: the film path works and does not need this, and rewriting a
 * parser that 861 films depend on to serve a second format is a change with
 * nothing to gain.
 */
function splitCsvLines(text: string): string[] {
  const rows: string[] = [];
  let row = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      // A doubled quote is a literal, and must NOT flip the state — otherwise a
      // review containing "" ends the row in the middle of itself.
      if (quoted && text[i + 1] === '"') {
        row += '""';
        i++;
        continue;
      }
      quoted = !quoted;
      row += c;
    } else if (!quoted && (c === "\n" || c === "\r")) {
      // CRLF is two characters and one line ending. Consuming the \n here stops
      // it being read as a second, empty row.
      if (c === "\r" && text[i + 1] === "\n") i++;
      if (row.trim()) rows.push(row);
      row = "";
    } else {
      row += c;
    }
  }
  if (row.trim()) rows.push(row);
  return rows;
}

export const slugId = (title: string, year: string): string =>
  `${title}-${year}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export interface ImportResult {
  films: Film[];
  skipped: number;
}

// Parses by header name rather than column position, so a Letterboxd export
// that gains or reorders columns still imports.
export function parseLetterboxdCsv(text: string): ImportResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { films: [], skipped: 0 };

  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iName = col("name");
  const iYear = col("year");
  const iRating = col("rating");
  if (iName < 0 || iRating < 0) return { films: [], skipped: lines.length - 1 };

  const films: Film[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = splitRow(lines[i]);
    const title = (row[iName] ?? "").trim();
    const year = (row[iYear] ?? "").trim();
    const raw = parseFloat((row[iRating] ?? "").trim());
    const rating = RATINGS.find((r) => r === raw);

    // No title, or a rating that isn't on the half-star scale (including blanks
    // from a watched-but-unrated entry) — nothing to place, so leave it out.
    if (!title || !rating) {
      skipped++;
      continue;
    }
    const id = slugId(title, year);
    if (seen.has(id)) {
      skipped++;
      continue;
    }
    seen.add(id);
    films.push({ id, title, year: year || undefined, rating, score: seedScore(rating) });
  }
  return { films, skipped };
}

/**
 * Goodreads' export, which is the book library's only realistic front door.
 *
 * ── Why this could not just be the Letterboxd parser ──────────────────────
 *
 * It is header-driven, so it looked like it might already work. It does not,
 * and it fails SILENTLY: Goodreads writes `Title`, `My Rating` and
 * `Year Published` where Letterboxd writes `Name`, `Rating` and `Year`, so
 * every column lookup misses and the import reports every row skipped. A file
 * picker that accepts your library and returns nothing is worse than one that
 * refuses it.
 *
 * ── Three things Goodreads gives that Letterboxd does not ─────────────────
 *
 *  · **ISBN13.** This is the important one, and it is not a nice-to-have: it IS
 *    the Open Library cover URL. So a Goodreads import can dress itself with no
 *    Google Books request at all — which matters enormously, because
 *    unauthenticated Google Books answers 429 (see lib/books.ts). An import is
 *    the one path that works with no key.
 *  · **Author.** Stored on `director`, and it is the signal `bestBook` needs to
 *    keep a novel from resolving to its study guide. Without it the sweep's
 *    first question about every book is title-only, the weakest search this app
 *    makes.
 *  · **Number of Pages**, which lands in `runtime`'s slot.
 *
 * ── The rating scale is WHOLE stars ───────────────────────────────────────
 *
 * Letterboxd rates in half stars and Rankd's tiers are the same scale, so those
 * map across untouched. Goodreads rates 1–5 in whole stars only, and `0` means
 * "shelved but not rated" rather than "nought stars". Whole numbers 1 to 5 are
 * all valid tiers, so they still map straight across — but `0` has to be
 * skipped, or an entire to-read shelf arrives rated bottom.
 */
export function parseGoodreadsCsv(text: string): ImportResult {
  const lines = splitCsvLines(text);
  if (lines.length < 2) return { films: [], skipped: 0 };

  const header = splitRow(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iTitle = col("title");
  const iRating = col("my rating");
  const iAuthor = col("author");
  const iIsbn = col("isbn13");
  const iYear = col("original publication year");
  const iYearPub = col("year published");
  const iPages = col("number of pages");
  if (iTitle < 0 || iRating < 0) return { films: [], skipped: lines.length - 1 };

  const films: Film[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = splitRow(lines[i]);
    const title = (row[iTitle] ?? "").trim();
    // ORIGINAL publication year first, falling back to this edition's.
    //
    // The edition year is what a reprint carries, so a 1965 novel in a 2005
    // paperback would be filed under 2005 — and the year is half of the id, so
    // two people importing different editions of the same book would hold two
    // different records of it. The original is the stable answer, and Goodreads
    // supplies it.
    const year = (row[iYear] ?? "").trim() || (row[iYearPub] ?? "").trim();
    const raw = parseFloat((row[iRating] ?? "").trim());
    // `0` is "not rated" and must not become a tier. `RATINGS` has no 0 in it,
    // so this is refused by the same lookup that refuses a blank — stated here
    // only because the reason differs and is easy to "fix" wrongly later.
    const rating = RATINGS.find((r) => r === raw);

    if (!title || !rating) {
      skipped++;
      continue;
    }
    const id = slugId(title, year);
    if (seen.has(id)) {
      skipped++;
      continue;
    }
    seen.add(id);

    const isbn = unarmour(row[iIsbn] ?? "");
    const pages = parseInt((row[iPages] ?? "").trim(), 10);

    films.push({
      id,
      title,
      year: year || undefined,
      rating,
      score: seedScore(rating),
      // The author goes in `director`'s slot, which is where every reader in
      // the app looks for "who made this". See `asFilmMeta` in the film route.
      ...(row[iAuthor]?.trim() ? { director: row[iAuthor].trim() } : {}),
      // ── A cover with no metadata request at all ───────────────────────────
      //
      // `covers.openlibrary.org/b/isbn/{isbn}-L.jpg` needs no lookup and no key:
      // the ISBN is the URL. So an imported library has artwork the moment it
      // lands, before the sweep has asked anything — and it still has artwork on
      // a deployment with no Google Books key, where the sweep can ask nothing.
      // `default=false` so a cover Open Library does not have comes back as a
      // 404 rather than as a 200 with a blank 1x1 GIF. The blank is worse than
      // nothing: it renders as an empty frame that no check in the app can tell
      // apart from real artwork.
      //
      // This is still the UNVERIFIED guess — checking 400 of them from a phone
      // during an import is not worth the wait — so it is a head start rather
      // than an answer. The credits sweep runs `coverFor` over every book
      // afterwards and replaces the ones that turned out to be missing.
      ...(isbn
        ? { isbn, poster: `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` }
        : {}),
      ...(Number.isFinite(pages) && pages > 0 ? { runtime: pages } : {}),
    });
  }
  return { films, skipped };
}

/**
 * Goodreads writes its identifiers as `="9780441013593"`.
 *
 * The `="…"` wrapper is an Excel formula guard — without it a spreadsheet reads
 * a long digit string as a number and renders it as `9.78044E+12`. It is not
 * part of the value, and passing it through would produce a cover URL that 404s
 * for every single book. An empty guard (`=""`) is how Goodreads writes "no
 * ISBN", so that has to come back empty rather than as a stray quote.
 */
function unarmour(v: string): string {
  const m = /^="?([0-9Xx]*)"?$/.exec(v.trim());
  const digits = (m ? m[1] : v.trim()).replace(/[^0-9Xx]/g, "");
  return digits.length >= 10 ? digits : "";
}

// Merge keeps what you've already placed: an existing film holds its score and
// confirmed flag, so importing again doesn't undo a session's work. Only its
// rating is refreshed, since that's what you'd have changed on Letterboxd.
export function mergeFilms(existing: Film[], incoming: Film[]): Film[] {
  const byId = new Map(existing.map((f) => [f.id, f]));
  for (const f of incoming) {
    const prev = byId.get(f.id);
    byId.set(f.id, prev ? { ...prev, rating: f.rating } : f);
  }
  return [...byId.values()];
}

/**
 * A picked file, whatever shape it arrived in, as films.
 *
 * Shared because there are two import controls now — Settings and the empty
 * screen a new user actually lands on — and they must behave identically. The
 * zip handling in particular is the difference between an import that works on
 * a phone and one people abandon; having it on only one of the two buttons
 * would be worse than not having it.
 *
 * Returns a message rather than throwing: both callers show it in place, and
 * neither has anywhere useful to put an exception.
 */
export async function filmsFromFile(
  file: File,
): Promise<{ films: Film[]; skipped: number } | { error: string }> {
  const buffer = await file.arrayBuffer();
  let text: string;

  // Sniffed by CONTENT, not extension: a phone's file picker reports all sorts
  // of types for the same file, and the first four bytes never lie.
  if (looksLikeZip(new Uint8Array(buffer))) {
    const found = await readFromZip(buffer, wantRatingsCsv);
    if (found === null) {
      return { error: "That zip has no ratings.csv in it. Open it and pick that file instead." };
    }
    text = found;
  } else {
    text = new TextDecoder().decode(buffer);
  }

  // ── Which parser, and why the MEDIUM decides rather than the file ────────
  //
  // Sniffing the header would have been cleverer and is the wrong trade. The
  // two exports have no overlapping required columns, so a mis-sniff imports
  // nothing and says nothing — and the reader has already told the app which
  // library they are in by being in it. Handing a Goodreads file to the film
  // library should fail loudly, which is exactly what this does.
  const L = lex();
  const parsed =
    L.medium === "book" ? parseGoodreadsCsv(text) : parseLetterboxdCsv(text);

  if (parsed.films.length === 0) {
    // Names the export it wanted. "No rated books in that file" on a file full
    // of books sends somebody looking for a problem with their ratings, when
    // the problem is that they exported from the wrong place.
    return {
      error: `No rated ${L.many} in that file. It should be a ${L.importFrom} export.`,
    };
  }
  return parsed;
}
