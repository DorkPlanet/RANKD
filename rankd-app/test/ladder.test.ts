import { describe, expect, it } from "vitest";

import {
  choose,
  confirm,
  completePromotion,
  flickToBottom,
  flickToTop,
  getPair,
  overallRank,
  pendingConfirm,
  promoteDirect,
  promotionTarget,
  promotionWon,
  rankedFilms,
  skipPair,
  skipToFilm,
  startPromotionDuel,
  startRun,
  stepBackFromConfirm,
} from "@/lib/ladder";
import { tierMax, tierMid, tierMin, type Rating } from "@/lib/tiers";
import type { Film, RankState } from "@/lib/types";

// The engine has been reworked three times and never had a test. These are the
// invariants each rework had to preserve — written as behaviour, so a fourth
// rework is free to change how any of it works and still be checked.

const film = (id: string, rating: Rating = 4, score = tierMid(rating)): Film => ({
  id,
  title: id.toUpperCase(),
  rating,
  score,
});

/** A tier of n films, best first, evenly spread across its band. */
const tier = (n: number, rating: Rating = 4): Film[] =>
  Array.from({ length: n }, (_, i) =>
    film(`f${i}`, rating, Math.round(tierMax(rating) - (i / Math.max(1, n - 1)) * (tierMax(rating) - tierMin(rating)))),
  );

const ids = (fs: Film[]) => fs.map((f) => f.id);
const contender = (s: RankState) => s.session!.contenderId;
const challenger = (s: RankState) => s.session!.challengerId;

/** Answer a duel in favour of whichever side the caller names. */
const win = (s: RankState, who: "contender" | "challenger") =>
  choose(s, who === "contender" ? contender(s) : challenger(s));

describe("startRun", () => {
  it("refuses a pool too small to duel", () => {
    expect(() => startRun([film("a")], 4)).toThrow();
    expect(() => startRun([], 4)).toThrow();
  });

  it("starts the climb at the bottom of the pile, facing the film above", () => {
    const s = startRun(tier(5), 4);
    expect(contender(s)).toBe("f4"); // worst-scored
    expect(challenger(s)).toBe("f3");
  });

  it("draws only from the requested tier unless reach is asked for", () => {
    const films = [...tier(3, 4), ...tier(3, 3)];
    const narrow = startRun(films, 4);
    expect(narrow.session!.unconfirmed).toHaveLength(3);
    const wide = startRun(films, 4, { below: 1 });
    expect(wide.session!.unconfirmed).toHaveLength(6);
  });

  it("begins with an empty journal — starting a run is not evidence", () => {
    expect(startRun(tier(5), 4).journal).toEqual([]);
  });
});

describe("the climb", () => {
  it("moves the winner up and keeps it climbing", () => {
    let s = startRun(tier(5), 4);
    const climber = contender(s);
    s = win(s, "contender");
    expect(contender(s)).toBe(climber); // still climbing
    expect(s.session!.unconfirmed.indexOf(climber)).toBe(3); // moved up one
  });

  it("hands the climb to whoever wins — the running best sweeps up", () => {
    let s = startRun(tier(5), 4);
    const beater = challenger(s);
    s = win(s, "challenger");
    expect(contender(s)).toBe(beater);
  });

  it("asks to confirm once someone reaches the top", () => {
    let s = startRun(tier(3), 4);
    while (getPair(s)) s = win(s, "contender");
    expect(s.session!.needsConfirm).toBe(true);
    expect(pendingConfirm(s)!.id).toBe("f2");
  });

  it("takes exactly one duel per rival to crown a champion", () => {
    let s = startRun(tier(6), 4);
    let duels = 0;
    while (getPair(s)) {
      s = win(s, "contender");
      duels++;
    }
    expect(duels).toBe(5); // n - 1
  });
});

describe("confirm", () => {
  it("locks the champion and restarts the climb from the bottom", () => {
    let s = startRun(tier(4), 4);
    while (getPair(s)) s = win(s, "contender");
    s = confirm(s);
    expect(s.session!.confirmed).toEqual(["f3"]);
    expect(s.films.find((f) => f.id === "f3")!.lock).toBe("hard");
    expect(contender(s)).toBe(s.session!.unconfirmed[s.session!.unconfirmed.length - 1]);
  });

  it("ends the session when the tier is fully placed", () => {
    let s = startRun(tier(3), 4);
    for (let i = 0; i < 3; i++) {
      while (getPair(s)) s = win(s, "contender");
      s = confirm(s);
      if (!s.session) break;
    }
    expect(s.session).toBeNull();
    expect(s.films.every((f) => f.lock === "hard")).toBe(true);
  });

  it("does nothing when nothing is awaiting confirmation", () => {
    const s = startRun(tier(4), 4);
    expect(confirm(s)).toBe(s);
  });

  it("writes scores inside the tier's own band", () => {
    let s = startRun(tier(5), 4);
    while (getPair(s)) s = win(s, "contender");
    s = confirm(s);
    for (const f of s.films) {
      expect(f.score).toBeGreaterThanOrEqual(tierMin(4));
      expect(f.score).toBeLessThanOrEqual(tierMax(4));
    }
  });

  // The bug this guards: a cross-tier run spread over one band would silently
  // hand a 3.5★ film a 4★ score and corrupt the master order.
  it("keeps every rating in its own band during a cross-tier run", () => {
    let s = startRun([...tier(3, 4), ...tier(3, 3.5)], 4, { below: 0.5 });
    while (getPair(s)) s = win(s, "contender");
    s = confirm(s);
    for (const f of s.films) {
      expect(f.score).toBeGreaterThanOrEqual(tierMin(f.rating));
      expect(f.score).toBeLessThanOrEqual(tierMax(f.rating));
    }
  });

  it("leaves the master order tier-correct — every 4★ above every 3.5★", () => {
    let s = startRun([...tier(3, 4), ...tier(3, 3.5)], 4, { below: 0.5 });
    while (getPair(s)) s = win(s, "contender");
    s = confirm(s);
    const order = rankedFilms(s.films);
    const lastFour = order.map((f) => f.rating).lastIndexOf(4);
    const firstLower = order.findIndex((f) => f.rating === 3.5);
    expect(lastFour).toBeLessThan(firstLower);
  });
});

describe("the evidence journal", () => {
  it("records exactly one judgement per duel", () => {
    let s = startRun(tier(5), 4);
    s = win(s, "contender");
    s = win(s, "contender");
    expect(s.journal).toHaveLength(2);
  });

  it("names the contender first and the challenger second, whoever won", () => {
    const s0 = startRun(tier(5), 4);
    const a = contender(s0);
    const b = challenger(s0);
    expect(win(s0, "contender").journal[0]).toMatchObject({ a, b, o: "a" });
    expect(win(s0, "challenger").journal[0]).toMatchObject({ a, b, o: "b" });
  });

  it("stamps the mode the duel was fought in", () => {
    expect(win(startRun(tier(5), 4), "contender").journal[0].m).toBe("koth");
  });

  // Assertions are the user supplying an ordering directly, not answering a
  // question — so they must leave no evidence behind.
  it("records nothing for a flick, a sink or a scrub", () => {
    const s = startRun(tier(5), 4);
    expect(flickToTop(s, "f4").journal).toHaveLength(0);
    expect(flickToBottom(s, "f0").journal).toHaveLength(0);
    expect(skipToFilm(s, "f1").journal).toHaveLength(0);
  });

  it("keeps the judgements when a run is abandoned mid-climb", () => {
    let s = startRun(tier(6), 4);
    s = win(s, "contender");
    // What `endRun` does: drop the session, keep everything already judged.
    expect({ ...s, session: null }.journal).toHaveLength(1);
  });

  it("carries them through a confirm", () => {
    let s = startRun(tier(3), 4);
    while (getPair(s)) s = win(s, "contender");
    expect(confirm(s).journal).toHaveLength(2);
  });
});

describe("skip — too close to call", () => {
  it("records a draw, never a winner", () => {
    expect(skipPair(startRun(tier(5), 4)).journal[0].o).toBe("draw");
  });

  it("places like a loss in a climb — 'not above' is all it licenses", () => {
    const s0 = startRun(tier(5), 4);
    const was = contender(s0);
    const opponent = challenger(s0);
    const s = skipPair(s0);
    expect(contender(s)).toBe(opponent); // the other film carries the climb
    const order = s.session!.unconfirmed;
    expect(order.indexOf(was)).toBeGreaterThan(order.indexOf(opponent));
  });
});

describe("assertions — the fatigue shortcuts", () => {
  it("sends a film to the top and hands the climb on", () => {
    const s = flickToTop(startRun(tier(5), 4), "f4");
    expect(s.session!.unconfirmed[0]).toBe("f4");
    expect(contender(s)).not.toBe("f4"); // never dropped straight into a confirm
  });

  it("sends a film to the bottom", () => {
    const s = flickToBottom(startRun(tier(5), 4), "f0");
    expect(s.session!.unconfirmed.at(-1)).toBe("f0");
  });

  it("only aims a scrub — the pile holds still while you look around", () => {
    const s0 = startRun(tier(6), 4);
    const s = skipToFilm(s0, "f1");
    expect(challenger(s)).toBe("f1");
    expect(s.session!.unconfirmed).toEqual(s0.session!.unconfirmed);
  });

  it("ignores an unknown film", () => {
    const s = startRun(tier(5), 4);
    expect(flickToTop(s, "ghost")).toBe(s);
    expect(skipToFilm(s, "ghost")).toBe(s);
  });
});

describe("stepping back from a confirm", () => {
  it("drops the champion one place so it has to win its way back", () => {
    let s = startRun(tier(4), 4);
    while (getPair(s)) s = win(s, "contender");
    const champ = contender(s);
    s = stepBackFromConfirm(s);
    expect(s.session!.needsConfirm).toBe(false);
    expect(s.session!.unconfirmed[1]).toBe(champ);
  });

  it("commits nothing", () => {
    let s = startRun(tier(4), 4);
    while (getPair(s)) s = win(s, "contender");
    expect(stepBackFromConfirm(s).films.some((f) => f.lock)).toBe(false);
  });
});

describe("promotion — the only way a star rating ever changes", () => {
  // Four 4★ films with three 4.5★ above them. `tier` names its films f0..fn, so
  // both tiers reuse the same ids — the higher tier is built separately and
  // renamed so a run can tell them apart.
  const upper = () => tier(3, 4.5).map((f, i) => ({ ...f, id: `u${i}`, title: `U${i}` }));
  const twoTiers = () => [...tier(4, 4), ...upper()];

  /** Climb a 4★ run until the first film tops the whole tier. */
  const topTheTier = (films: Film[] = twoTiers()) => {
    let s = startRun(films, 4);
    while (getPair(s)) s = win(s, "contender");
    return s;
  };

  it("is offered to a film that has just beaten its entire tier", () => {
    expect(promotionTarget(topTheTier())).toBe(4.5);
  });

  // The heart of moving this onto King of the Hill: it must fire once, not on
  // every confirm. #2 has beaten what was left, which is not the same claim.
  it("is not offered again on the second confirm", () => {
    let s = confirm(topTheTier());
    while (getPair(s)) s = win(s, "contender");
    expect(s.session!.needsConfirm).toBe(true);
    expect(promotionTarget(s)).toBeUndefined();
  });

  // Topping the upper third of a Rough Cut is a real achievement and a
  // different one. `only` is how such a pile is run.
  it("is not offered to a film that only topped part of its tier", () => {
    let s = startRun(twoTiers(), 4, { only: ["f0", "f1"] });
    while (getPair(s)) s = win(s, "contender");
    expect(s.session!.needsConfirm).toBe(true);
    expect(promotionTarget(s)).toBeUndefined();
  });

  it("is not offered when there is no tier above to take on", () => {
    expect(promotionTarget(topTheTier(tier(4, 4)))).toBeUndefined();
  });

  it("is not offered in a cross-tier run, which may not write a rating", () => {
    let s = startRun(twoTiers(), 4, { only: ["f0", "f1", "f2", "f3"], crossTier: true });
    while (getPair(s)) s = win(s, "contender");
    expect(promotionTarget(s)).toBeUndefined();
  });

  it("banks a won promotion between the films it beat and those it didn't", () => {
    let s = startPromotionDuel(topTheTier());
    const subjectId = s.session!.contenderId;
    while (getPair(s)) s = win(s, "contender");
    expect(promotionWon(s)).toBe(true);
    s = completePromotion(s);
    const subject = s.films.find((f) => f.id === subjectId)!;
    expect(subject.rating).toBe(4.5);
    expect(subject.score).toBeGreaterThanOrEqual(tierMin(4.5));
    expect(subject.score).toBeLessThanOrEqual(tierMax(4.5));
    expect(subject.lock).toBe("hard");
  });

  it("stamps promotion duels as their own kind of evidence", () => {
    let s = topTheTier();
    const before = s.journal.length;
    s = startPromotionDuel(s);
    s = win(s, "contender");
    expect(s.journal[before].m).toBe("promotion");
  });

  it("lets a promotion be asserted outright, entering at the foot of the new tier", () => {
    const s0 = topTheTier();
    const subjectId = s0.session!.contenderId;
    const s = promoteDirect(s0);
    const subject = s.films.find((f) => f.id === subjectId)!;
    expect(subject.rating).toBe(4.5);
    expect(subject.score).toBe(tierMin(4.5));
  });

  // ── The three that only matter now promotion hangs off a long climb ────────

  it("hands the interrupted climb back when the promotion is won", () => {
    let s = startPromotionDuel(topTheTier());
    const subjectId = s.session!.contenderId;
    while (getPair(s)) s = win(s, "contender");
    s = completePromotion(s);
    expect(s.session).not.toBeNull();
    expect(s.session!.tier).toBe(4);
    // The promoted film has left the tier, so it must not still be in the pile.
    expect(s.session!.unconfirmed).not.toContain(subjectId);
    expect(s.session!.promotionQueue).toBeUndefined();
  });

  // The old code returned without handing the climb on and called that "ending
  // the run". It was not: `refresh` aimed the subject straight back at the film
  // that had just beaten it, so the same duel was served forever. The old test
  // asserted only `promotionWon === false`, which an infinite rematch satisfies.
  it("really ends the attempt when the subject loses, rather than re-fighting", () => {
    const before = topTheTier();
    const subjectId = before.session!.contenderId;
    let s = startPromotionDuel(before);
    const firstOpponent = s.session!.challengerId;
    s = win(s, "challenger");

    expect(promotionWon(s)).toBe(false);
    expect(s.session!.promotionQueue).toBeUndefined();
    // Back on the 4★ climb, at the confirm it had already earned.
    expect(s.session!.tier).toBe(4);
    expect(s.session!.needsConfirm).toBe(true);
    expect(s.session!.contenderId).toBe(subjectId);
    // And emphatically not still pointed at the film that beat it.
    expect(s.session!.challengerId).not.toBe(firstOpponent);
  });

  it("keeps the rating unchanged when the attempt is lost", () => {
    const before = topTheTier();
    const subjectId = before.session!.contenderId;
    const s = win(startPromotionDuel(before), "challenger");
    expect(s.films.find((f) => f.id === subjectId)!.rating).toBe(4);
  });

  it("keeps the duels it lost — an attempt that failed still happened", () => {
    const before = topTheTier();
    const n = before.journal.length;
    const s = win(startPromotionDuel(before), "challenger");
    expect(s.journal).toHaveLength(n + 1);
  });
});

describe("reading the ranking", () => {
  it("orders best first by score", () => {
    expect(ids(rankedFilms([film("low", 4, 7100), film("high", 4, 7900)]))).toEqual(["high", "low"]);
  });

  it("gives a 1-indexed overall rank", () => {
    const films = [film("a", 4, 7900), film("b", 4, 7500)];
    expect(overallRank(films, "a")).toBe(1);
    expect(overallRank(films, "b")).toBe(2);
  });

  it("has no pair to show while a confirm is pending", () => {
    let s = startRun(tier(3), 4);
    while (getPair(s)) s = win(s, "contender");
    expect(getPair(s)).toBeNull();
    expect(pendingConfirm(s)).not.toBeNull();
  });
});

// ── An arbitrary pile, and a run that may not write positions ──────────────
//
// A person's filmography is not a tier: it spans star ratings, and its order is
// an answer to "what do I think of this director", not a claim about where any
// of those films sit among their 4★ peers. So the pile comes in as an explicit
// set, and confirming it must leave `score` and `lock` untouched — the whole
// premise of lib/people.ts is that the cross-tier order is stored nowhere but
// the run's own `confirmed` array.

describe("a run over an arbitrary set of films", () => {
  const mixed = (): Film[] => [
    film("five", 5, tierMid(5)),
    film("four", 4, tierMid(4)),
    film("three", 3, tierMid(3)),
    film("stranger", 4, tierMid(4)), // in the library, not in the run
  ];

  it("takes exactly the films it was given, ignoring tier", () => {
    const s = startRun(mixed(), 4, { only: ["three", "five", "four"] });
    expect([...s.session!.unconfirmed].sort()).toEqual(["five", "four", "three"]);
  });

  it("keeps the caller's order rather than re-sorting by score", () => {
    // Score order would be five, four, three — the tier blocks the caller is
    // deliberately overriding.
    const s = startRun(mixed(), 4, { only: ["three", "five", "four"] });
    expect(s.session!.unconfirmed).toEqual(["three", "five", "four"]);
  });

  it("ignores ids the library doesn't hold rather than piling up phantoms", () => {
    const s = startRun(mixed(), 4, { only: ["five", "ghost", "four"] });
    expect(s.session!.unconfirmed).toEqual(["five", "four"]);
  });

  it("still refuses a pile too small to duel", () => {
    expect(() => startRun(mixed(), 4, { only: ["five"] })).toThrow();
    expect(() => startRun(mixed(), 4, { only: ["ghost", "phantom"] })).toThrow();
  });

  it("climbs from the bottom of the given order, as any run does", () => {
    const s = startRun(mixed(), 4, { only: ["three", "five", "four"] });
    expect(contender(s)).toBe("four"); // last given = bottom of the pile
    expect(challenger(s)).toBe("five");
  });
});

describe("a cross-tier run", () => {
  const mixed = (): Film[] => [film("five", 5, tierMid(5)), film("four", 4, tierMid(4)), film("three", 3, tierMid(3))];
  const crossRun = () => startRun(mixed(), 4, { only: ["five", "four", "three"], crossTier: true });

  it("writes no score when a film is confirmed", () => {
    const before = new Map(mixed().map((f) => [f.id, f.score]));
    let s = crossRun();
    while (getPair(s)) s = win(s, "contender");
    s = confirm(s);
    for (const f of s.films) expect(f.score).toBe(before.get(f.id));
  });

  it("writes no lock when a film is confirmed", () => {
    let s = crossRun();
    while (getPair(s)) s = win(s, "contender");
    s = confirm(s);
    expect(s.films.every((f) => f.lock === undefined)).toBe(true);
  });

  it("leaves the master ranking exactly as it found it", () => {
    let s = crossRun();
    const before = ids(rankedFilms(s.films));
    // Play the whole thing out, upsets and all.
    while (s.session) {
      s = pendingConfirm(s) ? confirm(s) : win(s, "contender");
    }
    expect(ids(rankedFilms(s.films))).toEqual(before);
  });

  it("still produces the order, in `confirmed`", () => {
    // The bottom film wins everything, so it should finish first.
    let s = crossRun();
    const order: string[] = [];
    while (s.session) {
      if (pendingConfirm(s)) {
        order.push(pendingConfirm(s)!.id);
        s = confirm(s);
      } else {
        s = win(s, "contender");
      }
    }
    expect(order).toEqual(["three", "four", "five"]);
  });

  // The run that leaves no trace. Everywhere else in the app the log always
  // records — a person run is the deliberate exception, because it is a list you
  // build to share rather than a claim about your library, and its pile can hold
  // films you have never seen.
  it("writes no evidence row for a duel", () => {
    let s = crossRun();
    s = win(s, "contender");
    expect(s.journal).toHaveLength(0);
  });

  it("writes no evidence rows for a draw either", () => {
    let s = crossRun();
    s = skipPair(s);
    expect(s.journal).toHaveLength(0);
  });

  it("counts no duels on the films that fought", () => {
    let s = crossRun();
    s = win(s, "contender");
    expect(s.films.every((f) => f.duels === undefined)).toBe(true);
  });

  it("leaves nothing behind after a whole run, not just one duel", () => {
    let s = crossRun();
    while (s.session) s = pendingConfirm(s) ? confirm(s) : win(s, "contender");
    expect(s.journal).toHaveLength(0);
    expect(s.films.every((f) => f.duels === undefined && f.lock === undefined)).toBe(true);
  });

  it("does not silence an ordinary run, which still records", () => {
    let s = startRun(tier(3), 4);
    s = win(s, "contender");
    expect(s.journal).toHaveLength(1);
    expect(s.films.filter((f) => (f.duels ?? 0) > 0)).toHaveLength(2);
  });

  it("does not infect an ordinary run, which still writes positions", () => {
    let s = startRun(tier(3), 4);
    while (getPair(s)) s = win(s, "contender");
    s = confirm(s);
    expect(s.films.some((f) => f.lock === "hard")).toBe(true);
  });
});
