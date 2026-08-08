import { NextResponse } from "next/server";
import { refuse } from "../guard";

// A person's filmography, so the app can show what you HAVEN'T logged.
//
// The library already knows who directed and who starred in every film it holds,
// which is enough to list a person's work as you recorded it. It is not enough to
// answer the more interesting question — which of their films you have missed —
// because a library can only ever describe itself. That gap is the whole reason
// to open a person's page, so it needs a source outside the library.
//
// Resolves a name to a TMDb person and returns their credits in the requested
// role. Names, not ids, because names are what the library stores; see the note
// in lib/people.ts about what that costs.

const BASE = "https://api.themoviedb.org/3";
const WEEK = 60 * 60 * 24 * 7;

export interface Credit {
  title: string;
  year: string;
  poster?: string;
}

export interface PersonResponse {
  credits: Credit[];
  /** Their photo, when TMDb has one. Used on the share cards. */
  profile?: string;
}

interface TmdbCredit {
  title?: string;
  release_date?: string;
  poster_path?: string | null;
  job?: string;
  popularity?: number;
}

export async function GET(request: Request) {
  const no = refuse(request);
  if (no) return no;

  const key = process.env.TMDB_API_KEY;
  if (!key) return NextResponse.json({ error: "TMDB_API_KEY is not set" }, { status: 500 });

  const params = new URL(request.url).searchParams;
  const name = params.get("name")?.trim();
  const role = params.get("role") === "actor" ? "actor" : "director";
  // Just the face, for the share card and the sheet's header. Resolving a person
  // is one request; their filmography is a second and much larger one, and the
  // note above is explicit that the filmography must not be the price of opening
  // a page. So a portrait can be asked for on its own.
  const portraitOnly = params.get("portrait") === "1";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  try {
    const find = new URL(`${BASE}/search/person`);
    find.searchParams.set("api_key", key);
    find.searchParams.set("query", name);
    find.searchParams.set("include_adult", "false");

    const found = await fetch(find, { next: { revalidate: WEEK } });
    if (!found.ok) return NextResponse.json({ error: "TMDb person search failed" }, { status: 502 });
    const person = (await found.json())?.results?.[0];
    // No such person is a normal answer, not a failure: the library's credits can
    // name someone TMDb has since merged or renamed. The screen then shows only
    // what you already have, which is still useful.
    if (!person?.id) return NextResponse.json({ credits: [] } satisfies PersonResponse);

    // TMDb gives a headshot on the search result itself, so this costs nothing
    // extra — the first version resolved the person, read the id and threw the
    // rest of the object away.
    const profile: string | undefined = person.profile_path
      ? `https://image.tmdb.org/t/p/w185${person.profile_path}`
      : undefined;

    if (portraitOnly) return NextResponse.json({ credits: [], profile } satisfies PersonResponse);

    const creditsUrl = new URL(`${BASE}/person/${person.id}/movie_credits`);
    creditsUrl.searchParams.set("api_key", key);
    const res = await fetch(creditsUrl, { next: { revalidate: WEEK } });
    if (!res.ok) return NextResponse.json({ error: "TMDb credits failed" }, { status: 502 });
    const data = await res.json();

    const raw: TmdbCredit[] =
      role === "actor"
        ? (data.cast ?? [])
        : // Crew covers every job on a film, so a director's list would otherwise
          // include everything they ever produced or wrote.
          (data.crew ?? []).filter((c: TmdbCredit) => c.job === "Director");

    const seen = new Set<string>();
    const credits: Credit[] = raw
      .map((c) => ({
        title: c.title ?? "",
        year: (c.release_date ?? "").slice(0, 4),
        poster: c.poster_path ? `https://image.tmdb.org/t/p/w185${c.poster_path}` : undefined,
        popularity: c.popularity ?? 0,
      }))
      // Unreleased and untitled entries cannot be logged or ranked, so listing
      // them would only pad the "not logged" count with things you cannot act on.
      .filter((c) => c.title && c.year)
      .filter((c) => {
        // TMDb credits an actor once per role, so a dual role is two rows for one
        // film — which would then merge onto one library film and show twice.
        const k = `${c.title}|${c.year}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => b.popularity - a.popularity)
      // A prolific actor has hundreds of credits, most of them one scene in
      // something nobody logged. The head of the list is the part worth showing.
      .slice(0, 60)
      .map(({ title, year, poster }) => ({ title, year, poster }));

    return NextResponse.json({ credits, profile } satisfies PersonResponse);
  } catch {
    return NextResponse.json({ error: "TMDb request failed" }, { status: 502 });
  }
}
