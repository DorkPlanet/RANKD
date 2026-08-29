// A climb that spans tiers gets to correct the ratings it spanned.
//
// King of the Hill can reach either side of its tier, so its pile deliberately
// mixes ratings — and until now the answer was thrown away. `writeScores` groups
// by rating and writes each film inside its OWN band, so a 3★ that beat every
// 4★ went back to being the best of the 3★s, below all of them.
//
// The rule is REDISTRIBUTION, not promotion, and the difference is the whole
// point of this file. A promotion rule was written first and a trace showed it
// could only ever inflate: the winners are promoted before the loser is judged,
// so a pile holding one 4★ came out holding three. Here the pile keeps the
// ratings it came in with and hands them out in the order the climb produced.

import { describe, expect, it } from "vitest";
import { choose, confirm, pendingConfirm, startRun } from "@/lib/ladder";
import { tierMax, tierMid, tierMin, type Rating } from "@/lib/tiers";
import type { Film, RankState } from "@/lib/types";

const film = (id: string, rating: Rating, score = tierMid(rating)): Film => ({
  id,
  title: id.toUpperCase(),
  rating,
  score,
});

/**
 * Play the whole pile out to a decided finish.
 *
 * `winner` wins every duel it appears in and `loser` loses every duel it
 * appears in; everything else is settled in the contender's favour.
 *
 * Naming the WINNER matters, and a test here failed for want of it: saying only
 * who loses does not say who ends up on top, so the pile decided that for
 * itself and the assertion was about a film that had never won anything.
 */
function playOut(
  start: RankState,
  { winner, loser }: { winner?: string; loser?: string } = {},
): RankState {
  let s = start;
  // Bounded, so a rule that never terminates fails the test rather than hanging.
  for (let i = 0; i < 60 && s.session; i++) {
    if (pendingConfirm(s)) {
      s = confirm(s);
      continue;
    }
    const c = s.session.contenderId;
    const ch = s.session.challengerId;
    const pick = c === winner || ch === loser ? c : ch === winner || c === loser ? ch : c;
    s = choose(s, pick);
  }
  return s;
}

const ratingOf = (s: RankState, id: string) => s.films.find((f) => f.id === id)!.rating;
const scoreOf = (s: RankState, id: string) => s.films.find((f) => f.id === id)!.score;
/** How many of each rating the library holds — the thing that must not drift. */
const shape = (s: RankState) =>
  s.films.reduce<Record<string, number>>((m, f) => ({ ...m, [f.rating]: (m[f.rating] ?? 0) + 1 }), {});

describe("a spanned climb", () => {
  it("swaps the ratings of a film that won and one that lost", () => {
    // The report: cross-tier battles should change the tier rating. `low` beats
    // both 4★s, so it takes a 4★ — and the 4★ it beat takes its 3★. A swap,
    // not a promotion.
    const films = [film("low", 3), film("high", 4), film("mid", 4)];
    const done = playOut(startRun(films, 3, { above: 1 }), { winner: "low", loser: "high" });
    expect(ratingOf(done, "low")).toBe(4);
    expect(ratingOf(done, "high")).toBe(3);
  });

  it("does not inflate the library, which the first rule did", () => {
    // A promotion rule turned a pile holding one 4★ into three. The multiset is
    // preserved instead: whatever ratings went in come out, in different hands.
    const films = [film("low", 3), film("high", 4), film("mid", 3)];
    const before = shape({ films, session: null, journal: [] } as RankState);
    const done = playOut(startRun(films, 3, { above: 1 }), { winner: "low", loser: "high" });
    expect(shape(done)).toEqual(before);
  });

  it("puts every re-rated film inside its NEW band", () => {
    // Bands must stay non-overlapping — `list.ts` says a plain score sort is
    // tier-correct because of it, and the counts, profile and cards inherit
    // that. A rating change with a stale score breaks all of them.
    const films = [film("low", 3), film("high", 4), film("mid", 4)];
    const done = playOut(startRun(films, 3, { above: 1 }), { winner: "low", loser: "high" });
    for (const id of ["low", "high", "mid"]) {
      const r = ratingOf(done, id);
      expect(scoreOf(done, id)).toBeGreaterThanOrEqual(tierMin(r));
      expect(scoreOf(done, id)).toBeLessThanOrEqual(tierMax(r));
    }
  });

  it("leaves an order that already agreed with the ratings alone", () => {
    // The 4★ wins everything, so it keeps the 4★ and the 3★s keep theirs.
    // Nothing was wrong, so nothing moves.
    const films = [film("high", 4), film("a", 3), film("b", 3)];
    const done = playOut(startRun(films, 3, { above: 1 }), { winner: "high" });
    expect(ratingOf(done, "high")).toBe(4);
  });

  // ── Inert where it should be ────────────────────────────────────────────

  it("changes nothing on an ordinary single-tier climb", () => {
    // Structural, not guarded: an unspanned pile is one rating repeated, so
    // handing those ratings out in any order changes nothing.
    const films = [film("a", 4), film("b", 4), film("c", 4)];
    const done = playOut(startRun(films, 4), { loser: "c" });
    for (const f of done.films) expect(f.rating).toBe(4);
  });

  it("never re-rates on a cross-tier run, which writes nothing at all", () => {
    // A curated run confirms an ORDER and no positions — see `confirm`. Its
    // duels are not evidence about where a film sits among its own tier.
    const films = [film("low", 3), film("a", 5), film("b", 5)];
    const done = playOut(
      startRun(films, 3, { only: films.map((f) => f.id), crossTier: true }),
      { winner: "low" },
    );
    expect(ratingOf(done, "low")).toBe(3);
    expect(ratingOf(done, "a")).toBe(5);
  });
});
