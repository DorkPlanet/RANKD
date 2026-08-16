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
  /** Which TMDb film this actually is. Kept so a correction can be pinned. */
  tmdbId?: number;
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

/**
 * Everything worth keeping about one TMDb film, by its id.
 *
 * Split out because there are now two ways to arrive at an id — guessed from a
 * title, or chosen by a person correcting a bad guess — and both want exactly
 * the same response. Duplicating the field mapping would have meant a corrected
 * film quietly carrying a different set of fields from a matched one.
 */
async function detailOf(id: number, key: string): Promise<FilmMeta | null> {
  const detail = new URL(`${BASE}/movie/${id}`);
  detail.searchParams.set("api_key", key);
  // Keywords are the closest thing TMDb has to subgenres — slasher, giallo,
  // found footage — since its genre list is 19 flat labels with no children.
  detail.searchParams.set("append_to_response", "credits,keywords");

  const res = await fetch(detail, { next: { revalidate: DAY } });
  if (!res.ok) return null;
  const d = await res.json();

  const crew: CrewMember[] = d.credits?.crew ?? [];
  const byJob = (...jobs: string[]) => crew.find((c) => jobs.includes(c.job ?? ""))?.name;

  return {
    tmdbId: d.id,
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
  // ── Correcting a match ────────────────────────────────────────────────────
  //
  // `id` skips the search entirely. Everything below exists to GUESS which film
  // was meant, and when a person has picked one out of `/api/search` there is
  // nothing left to guess — searching again could only find its way back to the
  // wrong film, which is the thing being corrected.
  const id = params.get("id");
  if (!id && !title) {
    return NextResponse.json({ error: "title or id is required" }, { status: 400 });
  }

  try {
    if (id) {
      if (!/^\d+$/.test(id)) return NextResponse.json({ error: "bad id" }, { status: 400 });
      const meta = await detailOf(Number(id), key);
      return meta
        ? NextResponse.json(meta)
        : NextResponse.json({ error: "TMDb detail failed" }, { status: 502 });
    }

    // Narrowed for the compiler's benefit: the guard above accepts an id OR a
    // title, so neither is provably present on its own — but the id branch has
    // already returned, which leaves only the title.
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

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

    const meta = await detailOf(hit.id, key);
    return meta
      ? NextResponse.json(meta)
      : NextResponse.json({ error: "TMDb detail failed" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "TMDb request failed" }, { status: 502 });
  }
}
