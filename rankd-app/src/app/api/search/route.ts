import { NextResponse } from "next/server";
import { refuse } from "../guard";

// Server-side TMDb search returning CANDIDATES, not a verdict.
//
// `/api/film` already resolves a title to metadata, but it takes the first hit
// and never says what else it saw. That is the right shape for backfilling 800
// imported films unattended, and the wrong shape twice over: you cannot log a
// film you are choosing by hand, and you cannot correct a match that landed on
// the wrong film — which is the same missing capability wearing two hats.
//
// So this returns the shortlist and lets a person decide. The key stays on the
// server, as it does everywhere else; the browser only ever sees the shape below.

const BASE = "https://api.themoviedb.org/3";
const DAY = 60 * 60 * 24;

/** One thing you might have meant. Enough to tell two films of the same name apart. */
export interface SearchHit {
  tmdbId: number;
  title: string;
  year: string;
  poster?: string;
  /** First line of the synopsis — the tiebreaker when title and year both match. */
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

  const key = process.env.TMDB_API_KEY;
  if (!key) return NextResponse.json({ error: "TMDB_API_KEY is not set" }, { status: 500 });

  const q = new URL(request.url).searchParams.get("q")?.trim();
  // An empty query is a normal state — the field starts empty and every
  // keystroke asks again — so it is an empty list, not an error.
  if (!q) return NextResponse.json({ results: [] });

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
