import type { Film } from "./types";
import type { Rating } from "./tiers";
import { seedScore } from "./tiers";
import { looksLikeZip, readFromZip, wantRatingsCsv } from "./zip";

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

  const parsed = parseLetterboxdCsv(text);
  if (parsed.films.length === 0) return { error: "No rated films in that file." };
  return parsed;
}
