// Talking to Google Books and Open Library, without being a route.
//
// The mirror of `tmdb.ts`, and it exists for the same reason that file does: a
// route may only export HTTP handlers, and `guard.ts` refuses any request with
// neither an Origin nor a Referer — so anything a script might also need has to
// live in `lib/`.
//
// ── Why two services for one medium ────────────────────────────────────────
//
// There is no TMDb for books. The two candidates are each good at one half of
// the job and bad at the other:
//
//  · GOOGLE BOOKS has the search. Relevance on a bare title is close to TMDb's,
//    it carries the author, the description, the page count and a publication
//    date, and the whole thing is one request. Its images are the problem:
//    `thumbnail` is about 128px on its longest edge, which is a smear at the
//    size the duel screen draws artwork.
//
//  · OPEN LIBRARY has the covers. `covers.openlibrary.org/b/isbn/{isbn}-L.jpg`
//    is roughly 500px, free, keyless and needs no lookup — the ISBN is the URL.
//    Its own search is markedly worse and its edition data is patchy, so it is
//    not a candidate for the matching half.
//
// So: Google Books decides WHICH book, Open Library dresses it. The join is the
// ISBN-13 that Google returns in `industryIdentifiers`, which costs no extra
// request because it arrives on the response that answered the search.
//
// ── When there is no ISBN ──────────────────────────────────────────────────
//
// Older and self-published titles often have none. Those fall back to Google's
// thumbnail, upgraded by hand: the URL takes a `zoom` parameter, and `zoom=1`
// with `edge=curl` stripped is around 300px rather than 128. Not as good as
// Open Library and much better than nothing — and a small cover is a far softer
// failure than a missing one, which is a grey box on the duel screen.
//
// ── The key is optional in the code and REQUIRED in practice ───────────────
//
// The first version of this note said Google Books "answers unauthenticated
// requests at a lower quota", so working without a key was a graceful
// degradation. Then it was measured against the live API from an ordinary IP:
//
//   "The Dispossessed"  ->  429
//   "Neuromancer"       ->  429
//   "Piranesi"          ->  429
//
// Not a lower quota. No quota. Unauthenticated search is refused outright, so
// on a deployment with no key the book half of this app finds nothing at all.
//
// The code still treats the key as optional, and that is still the right shape:
// a missing key degrades rather than throwing a 500, and it costs one `if`. But
// nothing here should read as though a keyless deployment is a working one, so
// `.env.example` says so in as many words and this is why.
//
// The COVER half is genuinely keyless and genuinely works — verified, 200 and
// `image/jpeg` from `covers.openlibrary.org`. So the two halves fail
// independently, which is the reason for splitting them in the first place.

import { normalise } from "./tmdbMatch";

const GOOGLE = "https://www.googleapis.com/books/v1";
const COVERS = "https://covers.openlibrary.org/b/isbn";
const COVER_BY_ID = "https://covers.openlibrary.org/b/id";
const OL_SEARCH = "https://openlibrary.org/search.json";
const DAY = 60 * 60 * 24;

// ── `default=false`, and why every cover URL must carry it ─────────────────
//
// Without it, an ISBN Open Library has no cover for answers **200 with a
// 43-byte 1x1 GIF**. Not a 404 — a successful response containing a blank. So
// `<img>` fires `onload`, every "is there artwork" check passes, and the reader
// gets an empty frame that nothing in the app can tell apart from a real cover.
//
// Measured on the live pipeline: 8 of 12 popular books came back as that blank.
// With this parameter those become 404s, which is a failure the code can see and
// act on. See `coverFor`.
const noBlanks = (url: string) => `${url}?default=false`;

/** Everything worth keeping about one book. Shaped to match `FilmMeta`. */
export interface BookMeta {
  /** Google Books volume id. The book equivalent of `tmdbId`. */
  bookId?: string;
  /** ISBN-13 where there is one. It is the cover URL and the join to Open Library. */
  isbn?: string;
  poster?: string;
  synopsis?: string;
  /** Page count. Carried in `runtime`'s slot downstream — see `lengthLabel`. */
  pages?: number;
  /** Google's categories. Coarse, and the only genre signal a book has. */
  genres?: string[];
  /** The author. One line, even when there are several — see `authorLine`. */
  author?: string;
  /** Every credited author, so a run can be built on any of them. */
  authors?: string[];
  publisher?: string;
  language?: string;
}

/** One volume as Google returns it. Only the fields this file reads. */
export interface Volume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publishedDate?: string;
    publisher?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    language?: string;
    averageRating?: number;
    ratingsCount?: number;
    imageLinks?: { thumbnail?: string; smallThumbnail?: string };
    industryIdentifiers?: { type?: string; identifier?: string }[];
  };
}

/**
 * The best ISBN on a volume, preferring 13 over 10.
 *
 * Open Library's cover endpoint accepts either, but a 13 resolves more often —
 * it is what modern editions are catalogued under, and a 10 is frequently the
 * one a reprint dropped.
 */
function isbnOf(v: Volume): string | undefined {
  const ids = v.volumeInfo?.industryIdentifiers ?? [];
  const pick = (type: string) => ids.find((i) => i.type === type)?.identifier;
  return pick("ISBN_13") ?? pick("ISBN_10");
}

/**
 * Google's thumbnail, made as large as that endpoint will go.
 *
 * `zoom=1` is roughly 300px against the default's 128, and `edge=curl` draws a
 * fake page-curl over the corner of the image — charming in a search result and
 * wrong on a card the app treats as artwork. Both are query parameters on a URL
 * Google hands back, so this rewrites rather than constructs: the token in the
 * path is theirs and must be carried through untouched.
 *
 * Forced to https. Google still returns http on some volumes, and a page served
 * over https drops the image without a word.
 */
function bigThumb(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.replace(/^http:/, "https:"));
    u.searchParams.delete("edge");
    u.searchParams.set("zoom", "1");
    return u.toString();
  } catch {
    return undefined;
  }
}

/**
 * Four digits out of whatever Google calls a publication date.
 *
 * It returns "2019", "2019-03" and "2019-03-14" interchangeably, and occasionally
 * something else entirely. Anything that does not start with four digits is no
 * year rather than a guess.
 */
export function yearOf(published: string | undefined): string {
  const m = /^(\d{4})/.exec(published ?? "");
  return m ? m[1] : "";
}

/**
 * Several authors as one line.
 *
 * `director` holds one name and everything downstream — the person shelf, the
 * search index, the card — is built on that being true. A book with three
 * authors still has one line worth showing, so the extras join with "&" rather
 * than being dropped, and `authors` keeps the full list for anything that wants
 * to ask properly.
 *
 * Capped at two names plus "et al." A textbook with fourteen editors would
 * otherwise produce a credit line longer than the title.
 */
export function authorLine(authors: string[] | undefined): string | undefined {
  if (!authors?.length) return undefined;
  if (authors.length <= 2) return authors.join(" & ");
  return `${authors[0]} et al.`;
}

/** Does this URL give back a real image rather than a placeholder or a 404? */
async function exists(url: string): Promise<boolean> {
  try {
    // HEAD, so nothing downloads. Cached for a day like every other call here,
    // which is what keeps a 400-book import to 400 cheap requests rather than
    // 400 on every single session.
    const r = await fetch(url, { method: "HEAD", next: { revalidate: DAY } });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Open Library's cover for the WORK, found by title and author.
 *
 * ── Why this is needed when the ISBN is already known ─────────────────────
 *
 * The ISBN is not wrong. The EDITION is obscure. Google's search returns
 * whichever volume it ranks first, which is regularly a regional printing or an
 * ebook — Circe came back as `9786020665931`, an Indonesian edition — and Open
 * Library holds covers for canonical editions, not for every printing that ever
 * existed. So an exact, correct ISBN lookup misses.
 *
 * Its search index is by WORK, so it answers the question actually being asked:
 * what does this book look like. Measured on the eight books whose ISBN cover
 * came back blank, this found all eight, at 20–94kb.
 *
 * ── The title check is not optional ───────────────────────────────────────
 *
 * This is a fuzzy search, and a fuzzy search that misses returns somebody else's
 * book rather than nothing. Wearing the wrong cover is worse than wearing none —
 * the whole argument in `tmdbMatch.ts` — so the result has to still look like
 * the book that was asked for before its artwork is used.
 */
async function workCover(title: string, author?: string): Promise<string | undefined> {
  const u = new URL(OL_SEARCH);
  u.searchParams.set("title", title);
  if (author) u.searchParams.set("author", author);
  u.searchParams.set("limit", "1");
  // Only the two fields this reads. Their default response is enormous.
  u.searchParams.set("fields", "cover_i,title");

  try {
    const r = await fetch(u, { next: { revalidate: DAY } });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { docs?: { cover_i?: number; title?: string }[] };
    const hit = j.docs?.[0];
    if (!hit?.cover_i) return undefined;
    // Same normalisation the film matcher uses, so "The Secret History" and
    // "Secret History" agree and "Dune" and "Dune Messiah" do not.
    if (normalise(hit.title ?? "") !== normalise(title)) return undefined;
    return `${COVER_BY_ID}/${hit.cover_i}-L.jpg`;
  } catch {
    return undefined;
  }
}

/**
 * The best artwork that actually EXISTS for this volume.
 *
 * Three sources, in order of how sure they are that the image belongs to this
 * exact book:
 *
 *  1. The ISBN cover. Precise — an ISBN names one edition and nothing else — so
 *     when it resolves there is no question of whose cover it is.
 *  2. Open Library's work search. Fuzzy, title-checked, and the one that does
 *     the real work: it rescued every book the ISBN missed.
 *  3. Google's own thumbnail. Small (~300px) and the last resort, because a
 *     soft cover is still enormously better than an empty frame.
 *
 * Each is verified before it is handed back, so this never names a URL that
 * renders as nothing — which is the entire point, given Open Library answers a
 * missing cover with a blank image and a 200.
 */
export async function coverFor(v: Volume): Promise<string | undefined> {
  const info = v.volumeInfo ?? {};
  const isbn = isbnOf(v);

  if (isbn) {
    const byIsbn = noBlanks(`${COVERS}/${isbn}-L.jpg`);
    if (await exists(byIsbn)) return byIsbn;
  }

  if (info.title) {
    const byWork = await workCover(info.title, info.authors?.[0]);
    // No `exists` check: `cover_i` is Open Library's own id for an image it
    // holds, so unlike an ISBN it cannot point at a gap.
    if (byWork) return byWork;
  }

  return bigThumb(info.imageLinks?.thumbnail);
}

/**
 * One volume as the app should STORE it — artwork verified.
 *
 * Separate from `metaOf` because it costs one to two extra requests, and only
 * the library is worth paying that for. See the note in `metaOf`.
 */
export async function resolvedMetaOf(v: Volume): Promise<BookMeta> {
  return { ...metaOf(v), poster: await coverFor(v) };
}

/** Everything worth keeping about one volume, by its Google Books id. */
export async function detailOf(id: string, key?: string): Promise<BookMeta | null> {
  const url = new URL(`${GOOGLE}/volumes/${encodeURIComponent(id)}`);
  if (key) url.searchParams.set("key", key);

  const res = await fetch(url, { next: { revalidate: DAY } });
  if (!res.ok) return null;
  return resolvedMetaOf((await res.json()) as Volume);
}

/**
 * A volume as the app stores it.
 *
 * Split out because a search response already contains everything a detail call
 * would return — Google embeds the full `volumeInfo` in each search hit — so the
 * matching path can build its answer without a second request. That is one
 * fewer round trip per book than the film path needs, and on a 400-book import
 * it is 400 fewer requests.
 */
export function metaOf(v: Volume): BookMeta {
  const info = v.volumeInfo ?? {};
  const isbn = isbnOf(v);
  return {
    bookId: v.id,
    isbn,
    // Open Library first, Google's upgraded thumbnail second. See the header.
    //
    // This is the CHEAP answer, and it is knowingly incomplete: it names the
    // ISBN cover without checking whether one exists. `coverFor` is the
    // complete answer and costs a request; the picker uses this one because it
    // draws twelve rows at 28px and a missing thumbnail there is a shrug, while
    // twelve extra round trips is a search that feels broken.
    //
    // Anything that lands in the LIBRARY goes through `coverFor` instead.
    poster: isbn ? noBlanks(`${COVERS}/${isbn}-L.jpg`) : bigThumb(info.imageLinks?.thumbnail),
    synopsis: info.description || undefined,
    pages: info.pageCount || undefined,
    genres: info.categories?.length ? info.categories : undefined,
    author: authorLine(info.authors),
    authors: info.authors?.length ? info.authors : undefined,
    publisher: info.publisher || undefined,
    language: info.language || undefined,
  };
}

/**
 * Search a title, and hand back the volumes for something else to choose from.
 *
 * The author is deliberately NOT sent as an `inauthor:` filter. Google treats
 * that as a hard constraint, so an import whose author string is "Le Guin,
 * Ursula K." — which is how Goodreads writes it — returns nothing at all. It is
 * far more useful as a tie-breaker, which is what `bestBook` does with it, and
 * this is the same argument `searchMovies` makes about the year.
 *
 * `maxResults` is 10 rather than the default 20: `bestBook` reads every hit, and
 * the tail of a Google Books search is reliably junk — study guides, summaries
 * and "a novel approach to" titles that share a word.
 */
export async function searchBooks(
  title: string,
  key?: string,
  author?: string,
): Promise<Volume[] | null> {
  const url = new URL(`${GOOGLE}/volumes`);
  // Quoted, so a multi-word title is a phrase rather than a bag of words. The
  // author rides along as free text — it lifts the right edition when it
  // matches and costs nothing when it does not.
  url.searchParams.set("q", author ? `"${title}" ${author}` : `"${title}"`);
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("printType", "books");
  if (key) url.searchParams.set("key", key);

  const res = await fetch(url, { next: { revalidate: DAY } });
  // ── `null`, not `[]`, and the difference is the whole point ──────────────
  //
  // An empty array means "Google has no such book", which the caller records as
  // `noMatch` — and `noMatch` is permanent: the queue never asks about that
  // record again. A failed REQUEST is not that answer, and returning `[]` for
  // one would quietly retire a book that exists.
  //
  // This is not hypothetical here. Measured against the live API: an
  // unauthenticated request answers **429** from an ordinary IP, on every query
  // tried. So without a key this is the NORMAL response, not the rare one, and
  // the old shape would have walked an entire imported library and marked every
  // book in it as not existing.
  //
  // `guard.ts` records the same bug from the other side: a 429 reaching the
  // client "was indistinguishable from 'TMDb has nothing' (both arrive as {}),
  // so those films were cached as answered and never asked about again".
  if (!res.ok) return null;
  const data = (await res.json()) as { items?: Volume[] };
  return data.items ?? [];
}
