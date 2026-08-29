// Choosing a cover by hand, and making it stick.
//
// Two halves that fail differently. `coverCandidates` builds the list, and its
// risk is showing somebody ELSE'S book to pick from. `pinnedArt` is what stops
// the credits sweep quietly reverting the choice a minute later — the failure
// `pinnedMeta` exists to prevent, one field down.

import { afterEach, describe, expect, it, vi } from "vitest";
import { coverCandidates } from "@/lib/books";
import { withMeta } from "@/lib/meta";
import type { Film } from "@/lib/types";

afterEach(() => {
  vi.unstubAllGlobals();
});

const BY_ID = "https://covers.openlibrary.org/b/id";
const BY_OLID = "https://covers.openlibrary.org/b/olid";

/**
 * `docs` is what the work search returns; `editionsWithArt` names the edition
 * keys whose cover actually resolves, so a test can say "8 editions, 3 have art".
 */
function stub(
  docs: { cover_i?: number; title?: string; edition_key?: string[] }[],
  editionsWithArt: string[] = [],
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string, init?: { method?: string }) => {
      const u = String(url);
      if (u.startsWith("https://openlibrary.org/search.json")) {
        return { ok: true, status: 200, json: async () => ({ docs }) };
      }
      if (u.startsWith(BY_OLID)) {
        const key = u.slice(BY_OLID.length + 1).split("-")[0];
        const has = editionsWithArt.includes(key);
        return { ok: has, status: has ? 200 : 404 };
      }
      return { ok: false, status: 404 };
    }),
  );
}

describe("coverCandidates", () => {
  it("returns one cover per matching work", async () => {
    stub([
      { cover_i: 1, title: "Dune", edition_key: [] },
      { cover_i: 2, title: "Dune", edition_key: [] },
    ]);
    expect(await coverCandidates("Dune", "Frank Herbert")).toEqual([
      `${BY_ID}/1-L.jpg`,
      `${BY_ID}/2-L.jpg`,
    ]);
  });

  it("adds the editions of the best match that actually have artwork", async () => {
    // Where the variety comes from for a book with one work entry: Circe
    // returned six usable covers this way and one from the search.
    stub(
      [{ cover_i: 9, title: "Circe", edition_key: ["OL1M", "OL2M", "OL3M"] }],
      ["OL1M", "OL3M"],
    );
    const out = await coverCandidates("Circe", "Madeline Miller");
    expect(out).toContain(`${BY_ID}/9-L.jpg`);
    expect(out).toContain(`${BY_OLID}/OL1M-L.jpg?default=false`);
    expect(out).toContain(`${BY_OLID}/OL3M-L.jpg?default=false`);
    // The one with no artwork must not be offered — it renders as a blank.
    expect(out).not.toContain(`${BY_OLID}/OL2M-L.jpg?default=false`);
  });

  it("asks Open Library with default=false so a gap is a 404, not a blank", async () => {
    stub([{ cover_i: 1, title: "Circe", edition_key: ["OL1M"] }], ["OL1M"]);
    const out = await coverCandidates("Circe");
    expect(out.some((u) => u.includes("default=false"))).toBe(true);
  });

  it("refuses works whose title is a different book", async () => {
    // A picker full of the wrong book's covers is worse than an empty one,
    // because somebody would choose from it.
    stub([
      { cover_i: 1, title: "The Song of Achilles", edition_key: ["OL9M"] },
      { cover_i: 2, title: "Circe", edition_key: [] },
    ]);
    expect(await coverCandidates("Circe")).toEqual([`${BY_ID}/2-L.jpg`]);
  });

  it("takes editions only from the best match, not from every work", async () => {
    // Walking every work's editions is dozens of requests for a sheet somebody
    // opened to glance at.
    stub(
      [
        { cover_i: 1, title: "Dune", edition_key: ["OL1M"] },
        { cover_i: 2, title: "Dune", edition_key: ["OL2M"] },
      ],
      ["OL1M", "OL2M"],
    );
    const out = await coverCandidates("Dune");
    expect(out).toContain(`${BY_OLID}/OL1M-L.jpg?default=false`);
    expect(out).not.toContain(`${BY_OLID}/OL2M-L.jpg?default=false`);
  });

  it("never repeats the same cover", async () => {
    stub([
      { cover_i: 5, title: "Dune", edition_key: [] },
      { cover_i: 5, title: "Dune", edition_key: [] },
    ]);
    expect(await coverCandidates("Dune")).toEqual([`${BY_ID}/5-L.jpg`]);
  });

  it("honours the cap", async () => {
    stub(
      Array.from({ length: 5 }, (_, i) => ({ cover_i: i + 1, title: "Dune", edition_key: [] })),
    );
    expect(await coverCandidates("Dune", undefined, 3)).toHaveLength(3);
  });

  it("is empty rather than throwing when the search fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(coverCandidates("Dune")).resolves.toEqual([]);
  });

  it("is empty when Open Library knows the book but holds no artwork", async () => {
    stub([{ title: "Obscure", edition_key: [] }]);
    expect(await coverCandidates("Obscure")).toEqual([]);
  });
});

describe("pinnedArt", () => {
  const chosen: Film = {
    id: "circe-2018",
    title: "Circe",
    rating: 5,
    score: 50,
    poster: `${BY_ID}/chosen-L.jpg`,
    pinnedArt: true,
  };

  it("survives a sweep that would otherwise replace the artwork", async () => {
    // The whole point. Without it the next backfill writes `coverFor`'s answer
    // over the top — which is exactly the cover the reader rejected — and they
    // watch their choice revert with no idea why.
    const out = withMeta(chosen, { poster: `${BY_ID}/auto-L.jpg`, genres: ["Fiction"] });
    expect(out.poster).toBe(`${BY_ID}/chosen-L.jpg`);
  });

  it("still lets everything else through", async () => {
    // It pins ONE field. A chosen cover is not a statement that the record is
    // finished, so the book must still learn its pages and its categories.
    const out = withMeta(chosen, {
      poster: `${BY_ID}/auto-L.jpg`,
      genres: ["Fiction"],
      runtime: 393,
      bookId: "abc",
    });
    expect(out).toMatchObject({ genres: ["Fiction"], runtime: 393, bookId: "abc" });
  });

  it("is cleared by a match correction, because that is a different book", async () => {
    const out = withMeta(chosen, { poster: `${BY_ID}/other-L.jpg`, bookId: "xyz" }, true);
    expect(out.pinnedArt).toBe(false);
    expect(out.poster).toBe(`${BY_ID}/other-L.jpg`);
  });

  it("leaves an unpinned record taking the fetched artwork as before", async () => {
    const plain: Film = { id: "x", title: "X", rating: 4, score: 40 };
    expect(withMeta(plain, { poster: `${BY_ID}/auto-L.jpg` }).poster).toBe(
      `${BY_ID}/auto-L.jpg`,
    );
  });
});
