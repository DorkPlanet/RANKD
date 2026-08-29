// The matcher decides which cover a book wears, and a wrong one is worse than
// none — a blank says "not found", artwork says "found it" and is believed.
//
// These are the cases the film matcher never has to face: Google Books holds one
// record per EDITION, plus study guides and omnibuses that all carry the exact
// title as a phrase. See the header of lib/bookMatch.ts.

import { describe, expect, it } from "vitest";
import { bestBook } from "@/lib/bookMatch";
import type { Volume } from "@/lib/books";

/** One search hit, with only the fields the matcher reads. */
const vol = (
  id: string,
  title: string,
  opts: {
    subtitle?: string;
    authors?: string[];
    published?: string;
    ratingsCount?: number;
  } = {},
): Volume => ({
  id,
  volumeInfo: {
    title,
    subtitle: opts.subtitle,
    authors: opts.authors,
    publishedDate: opts.published,
    ratingsCount: opts.ratingsCount,
  },
});

describe("bestBook", () => {
  it("takes an exact title", () => {
    const hits = [vol("a", "Dune", { authors: ["Frank Herbert"] })];
    expect(bestBook(hits, "Dune")?.id).toBe("a");
  });

  it("refuses a search with nothing convincing in it", () => {
    // Shares one word and nothing else. The film matcher's own argument: below
    // the bar, no artwork is the honest answer.
    const hits = [vol("a", "The Dune Buggy Handbook", { authors: ["Someone Else"] })];
    expect(bestBook(hits, "Dune", "Frank Herbert")).toBeNull();
  });

  it("returns null for an empty search", () => {
    expect(bestBook([], "Dune")).toBeNull();
  });

  it("skips a hit with no title at all", () => {
    expect(bestBook([{ id: "a", volumeInfo: {} }], "Dune")).toBeNull();
  });

  // ── The cases that made this file necessary ─────────────────────────────

  it("prefers the novel over a study guide with the same title", () => {
    const hits = [
      vol("guide", "Dune", { subtitle: "SparkNotes Literature Guide", authors: ["SparkNotes"] }),
      vol("novel", "Dune", { authors: ["Frank Herbert"] }),
    ];
    expect(bestBook(hits, "Dune", "Frank Herbert")?.id).toBe("novel");
  });

  it("refuses a study guide even when it is the only hit", () => {
    // The important half. Preferring the novel when both are present is easy;
    // the failure that reaches a reader is the search that returns ONLY the
    // guide, which without the companion penalty is a perfect title match.
    const hits = [
      vol("guide", "Dune", { subtitle: "SparkNotes Literature Guide", authors: ["SparkNotes"] }),
    ];
    expect(bestBook(hits, "Dune", "Frank Herbert")).toBeNull();
  });

  it("uses the author to separate two different books of the same name", () => {
    const hits = [
      vol("wrong", "The Trial", { authors: ["Robert Whitlow"] }),
      vol("right", "The Trial", { authors: ["Franz Kafka"] }),
    ];
    expect(bestBook(hits, "The Trial", "Franz Kafka")?.id).toBe("right");
  });

  it("matches an author written surname-first", () => {
    // How a Goodreads export writes them. Normalising word order for every
    // possible form is a losing game; the surname is the stable part.
    const hits = [
      vol("wrong", "The Dispossessed", { authors: ["Some Other Person"] }),
      vol("right", "The Dispossessed", { authors: ["Ursula K. Le Guin"] }),
    ];
    expect(bestBook(hits, "The Dispossessed", "Le Guin, Ursula K.")?.id).toBe("right");
  });

  it("finds the title inside a subtitle", () => {
    const hits = [vol("a", "Dune", { subtitle: "Messiah", authors: ["Frank Herbert"] })];
    expect(bestBook(hits, "Dune Messiah", "Frank Herbert")?.id).toBe("a");
  });

  it("is not diluted by a long subtitle", () => {
    // Concatenating title and subtitle before scoring would make this a quarter
    // match on word overlap, when it is plainly the right book.
    const hits = [
      vol("a", "Dune", {
        subtitle: "Deluxe Edition with a New Foreword by Brian Herbert and Kevin J Anderson",
        authors: ["Frank Herbert"],
      }),
    ];
    expect(bestBook(hits, "Dune", "Frank Herbert")?.id).toBe("a");
  });

  it("does not require an author", () => {
    // An import can carry a title and nothing else, and that still has to work.
    const hits = [vol("a", "Neuromancer", { authors: ["William Gibson"] })];
    expect(bestBook(hits, "Neuromancer")?.id).toBe("a");
  });

  it("does not punish a hit that simply lists no author", () => {
    // An absent author list says nothing. Only a list naming somebody ELSE is
    // evidence against — which is the shape a companion volume has.
    const hits = [vol("a", "Neuromancer")];
    expect(bestBook(hits, "Neuromancer", "William Gibson")?.id).toBe("a");
  });

  it("accepts a reprint decades after first publication", () => {
    // A book has one first publication and then reprints forever, and Google
    // usually returns whichever edition it holds. A distant year is not evidence
    // of anything, unlike a film's release year.
    const hits = [vol("a", "Dune", { authors: ["Frank Herbert"], published: "2005-08-02" })];
    expect(bestBook(hits, "Dune", "Frank Herbert", "1965")?.id).toBe("a");
  });

  it("breaks a tie between two editions by how many people hold them", () => {
    const hits = [
      vol("obscure", "Dune", { authors: ["Frank Herbert"], ratingsCount: 2 }),
      vol("canonical", "Dune", { authors: ["Frank Herbert"], ratingsCount: 40000 }),
    ];
    expect(bestBook(hits, "Dune", "Frank Herbert")?.id).toBe("canonical");
  });

  it("tolerates punctuation and accents on both sides", () => {
    const hits = [vol("a", "Slaughterhouse-Five", { authors: ["Kurt Vonnegut"] })];
    expect(bestBook(hits, "Slaughterhouse Five", "Kurt Vonnegut")?.id).toBe("a");
  });
});
