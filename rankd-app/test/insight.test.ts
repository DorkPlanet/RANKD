import { describe, expect, it } from "vitest";

import { insightsFor, pickInsight, type InsightFilm } from "@/lib/insight";
import type { RankSubject } from "@/lib/subject";
import type { Rating } from "@/lib/tiers";

// These lines get printed on a picture the user sends to other people, so the
// thing worth testing hardest is not that a claim appears — it's that a claim
// the data can't support NEVER appears.

const nolan: RankSubject = { kind: "director", name: "Christopher Nolan" };

const film = (over: Partial<InsightFilm> = {}): InsightFilm => ({
  title: "A Film",
  year: "2010",
  rating: 4 as Rating,
  genres: ["Thriller"],
  ...over,
});

const many = (n: number, over: Partial<InsightFilm> = {}) =>
  Array.from({ length: n }, (_, i) => film({ title: `Film ${i}`, ...over }));

const ids = (fs: InsightFilm[]) => insightsFor(fs, nolan).map((i) => i.id);

describe("claims the data cannot support", () => {
  it("says nothing at all about an empty ranking", () => {
    expect(insightsFor([], nolan)).toEqual([]);
  });

  it("makes no rating claim from fewer than four rated films", () => {
    expect(ids(many(3))).not.toContain("average");
  });

  it("makes no genre claim when the genre is a minority", () => {
    // Two thrillers in a list of ten clears the count but not the share.
    const fs = [...many(2, { genres: ["Thriller"] }), ...many(8, { genres: ["Drama"] })];
    expect(insightsFor(fs, nolan).find((i) => i.id === "genre-top")?.text).toContain("drama");
  });

  it("makes no genre claim when most films have no genres at all", () => {
    // Three thrillers would qualify on their own, but they are three of ten —
    // the other seven simply have not had their artwork fetched yet, and
    // "your favourite genre" must not mean "of the ones I happen to know".
    const fs = [...many(3, { genres: ["Thriller"] }), ...many(7, { genres: undefined })];
    expect(ids(fs)).not.toContain("genre-top");
  });

  // The count-based version of this rule ("one genre must double the other")
  // was replaced by a position-based one, because how OFTEN a genre appears is
  // a fact about the director and where it LANDS is a fact about you. The
  // replacement lives in the next describe block.

  it("never counts a borrowed film's seed rating as an opinion", () => {
    // Eight 5-star films you've seen, four unseen guests seeded at 3.
    const fs = [...many(8, { rating: 5 as Rating }), ...many(4, { rating: 3 as Rating, guest: true })];
    const avg = insightsFor(fs, nolan).find((i) => i.id === "average");
    expect(avg?.text).toContain("5.0★");
  });
});

describe("what a head-to-head ranking can say and nothing else can", () => {
  it("notices when the winner is not your highest-rated film", () => {
    const fs = [film({ rating: 3 as Rating }), ...many(4, { rating: 5 as Rating })];
    expect(ids(fs)).toContain("upset-winner");
  });

  it("says nothing about an upset when the winner IS the highest rated", () => {
    const fs = [film({ rating: 5 as Rating }), ...many(4, { rating: 3 as Rating })];
    expect(ids(fs)).not.toContain("upset-winner");
  });

  it("notices when every film shares a star rating, so the order was all duels", () => {
    expect(ids(many(6, { rating: 4 as Rating }))).toContain("flat");
  });

  it("counts guests by POSITION, not by presence", () => {
    // A guest at the bottom is trivia; the claim is about beating seen films.
    const bottom = [...many(4, {}), film({ guest: true, rating: undefined })];
    expect(ids(bottom)).not.toContain("guest-above");
    const top = [film({ guest: true, rating: undefined }), ...many(4, {})];
    expect(ids(top)).toContain("guest-above");
  });

  it("calls out an unseen film winning outright", () => {
    const fs = [film({ guest: true, rating: undefined }), ...many(4, {})];
    expect(ids(fs)).toContain("guest-winner");
  });

  it("ranks the surprising claim above the mundane one", () => {
    const fs = [film({ rating: 3 as Rating }), ...many(6, { rating: 5 as Rating })];
    const all = insightsFor(fs, nolan);
    expect(all[0].id).toBe("upset-winner");
    expect(all[0].weight).toBeGreaterThan(all[all.length - 1].weight);
  });

  // "10 of these 19 are drama" was the first thing the card ever said, and it
  // is the weakest thing it can say: most directors have a genre, so naming it
  // reports the obvious back. It stays available, but nothing else may lose to it.
  it("ranks a bare genre count last, below even the average", () => {
    const fs = many(8, { rating: 4 as Rating, genres: ["Drama"] });
    const all = insightsFor(fs, nolan);
    const genre = all.find((i) => i.id === "genre-top")!;
    const average = all.find((i) => i.id === "average")!;
    expect(genre.weight).toBeLessThan(average.weight);
    expect(all[all.length - 1].id).toBe("genre-top");
  });

  it("prefers where a genre LANDS over how often it appears", () => {
    // Sci-fi fills the top, history fills the bottom — a fact about the order.
    const fs = [
      ...many(4, { genres: ["Sci-Fi"] }),
      ...many(4, { genres: ["History"] }),
    ];
    const all = insightsFor(fs, nolan);
    const versus = all.find((i) => i.id === "genre-versus");
    expect(versus?.text).toContain("sci-fi");
    expect(versus!.weight).toBeGreaterThan(all.find((i) => i.id === "genre-top")!.weight);
  });

  it("makes no favours-one-over-another claim when both are spread evenly", () => {
    // Alternating: neither genre sits meaningfully higher than the other.
    const fs = Array.from({ length: 8 }, (_, i) =>
      film({ genres: [i % 2 ? "Sci-Fi" : "History"] }),
    );
    expect(ids(fs)).not.toContain("genre-versus");
  });

  it("says how much of a director's work you've actually seen", () => {
    const fs = [...many(3, {}), ...many(9, { guest: true, rating: undefined })];
    expect(insightsFor(fs, nolan).find((i) => i.id === "coverage")?.text).toBe(
      "You've seen 3 of Christopher Nolan's 12 films.",
    );
  });
});

describe("choosing one line", () => {
  it("is stable for the same ranking, so preview and download agree", () => {
    const fs = many(8, { rating: 4 as Rating });
    const a = pickInsight(fs, nolan, "list-1");
    const b = pickInsight(fs, nolan, "list-1");
    expect(a).toBe(b);
    expect(a).toBeTruthy();
  });

  it("returns nothing rather than filler when nothing qualifies", () => {
    expect(pickInsight([film()], nolan, "list-1")).toBeUndefined();
  });

  it("never picks a weak claim when a strong one is available", () => {
    const fs = [film({ rating: 3 as Rating }), ...many(6, { rating: 5 as Rating })];
    // Whatever the seed, "you average 4.7★" must never beat the upset.
    const picked = new Set(
      Array.from({ length: 50 }, (_, i) => pickInsight(fs, nolan, `seed-${i}`)),
    );
    expect([...picked].every((t) => !t?.includes("average"))).toBe(true);
  });
});
