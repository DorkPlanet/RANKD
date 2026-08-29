import { NextResponse } from "next/server";
import { refuse } from "../guard";
import { searchBooks, yearOf, authorLine, metaOf } from "@/lib/books";

// Server-side search returning CANDIDATES, not a verdict.
//
// `/api/film` already resolves a title to metadata, but it takes the best hit
// and never says what else it saw. That is the right shape for backfilling 800
// imported titles unattended, and the wrong shape twice over: you cannot log
// something you are choosing by hand, and you cannot correct a match that landed
// on the wrong record — which is the same missing capability wearing two hats.
//
// So this returns the shortlist and lets a person decide. The keys stay on the
// server, as they do everywhere else; the browser only ever sees the shape below.

const BASE = "https://api.themoviedb.org/3";
const DAY = 60 * 60 * 24;

/**
 * One thing you might have meant. Enough to tell two records of the same name
 * apart.
 *
 * ── Why there is an `id` AND a `tmdbId` ────────────────────────────────────
 *
 * `id` is the medium-neutral one and it is what every caller should use: a
 * string, because Google Books volume ids are opaque strings and TMDb ids are
 * integers, and the only type both fit in is the wider one.
 *
 * `tmdbId` stays because `Film.tmdbId` is a number that is persisted, synced and
 * present in every backup ever written. Widening the stored field would mean
 * migrating live data to tidy up a type. It is absent on a book hit, which is
 * the honest answer — a book has no TMDb id.
 */
export interface SearchHit {
  /** Medium-neutral identity. Pass this back to `/api/film?id=`. */
  id: string;
  /** Present only for films, where the stored id is a number. */
  tmdbId?: number;
  title: string;
  year: string;
  poster?: string;
  /**
   * The line under the title that separates two hits sharing one.
   *
   * For a film that is the first sentence of the synopsis. For a book it is the
   * AUTHOR, which is a far better discriminator — two editions of the same novel
   * have identical blurbs and the same author, where a novel and its study guide
   * do not.
   */
  blurb?: string;
}

interface TmdbResult {
  id: number;
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  overview?: string;
  popularity?: number;
}

export async function GET(request: Request) {
  const no = refuse(request);
  if (no) return no;

  const params = new URL(request.url).searchParams;
  const medium = params.get("medium") === "book" ? "book" : "film";
  const q = params.get("q")?.trim();
  // An empty query is a normal state — the field starts empty and every
  // keystroke asks again — so it is an empty list, not an error.
  if (!q) return NextResponse.json({ results: [] });

  if (medium === "book") {
    try {
      // Optional key. See the header of `lib/books.ts`.
      const volumes = await searchBooks(q, process.env.GOOGLE_BOOKS_API_KEY);
      // A failed request is not an empty shelf. The picker shows "couldn't
      // reach Google Books" for one and "nothing found" for the other, and
      // those send the reader to two different places.
      if (volumes === null) {
        return NextResponse.json({ error: "Google Books request failed" }, { status: 502 });
      }

      const results: SearchHit[] = volumes
        .slice(0, 12)
        .map((v) => {
          const info = v.volumeInfo ?? {};
          return {
            id: v.id,
            title: info.title ?? "Untitled",
            year: yearOf(info.publishedDate),
            // Through `metaOf` rather than reading `imageLinks` directly, so a
            // hit in this list wears the SAME artwork it will wear once chosen.
            // Reading the raw thumbnail here would show a 128px image in the
            // picker and a 500px Open Library cover afterwards, and the reader
            // would reasonably think they had picked a different edition.
            poster: metaOf(v).poster,
            blurb: authorLine(info.authors),
          };
        })
        // A book with no title cannot be chosen between. The year is NOT
        // required here, unlike the film path: plenty of legitimate volumes
        // carry no publication date at all, and the author on `blurb` already
        // tells two hits apart — which is the job the film path needs a year for.
        .filter((h) => h.title && h.title !== "Untitled");

      return NextResponse.json({ results });
    } catch {
      return NextResponse.json({ error: "Google Books request failed" }, { status: 502 });
    }
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) return NextResponse.json({ error: "TMDB_API_KEY is not set" }, { status: 500 });

  try {
    const search = new URL(`${BASE}/search/movie`);
    search.searchParams.set("api_key", key);
    search.searchParams.set("query", q);
    search.searchParams.set("include_adult", "false");

    const res = await fetch(search, { next: { revalidate: DAY } });
    if (!res.ok) return NextResponse.json({ error: "TMDb search failed" }, { status: 502 });

    const results: SearchHit[] = ((await res.json())?.results ?? [])
      .slice(0, 12)
      .map((r: TmdbResult) => ({
        id: String(r.id),
        tmdbId: r.id,
        title: r.title ?? "Untitled",
        // TMDb dates are ISO or absent; the app stores a bare year everywhere else.
        year: (r.release_date ?? "").slice(0, 4),
        poster: r.poster_path ? `https://image.tmdb.org/t/p/w185${r.poster_path}` : undefined,
        blurb: r.overview ? r.overview.split(". ")[0] : undefined,
      }))
      // A film with no year cannot be told apart from a remake, and TMDb's tail
      // is full of unreleased and untitled entries. Better a short honest list.
      .filter((h: SearchHit) => h.title && h.year);

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ error: "TMDb request failed" }, { status: 502 });
  }
}
