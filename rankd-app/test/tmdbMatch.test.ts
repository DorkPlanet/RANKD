import { describe, expect, it } from "vitest";

import { bestMatch, normalise, type Candidate } from "@/lib/tmdbMatch";

const c = (id: number, title: string, release_date?: string, popularity = 1): Candidate => ({
  id,
  title,
  release_date,
  popularity,
});

describe("normalise", () => {
  it("ignores case, punctuation and the leading article", () => {
    expect(normalise("The Thing")).toBe("thing");
    expect(normalise("WALL·E")).toBe("wall e");
    expect(normalise("Amélie")).toBe("amelie");
    expect(normalise("Dungeons & Dragons")).toBe("dungeons and dragons");
  });
});

describe("bestMatch", () => {
  it("takes the exact title over a more popular near-miss", () => {
    const hit = bestMatch(
      [c(1, "Good Times", "2015", 900), c(2, "Good Time", "2017", 5)],
      "Good Time",
      "2017",
    );
    expect(hit?.id).toBe(2);
  });

  // The bug the user hit: a niche film TMDb does not hold came back as whatever
  // popular title happened to share a word with it.
  it("returns nothing rather than a stranger that shares one word", () => {
    const hit = bestMatch(
      [c(1, "The Dark Knight", "2008", 800), c(2, "Knight and Day", "2010", 400)],
      "Knightriders",
      "1981",
    );
    expect(hit).toBeNull();
  });

  it("refuses an empty result set", () => {
    expect(bestMatch([], "Anything", "1999")).toBeNull();
  });

  it("separates a remake from the original by year", () => {
    const results = [c(1, "Dawn of the Dead", "2004", 50), c(2, "Dawn of the Dead", "1978", 40)];
    expect(bestMatch(results, "Dawn of the Dead", "1978")?.id).toBe(2);
    expect(bestMatch(results, "Dawn of the Dead", "2004")?.id).toBe(1);
  });

  it("still matches when the year is a little off", () => {
    // A festival run one side of the release date is ordinary, and used to make
    // the search return nothing at all when the year was sent as a filter.
    expect(bestMatch([c(1, "Hereditary", "2018")], "Hereditary", "2017")?.id).toBe(1);
  });

  it("matches on the original title when the English one differs", () => {
    const hit = bestMatch(
      [{ id: 7, title: "Spirited Away", original_title: "千と千尋の神隠し", release_date: "2001" }],
      "Spirited Away",
      "2001",
    );
    expect(hit?.id).toBe(7);
  });

  it("tolerates a subtitle the library does not carry", () => {
    expect(bestMatch([c(1, "Alien: Resurrection", "1997")], "Alien Resurrection", "1997")?.id).toBe(1);
  });

  it("works with no year at all", () => {
    expect(bestMatch([c(1, "Solaris", "1972"), c(2, "Solaris", "2002")], "Solaris", null)).not.toBeNull();
  });
});
