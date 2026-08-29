// The Google Books / Open Library client.
//
// The case that matters most here is not "does it parse a volume" — it is the
// difference between "there is no such book" and "I could not ask". The first is
// recorded permanently as `noMatch`; the second must not be, and Google answers
// 429 to every unauthenticated request, so the second is the COMMON case on a
// deployment with no key.

import { afterEach, describe, expect, it, vi } from "vitest";
import { authorLine, metaOf, searchBooks, yearOf, type Volume } from "@/lib/books";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Answer every fetch with this status and body. */
function stubFetch(status: number, body: unknown = {}) {
  // The URL parameter is declared even though the stub ignores it: without it
  // the mock's call tuple is empty and `calls[0][0]` does not typecheck, which
  // is exactly the assertion these tests are here to make.
  const fn = vi.fn(async (url: URL | string) => ({
    url: String(url),
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("searchBooks", () => {
  it("returns the volumes on a good response", async () => {
    stubFetch(200, { items: [{ id: "a", volumeInfo: { title: "Dune" } }] });
    const out = await searchBooks("Dune");
    expect(out).toHaveLength(1);
  });

  it("returns an empty array when Google genuinely has nothing", async () => {
    // A real answer: asked, nothing found. The caller may record this.
    stubFetch(200, {});
    expect(await searchBooks("Qwertyuiop")).toEqual([]);
  });

  it("returns null on a 429 rather than an empty array", async () => {
    // THE test in this file. `[]` here would mean the caller records `noMatch`
    // on a book that exists, permanently, and never asks again — and 429 is
    // what an unauthenticated request actually gets.
    stubFetch(429, { error: "rate limited" });
    expect(await searchBooks("Dune")).toBeNull();
  });

  it("returns null on any other failure", async () => {
    stubFetch(503);
    expect(await searchBooks("Dune")).toBeNull();
  });

  it("sends the key when there is one, and omits it when there is not", async () => {
    const withKey = stubFetch(200, { items: [] });
    await searchBooks("Dune", "SECRET");
    expect(String(withKey.mock.calls[0][0])).toContain("key=SECRET");

    const without = stubFetch(200, { items: [] });
    await searchBooks("Dune");
    expect(String(without.mock.calls[0][0])).not.toContain("key=");
  });

  it("sends the author as free text, never as an inauthor filter", async () => {
    // `inauthor:` is a hard constraint, so an import whose author reads
    // "Le Guin, Ursula K." would return nothing at all.
    const fn = stubFetch(200, { items: [] });
    await searchBooks("The Dispossessed", undefined, "Le Guin, Ursula K.");
    const url = String(fn.mock.calls[0][0]);
    expect(url).not.toContain("inauthor");
    // `+` rather than a space: URLSearchParams encodes it that way, which is
    // what the wire actually carries.
    expect(decodeURIComponent(url)).toContain("Le+Guin");
  });
});

describe("metaOf", () => {
  const vol = (info: Volume["volumeInfo"]): Volume => ({ id: "vid", volumeInfo: info });

  it("prefers an Open Library cover by ISBN-13", () => {
    // The whole reason two services are used: Google's own thumbnail is ~128px.
    const m = metaOf(
      vol({
        title: "Dune",
        industryIdentifiers: [
          { type: "ISBN_10", identifier: "0441013597" },
          { type: "ISBN_13", identifier: "9780441013593" },
        ],
        imageLinks: { thumbnail: "http://books.google.com/books/content?id=x&zoom=5&edge=curl" },
      }),
    );
    // `default=false` is not decoration: without it a missing cover comes back
    // as a 200 holding a 43-byte blank, which every check in the app treats as
    // real artwork. See `noBlanks`.
    expect(m.poster).toBe(
      "https://covers.openlibrary.org/b/isbn/9780441013593-L.jpg?default=false",
    );
    expect(m.isbn).toBe("9780441013593");
  });

  it("falls back to Google's thumbnail when there is no ISBN", () => {
    // Older and self-published titles often have none, and a small cover is a
    // far softer failure than the grey box a missing one leaves.
    const m = metaOf(
      vol({
        title: "Something Obscure",
        imageLinks: { thumbnail: "http://books.google.com/books/content?id=x&zoom=5&edge=curl" },
      }),
    );
    // `w=800` measures 800x1227. `zoom=1` measured 128x196 — the SMALLEST
    // option Google offers, despite the comment that once claimed otherwise.
    expect(m.poster).toContain("w=800");
    expect(m.poster).not.toContain("zoom=");
    expect(m.poster).not.toContain("edge=curl");
    // http would be dropped silently by a page served over https.
    expect(m.poster?.startsWith("https://")).toBe(true);
  });

  it("has no poster at all when there is neither", () => {
    expect(metaOf(vol({ title: "Nothing" })).poster).toBeUndefined();
  });

  it("carries the page count and the categories", () => {
    const m = metaOf(vol({ title: "Dune", pageCount: 412, categories: ["Fiction"] }));
    expect(m.pages).toBe(412);
    expect(m.genres).toEqual(["Fiction"]);
  });

  it("survives a volume with no volumeInfo at all", () => {
    expect(() => metaOf({ id: "x" })).not.toThrow();
  });
});

describe("authorLine", () => {
  it("is absent when there are no authors", () => {
    expect(authorLine(undefined)).toBeUndefined();
    expect(authorLine([])).toBeUndefined();
  });

  it("joins two with an ampersand", () => {
    expect(authorLine(["Neil Gaiman", "Terry Pratchett"])).toBe("Neil Gaiman & Terry Pratchett");
  });

  it("caps at one name plus et al.", () => {
    // A textbook with fourteen editors would otherwise produce a credit line
    // longer than the title.
    expect(authorLine(["A", "B", "C", "D"])).toBe("A et al.");
  });
});

describe("yearOf", () => {
  it.each([
    ["2019", "2019"],
    ["2019-03", "2019"],
    ["2019-03-14", "2019"],
  ])("takes four digits off %s", (input, want) => {
    expect(yearOf(input)).toBe(want);
  });

  it("is empty rather than a guess when there is no year", () => {
    expect(yearOf(undefined)).toBe("");
    expect(yearOf("sometime in the eighties")).toBe("");
  });
});
