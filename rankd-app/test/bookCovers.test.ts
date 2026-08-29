// Choosing a book's artwork.
//
// Two reports drove this file, and both were about artwork that was CONFIDENTLY
// WRONG rather than missing:
//
//  1. "a lot of the books dont load the posters" — Open Library answers an ISBN
//     it has no cover for with 200 and a 43-byte 1x1 GIF, so every check passed
//     and two thirds of a library wore empty frames.
//  2. "my top one Annihilation is currently a photo of the trilogy, not the
//     individual book" — the metadata was right and the cover came from Open
//     Library's WORK default, which is one image chosen across all 26 editions
//     of that work and for Annihilation is a trilogy omnibus.
//
// Both services answer a missing cover with a 200 and a placeholder. Neither
// can be trusted without being checked, and the order they are tried in is the
// whole design.

import { afterEach, describe, expect, it, vi } from "vitest";
import { coverFor, resolvedMetaOf, type Volume } from "@/lib/books";

afterEach(() => {
  vi.unstubAllGlobals();
});

const OL_ISBN = "https://covers.openlibrary.org/b/isbn";
const OL_ID = "https://covers.openlibrary.org/b/id";
const ISBN = "9786020665931";

/** Google's "no cover available" card. Byte-identical for every volume missing one. */
const PLACEHOLDER = 46838;
/** A real cover, as `content-length` reports it. */
const REAL = 163000;

/** A Google cover URL in the shape `imageLinks.thumbnail` hands it over. */
const THUMB =
  "http://books.google.com/books/content?id=v1&printsec=frontcover&img=1&zoom=5&edge=curl";

/**
 * Route each service by hand, so a test states exactly which covers exist.
 * `googleBytes` of 0 means Google returns nothing at all for this volume.
 */
function stub({
  isbn = false,
  work = null,
  workTitle,
  googleBytes = 0,
}: {
  isbn?: boolean;
  work?: number | null;
  workTitle?: string;
  googleBytes?: number;
} = {}) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init?: { method?: string }) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      if (u.startsWith("https://books.google.com")) {
        return {
          ok: googleBytes > 0,
          status: googleBytes > 0 ? 200 : 404,
          headers: { get: () => String(googleBytes) },
        };
      }
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
    industryIdentifiers: [{ type: "ISBN_13", identifier: ISBN }],
    ...over,
  },
});

describe("coverFor", () => {
  // ── The order, which is the design ──────────────────────────────────────

  it("prefers Google's own cover, because it is the edition that was matched", async () => {
    // The Annihilation fix. Google had matched that book correctly — 192 pages,
    // "the first volume of the Southern Reach Trilogy" — and then the artwork
    // came from a different source and disagreed with it. `imageLinks` belongs
    // to the exact volume the rest of the metadata came from, so it cannot.
    const calls = stub({ isbn: true, work: 1, googleBytes: REAL });
    const url = await coverFor(vol({ imageLinks: { thumbnail: THUMB } }));
    expect(url).toContain("books.google.com");
    // And nothing else was even asked for.
    expect(calls.some((c) => c.includes("openlibrary"))).toBe(false);
  });

  it("falls back to the ISBN cover when Google holds no artwork", async () => {
    // No `imageLinks` means no image, so there is no URL to upgrade and the
    // branch falls through by itself rather than being skipped by a flag.
    stub({ isbn: true });
    expect(await coverFor(vol())).toBe(`${OL_ISBN}/${ISBN}-L.jpg?default=false`);
  });

  it("falls back to the work search only when both editions come up empty", async () => {
    // Still worth having and still LAST: it rescued eight of twelve books when
    // the ISBN missed. But it answers "what does this WORK look like" rather
    // than "what does this EDITION look like", and those differ precisely when
    // a work has an omnibus — which is how a trilogy got onto Annihilation.
    stub({ isbn: false, work: 12345 });
    expect(await coverFor(vol())).toBe(`${OL_ID}/12345-L.jpg`);
  });

  // ── Both services lie about missing covers, in different ways ───────────

  it("refuses Google's grey placeholder, which it serves with a 200", async () => {
    // The placeholder is byte-identical across volumes — two different books
    // returned the same MD5 — so `content-length` gives it away without
    // downloading anything.
    stub({ isbn: true, googleBytes: PLACEHOLDER });
    expect(await coverFor(vol({ imageLinks: { thumbnail: THUMB } }))).toBe(
      `${OL_ISBN}/${ISBN}-L.jpg?default=false`,
    );
  });

  it("always asks Open Library with default=false", async () => {
    // Without it a missing cover is a 200 holding a blank 1x1, which every
    // check in the app treats as real artwork.
    const calls = stub({ isbn: true });
    const url = await coverFor(vol());
    expect(url).toContain("default=false");
    expect(calls.some((c) => c.includes("default=false"))).toBe(true);
  });

  it("verifies with a HEAD rather than downloading the image", async () => {
    const calls = stub({ isbn: true });
    await coverFor(vol());
    expect(calls[0]).toBe(`HEAD ${OL_ISBN}/${ISBN}-L.jpg?default=false`);
  });

  // ── Size ────────────────────────────────────────────────────────────────

  it("asks Google for a size worth looking at", async () => {
    // `zoom=1` returned 128x196 — the SMALLEST option — while the comment on it
    // claimed "roughly 300px". `w=800` measures 800x1227.
    stub({ googleBytes: REAL });
    const url = await coverFor(vol({ imageLinks: { thumbnail: THUMB } }));
    expect(url).toContain("w=800");
    expect(url).not.toContain("zoom=");
    // A fake page-curl over the corner is charming in a search result and wrong
    // on something the app treats as artwork.
    expect(url).not.toContain("edge=curl");
    // http is dropped silently by a page served over https.
    expect(url?.startsWith("https://")).toBe(true);
  });

  // ── Correctness over coverage ───────────────────────────────────────────

  it("refuses a work cover whose title is a different book", async () => {
    // A fuzzy search that misses returns somebody ELSE'S book. Wearing the
    // wrong cover is worse than wearing none — the argument in tmdbMatch.ts.
    stub({ isbn: false, work: 999, workTitle: "The Song of Achilles" });
    expect(await coverFor(vol())).toBeUndefined();
  });

  it("accepts a work cover differing only by punctuation or an article", async () => {
    stub({ isbn: false, work: 7, workTitle: "the  circe!" });
    expect(await coverFor(vol())).toBe(`${OL_ID}/7-L.jpg`);
  });

  it("has no cover rather than a placeholder when every source misses", async () => {
    // Better than a grey card: the app draws its own "no artwork" state, which
    // is honest, where a placeholder reads as broken.
    stub({ isbn: false, work: null, googleBytes: PLACEHOLDER });
    expect(await coverFor(vol({ imageLinks: { thumbnail: THUMB } }))).toBeUndefined();
  });

  it("skips the ISBN step entirely for a volume without one", async () => {
    const calls = stub({ isbn: false, work: 5 });
    await coverFor(vol({ industryIdentifiers: [] }));
    expect(calls.some((c) => c.includes("/b/isbn/"))).toBe(false);
  });

  it("survives a service that throws", async () => {
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
