import { NextResponse } from "next/server";
import { refuse } from "../guard";

// Frames from a film, for the profile banner.
//
// Kept separate from /api/film rather than bolted on as a mode flag: that route
// answers "what is this film", this one answers "what does it look like", and
// they're fetched at completely different moments — one for every film in the
// library as you browse, this one only when someone is choosing a banner.
//
// Same shape of resolution as the film route, since imported films carry no TMDb
// id: search by title (+ year when known), then ask for that film's images.

const BASE = "https://api.themoviedb.org/3";
const DAY = 60 * 60 * 24;
const MAX = 12;

export interface Stills {
  stills?: string[];
}

interface Backdrop {
  file_path?: string;
  iso_639_1?: string | null;
  vote_average?: number;
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
    if (year) search.searchParams.set("year", year);

    const found = await fetch(search, { next: { revalidate: DAY } });
    if (!found.ok) return NextResponse.json({ error: "TMDb search failed" }, { status: 502 });
    const hit = (await found.json())?.results?.[0];
    if (!hit) return NextResponse.json({ stills: [] }, { status: 200 });

    const images = new URL(`${BASE}/movie/${hit.id}/images`);
    images.searchParams.set("api_key", key);
    // `null` first asks for frames with no text baked into them — otherwise the
    // best-voted backdrops are usually promotional art with the title across
    // them, which is a poster by another name.
    images.searchParams.set("include_image_language", "null,en");

    const res = await fetch(images, { next: { revalidate: DAY } });
    if (!res.ok) return NextResponse.json({ error: "TMDb images failed" }, { status: 502 });
    const backdrops: Backdrop[] = (await res.json())?.backdrops ?? [];

    const stills = backdrops
      // Textless first, then by how well they're rated — so the top of the grid
      // is the cleanest frames rather than whatever TMDb happened to return.
      .sort((a, b) => {
        const clean = Number(!a.iso_639_1) - Number(!b.iso_639_1);
        return clean !== 0 ? -clean : (b.vote_average ?? 0) - (a.vote_average ?? 0);
      })
      .slice(0, MAX)
      .map((b) => `https://image.tmdb.org/t/p/w780${b.file_path}`);

    return NextResponse.json({ stills } satisfies Stills);
  } catch {
    return NextResponse.json({ error: "TMDb request failed" }, { status: 502 });
  }
}
