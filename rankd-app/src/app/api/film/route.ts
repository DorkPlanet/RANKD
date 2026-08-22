import { NextResponse } from "next/server";
import { refuse } from "../guard";
import { bestMatch } from "@/lib/tmdbMatch";
import { detailOf, searchMovies, type FilmMeta } from "@/lib/tmdb";

// Server-side TMDb proxy. The key is read from the environment here and never
// reaches the browser — the client only ever sees the normalised shape below.
//
// Seed films carry no TMDb id, and user-added films won't either, so this
// resolves by title (+ year when known) and then pulls details and credits in a
// single follow-up call.
//
// The talking-to-TMDb half moved to `lib/tmdb.ts` when a seeding script needed
// it: `guard.ts` refuses anything with no Origin and no Referer, so a script
// cannot call this route, and a route file may only export HTTP handlers. Same
// move `bestMatch` made into `tmdbMatch.ts`. This file is now only the HTTP
// shape: what the parameters mean, and which failure is which status.

// Re-exported because `lib/meta.ts` and the client both import the type from
// here. Moving the declaration was enough; moving the import site would be a
// second change in a dozen files for no gain.
export type { FilmMeta };

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

    const results = await searchMovies(title, key);
    const hit = bestMatch(results, title, year);
    if (!hit) return NextResponse.json({}, { status: 200 }); // no match — card just shows less

    const meta = await detailOf(hit.id, key);
    return meta
      ? NextResponse.json(meta)
      : NextResponse.json({ error: "TMDb detail failed" }, { status: 502 });
  } catch {
    return NextResponse.json({ error: "TMDb request failed" }, { status: 502 });
  }
}
