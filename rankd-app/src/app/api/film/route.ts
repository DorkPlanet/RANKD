import { NextResponse } from "next/server";
import { refuse } from "../guard";
import { bestMatch } from "@/lib/tmdbMatch";

// Server-side TMDb proxy. The key is read from the environment here and never
// reaches the browser — the client only ever sees the normalised shape below.
//
// Seed films carry no TMDb id, and user-added films won't either, so this
// resolves by title (+ year when known) and then pulls details and credits in a
// single follow-up call.

const BASE = "https://api.themoviedb.org/3";
const DAY = 60 * 60 * 24;

export interface FilmMeta {
  poster?: string;
  synopsis?: string;
  runtime?: number;
  genres?: string[];
  director?: string;
  writer?: string;
  cinematographer?: string;
  composer?: string;
  cast?: string[];
  keywords?: string[];
}

interface CrewMember {
  job?: string;
  name?: string;
}

export async function GET(request: Request) {
  const no = refuse(request);
  if (no) return no;

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "TMDB_API_KEY is not set" }, { status: 500 });
  }

  const params = new URL(request.url).searchParams;
  const title = params.get("title");
  const year = params.get("year");
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    const search = new URL(`${BASE}/search/movie`);
    search.searchParams.set("api_key", key);
    search.searchParams.set("query", title);
    search.searchParams.set("include_adult", "false");
    // The year is NOT sent to TMDb any more, and that is deliberate. As a query
    // parameter it is a hard filter, so a film whose TMDb release year is one
    // off the one we hold — a festival run, a different territory — came back
    // empty and then got matched against the whole catalogue on a retry. It is
    // far more useful as a tie-breaker, which is where `bestMatch` uses it.

    const found = await fetch(search, { next: { revalidate: DAY } });
    if (!found.ok) return NextResponse.json({ error: "TMDb search failed" }, { status: 502 });
    const hit = bestMatch((await found.json())?.results ?? [], title, year);
    if (!hit) return NextResponse.json({}, { status: 200 }); // no match — card just shows less

    const detail = new URL(`${BASE}/movie/${hit.id}`);
    detail.searchParams.set("api_key", key);
    // Keywords are the closest thing TMDb has to subgenres — slasher, giallo,
    // found footage — since its genre list is 19 flat labels with no children.
    detail.searchParams.set("append_to_response", "credits,keywords");

    const res = await fetch(detail, { next: { revalidate: DAY } });
    if (!res.ok) return NextResponse.json({ error: "TMDb detail failed" }, { status: 502 });
    const d = await res.json();

    const crew: CrewMember[] = d.credits?.crew ?? [];
    const byJob = (...jobs: string[]) => crew.find((c) => jobs.includes(c.job ?? ""))?.name;

    const meta: FilmMeta = {
      // Imported films arrive with no artwork, so the poster comes back too.
      poster: d.poster_path ? `https://image.tmdb.org/t/p/w342${d.poster_path}` : undefined,
      synopsis: d.overview || undefined,
      runtime: d.runtime || undefined,
      genres: (d.genres ?? []).map((g: { name: string }) => g.name),
      director: byJob("Director"),
      writer: byJob("Screenplay", "Writer", "Story"),
      cinematographer: byJob("Director of Photography"),
      composer: byJob("Original Music Composer", "Music"),
      cast: (d.credits?.cast ?? []).slice(0, 10).map((c: { name: string }) => c.name),
      keywords: (d.keywords?.keywords ?? []).slice(0, 10).map((k: { name: string }) => k.name),
    };
    return NextResponse.json(meta);
  } catch {
    return NextResponse.json({ error: "TMDb request failed" }, { status: 502 });
  }
}
