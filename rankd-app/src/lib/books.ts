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

const GOOGLE = "https://www.googleapis.com/books/v1";
const COVERS = "https://covers.openlibrary.org/b/isbn";
const DAY = 60 * 60 * 24;

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

/** Everything worth keeping about one volume, by its Google Books id. */
export async function detailOf(id: string, key?: string): Promise<BookMeta | null> {
  const url = new URL(`${GOOGLE}/volumes/${encodeURIComponent(id)}`);
  if (key) url.searchParams.set("key", key);

  const res = await fetch(url, { next: { revalidate: DAY } });
  if (!res.ok) return null;
  return metaOf((await res.json()) as Volume);
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
    poster: isbn ? `${COVERS}/${isbn}-L.jpg` : bigThumb(info.imageLinks?.thumbnail),
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
