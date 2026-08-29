import { NextResponse } from "next/server";
import { refuse } from "../guard";
import { coverCandidates } from "@/lib/books";

// Several covers for one book, so a person can pick the edition they mean.
//
// ── Why this is its own route and not a mode on /api/film ─────────────────
//
// The same argument `/api/stills` makes for films: that route answers "what IS
// this", and this one answers "what does it LOOK like". They are asked at
// completely different moments — `/api/film` runs over every record in the
// library as you browse, this one only when somebody has opened a card and
// decided the artwork is wrong.
//
// Folding it in would also mean the library sweep paid for the edition checks
// below, which are the expensive part: up to ten HEAD requests to find the three
// to six editions that actually have artwork.
//
// ── Books only, deliberately ──────────────────────────────────────────────
//
// A film has one poster and it is canonical. A book has as many covers as it has
// had printings, and which one is "right" is a question only its owner can
// answer. TMDb does serve alternative posters, so the film half is available
// later — it is left out because nobody has asked for it and the film artwork
// path is settled.

export interface Covers {
  covers: string[];
}

export async function GET(request: Request) {
  const no = refuse(request);
  if (no) return no;

  const params = new URL(request.url).searchParams;
  const title = params.get("title")?.trim();
  const author = params.get("author")?.trim() || undefined;

  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  try {
    const covers = await coverCandidates(title, author);
    // An empty list is a real answer — Open Library holds nothing for this book —
    // and the sheet says so. It is not an error and must not be one, or the
    // picker would show "something went wrong" for a book that simply has no
    // alternative artwork.
    return NextResponse.json({ covers } satisfies Covers);
  } catch {
    return NextResponse.json({ error: "Open Library request failed" }, { status: 502 });
  }
}
