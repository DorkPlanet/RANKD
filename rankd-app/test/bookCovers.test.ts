// Choosing a book's artwork.
//
// The bug this exists to prevent shipped and was reported from a phone: "a lot
// of the books don't load the posters". Open Library answers an ISBN it has no
// cover for with **200 and a 43-byte 1x1 GIF**, not a 404 — so every check in
// the app passed and two thirds of a library wore empty frames. Measured on the
// live pipeline: 8 of 12 popular books.

import { afterEach, describe, expect, it, vi } from "vitest";
import { coverFor, resolvedMetaOf, type Volume } from "@/lib/books";

afterEach(() => {
  vi.unstubAllGlobals();
});

const OL_ISBN = "https://covers.openlibrary.org/b/isbn";
const OL_ID = "https://covers.openlibrary.org/b/id";

/**
 * Route each URL by hand, so a test says exactly which sources exist.
 * `isbn` — does the ISBN cover resolve. `work` — the cover_i search returns.
 */
function stub({
  isbn = false,
  work = null,
  workTitle,
}: { isbn?: boolean; work?: number | null; workTitle?: string } = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init?: { method?: string }) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      if (u.startsWith(OL_ISBN)) return { ok: isbn, status: isbn ? 200 : 404 };
      if (u.startsWith("https://openlibrary.org/search.json")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            docs: work ? [{ cover_i: work, title: workTitle ?? "Circe" }] : [],
          }),
        };
      }
      return { ok: false, status: 404 };
    }),
  );
  return calls;
}

const vol = (over: Partial<NonNullable<Volume["volumeInfo"]>> = {}): Volume => ({
  id: "v1",
  volumeInfo: {
    title: "Circe",
    authors: ["Madeline Miller"],
    industryIdentifiers: [{ type: "ISBN_13", identifier: "9786020665931" }],
    ...over,
  },
});

describe("coverFor", () => {
  it("always asks Open Library with default=false", () => {
    // Without it a missing cover is a 200 holding a blank image, and every
    // check in the app passes on an empty frame.
    const calls = stub({ isbn: true });
    return coverFor(vol()).then((url) => {
      expect(url).toContain("default=false");
      expect(calls.some((c) => c.includes("default=false"))).toBe(true);
    });
  });

  it("prefers the ISBN cover when one really exists", async () => {
    // Precise: an ISBN names one edition, so there is no question whose cover
    // it is. Only used when verified.
    stub({ isbn: true });
    const url = await coverFor(vol());
    expect(url).toBe(`${OL_ISBN}/9786020665931-L.jpg?default=false`);
  });

  it("verifies the ISBN cover with a HEAD rather than downloading it", async () => {
    const calls = stub({ isbn: true });
    await coverFor(vol());
    expect(calls[0]).toBe(`HEAD ${OL_ISBN}/9786020665931-L.jpg?default=false`);
  });

  it("falls back to the work search when the ISBN cover is missing", async () => {
    // THE case. Google names an obscure edition — Circe came back as an
    // Indonesian printing — and Open Library only holds canonical covers.
    stub({ isbn: false, work: 12345 });
    expect(await coverFor(vol())).toBe(`${OL_ID}/12345-L.jpg`);
  });

  it("refuses a work cover whose title is a different book", async () => {
    // A fuzzy search that misses returns somebody ELSE'S book. Wearing the
    // wrong cover is worse than wearing none — the argument in tmdbMatch.ts.
    stub({ isbn: false, work: 999, workTitle: "The Song of Achilles" });
    // Google thumbnail is absent here, so the honest answer is nothing at all.
    expect(await coverFor(vol())).toBeUndefined();
  });

  it("accepts a work cover whose title differs only by punctuation or an article", async () => {
    stub({ isbn: false, work: 7, workTitle: "the  circe!" });
    expect(await coverFor(vol())).toBe(`${OL_ID}/7-L.jpg`);
  });

  it("falls back to Google's thumbnail when Open Library has nothing", async () => {
    stub({ isbn: false, work: null });
    const url = await coverFor(
      vol({
        imageLinks: { thumbnail: "http://books.google.com/books/content?id=x&zoom=5&edge=curl" },
      }),
    );
    expect(url).toContain("zoom=1");
    expect(url).not.toContain("edge=curl");
    expect(url?.startsWith("https://")).toBe(true);
  });

  it("has no cover at all when every source misses", async () => {
    // Better than a blank: the app draws its own "no artwork" state, which is
    // honest, where an empty frame reads as broken.
    stub({ isbn: false, work: null });
    expect(await coverFor(vol())).toBeUndefined();
  });

  it("skips the ISBN step entirely for a volume without one", async () => {
    const calls = stub({ isbn: false, work: 5 });
    await coverFor(vol({ industryIdentifiers: [] }));
    expect(calls.some((c) => c.includes("/b/isbn/"))).toBe(false);
  });

  it("survives a search that throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(coverFor(vol())).resolves.toBeUndefined();
  });
});

describe("resolvedMetaOf", () => {
  it("keeps the volume's data and replaces only the artwork", async () => {
    stub({ isbn: false, work: 42 });
    const m = await resolvedMetaOf(vol({ pageCount: 393, categories: ["Fiction"] }));
    expect(m).toMatchObject({
      bookId: "v1",
      author: "Madeline Miller",
      pages: 393,
      genres: ["Fiction"],
      poster: `${OL_ID}/42-L.jpg`,
    });
  });
});
