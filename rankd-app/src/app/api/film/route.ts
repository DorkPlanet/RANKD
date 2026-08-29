import { NextResponse } from "next/server";
import { refuse } from "../guard";
import { bestMatch } from "@/lib/tmdbMatch";
import { bestBook } from "@/lib/bookMatch";
import { detailOf, searchMovies, type FilmMeta } from "@/lib/tmdb";
import { detailOf as bookDetail, resolvedMetaOf, searchBooks, type BookMeta } from "@/lib/books";

// Server-side metadata proxy. The keys are read from the environment here and
// never reach the browser — the client only ever sees the normalised shape.
//
// Seed films carry no TMDb id, and user-added films won't either, so this
// resolves by title (+ year when known) and then pulls details and credits in a
// single follow-up call.
//
// The talking-to-the-service half lives in `lib/tmdb.ts` and `lib/books.ts`
// because a seeding script needed it: `guard.ts` refuses anything with no Origin
// and no Referer, so a script cannot call this route, and a route file may only
// export HTTP handlers. This file is now only the HTTP shape: what the
// parameters mean, and which failure is which status.
//
// ── Why books came here rather than to /api/book ───────────────────────────
//
// A second route would have duplicated the guard, the parameter parsing, the
// "id skips the search" rule and all four failure statuses — and the client
// would need to know which URL to call, which is a branch at every call site
// instead of one here. `fetchMeta` builds one URL and adds `medium` to it.
//
// What the two mediums DO NOT share is the id type. TMDb ids are integers and
// Google Books volume ids are opaque strings like `zyTCAlFPjgYC`, so the
// validation below is per-medium and the loose one is not allowed to answer for
// the strict one.

// Re-exported because `lib/meta.ts` and the client both import the type from
// here. Moving the declaration was enough; moving the import site would be a
// second change in a dozen files for no gain.
export type { FilmMeta };

/**
 * A book's metadata in the shape `Film` already stores.
 *
 * ── Why the fields are renamed here and not downstream ─────────────────────
 *
 * `Film` has `director`, `runtime` and `genres`, and every reader in the app is
 * built on those names — the person shelf, the search index, the profile, the
 * share card. A book's author is not conceptually a director, but it occupies
 * the same slot exactly: the one credit a ranking can be built on. Mapping it
 * HERE means one line of translation at the boundary instead of a `medium ===`
 * branch in forty components.
 *
 * The lexicon is what makes this honest rather than a lie: nothing shows the
 * word "director" to a reader ranking books, because every label comes from
 * `lex()`. The field name is an internal one and stays film-flavoured, which is
 * a wart recorded in `HANDOVER.md` rather than a bug.
 */
function asFilmMeta(b: BookMeta): FilmMeta & { bookId?: string; isbn?: string } {
  return {
    bookId: b.bookId,
    isbn: b.isbn,
    poster: b.poster,
    synopsis: b.synopsis,
    // Page count in runtime's slot. `lengthLabel` is what decides whether a
    // reader sees "128 min" or "384 pages".
    runtime: b.pages,
    genres: b.genres,
    director: b.author,
    // Google's categories are the only genre signal a book has, and there is no
    // second, narrower one — so `keywords` stays empty rather than being filled
    // with a copy of `genres`. A duplicate would make the subgenre shelf claim
    // to know something it does not.
    language: b.language,
  };
}

export async function GET(request: Request) {
  const no = refuse(request);
  if (no) return no;

  const params = new URL(request.url).searchParams;
  const medium = params.get("medium") === "book" ? "book" : "film";
  const title = params.get("title");
  // ── Correcting a match ────────────────────────────────────────────────────
  //
  // `id` skips the search entirely. Everything below exists to GUESS which title
  // was meant, and when a person has picked one out of `/api/search` there is
  // nothing left to guess — searching again could only find its way back to the
  // wrong one, which is the thing being corrected.
  const id = params.get("id");
  if (!id && !title) {
    return NextResponse.json({ error: "title or id is required" }, { status: 400 });
  }

  if (medium === "book") {
    // Optional so that a missing key degrades rather than throwing a 500. It is
    // NOT optional in practice: measured, Google refuses unauthenticated search
    // outright. See the header of `lib/books.ts`.
    const key = process.env.GOOGLE_BOOKS_API_KEY;
    const author = params.get("author");
    const year = params.get("year");

    try {
      if (id) {
        // Volume ids are opaque strings. Bounded and character-classed rather
        // than passed through: this ends up in a URL path, and an unvalidated
        // path segment is how a proxy becomes an open redirect.
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
          return NextResponse.json({ error: "bad id" }, { status: 400 });
        }
        const meta = await bookDetail(id, key);
        return meta
          ? NextResponse.json(asFilmMeta(meta))
          : NextResponse.json({ error: "Google Books detail failed" }, { status: 502 });
      }

      if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

      const results = await searchBooks(title, key, author ?? undefined);
      // Could not ask, as opposed to asked and found nothing. A 502 so the
      // client treats it as a failure and leaves the record alone; a 200 with
      // an empty body would retire the book permanently. See `searchBooks`.
      if (results === null) {
        return NextResponse.json({ error: "Google Books request failed" }, { status: 502 });
      }

      const hit = bestBook(results, title, author, year);
      // A real no-match. The card just shows less, same contract as the film
      // path — `withMeta` records `noMatch` and the queue stops asking forever.
      if (!hit) return NextResponse.json({}, { status: 200 });

      // No second GOOGLE request. Google embeds the full `volumeInfo` in every
      // search hit, so the search that found this book already carries
      // everything a detail call would return — the film path cannot do this
      // because TMDb's search omits credits.
      //
      // `resolvedMetaOf` does spend one or two cheap, day-cached requests
      // verifying the artwork, and that is not optional: Open Library answers a
      // missing cover with a 200 and a blank image, so an unverified URL is how
      // two thirds of a library ends up wearing empty frames.
      return NextResponse.json(asFilmMeta(await resolvedMetaOf(hit)));
    } catch {
      return NextResponse.json({ error: "Google Books request failed" }, { status: 502 });
    }
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "TMDB_API_KEY is not set" }, { status: 500 });
  }

  const year = params.get("year");

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
