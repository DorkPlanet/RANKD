import { describe, expect, it } from "vitest";

import { confidenceFromSpread } from "@/lib/bayes";
import { beliefsFor } from "@/lib/beliefs";
import { nextPair } from "@/lib/matchmaker";
import { PLACE_CONFIDENCE, placeSettled } from "@/lib/shuffle";
import { newJudgement, type Judgement } from "@/lib/log";
import type { Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";

// Calibrating PLACE_CONFIDENCE.
//
// "A film is placed once the evidence has settled it" is only a good rule if the
// threshold matches how people actually use the app. Too high and a long session
// produces nothing visible and feels pointless; too low and half-formed opinions
// get printed as positions. The number cannot be reasoned to — it has to be
// simulated — so this file is the measurement, kept as a test so it stays true.
//
// The simulation: a library with a real hidden order, a user who answers
// according to it, and the matchmaker choosing the questions. Then: how many
// duels per film before films start claiming numbers?

const library = (n: number, rating: Rating = 4): Film[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `f${i}`,
    title: `Film ${i}`,
    rating,
    score: 7500,
  }));

// The hidden truth: lower index is better. A perfectly consistent viewer.
const trueWinner = (a: Film, b: Film): "a" | "b" =>
  Number(a.id.slice(1)) < Number(b.id.slice(1)) ? "a" : "b";

function simulate(films: Film[], duels: number, answer = trueWinner): Judgement[] {
  const log: Judgement[] = [];
  for (let i = 0; i < duels; i++) {
    // Re-fitting every step is far too slow for a simulation, and the online
    // path is what actually runs between swipes anyway — refit periodically,
    // which is also what the app does.
    const beliefs = i % 25 === 0 ? beliefsFor(films, log) : beliefsFor(films, log);
    const pair = nextPair(films, log, beliefs, { scope: { kind: "all" }, shouldExplore: () => false });
    if (!pair) break;
    log.push(newJudgement(pair[0].id, pair[1].id, answer(pair[0], pair[1]), "shuffle"));
  }
  return log;
}

const stats = (films: Film[], log: Judgement[]) => {
  const beliefs = beliefsFor(films, log);
  const confidences = films.map((f) => confidenceFromSpread(beliefs.get(f.id)!.spread));
  return {
    placed: placeSettled(films, beliefs).filter((f) => f.lock !== undefined).length,
    median: confidences.sort((a, b) => a - b)[Math.floor(confidences.length / 2)],
    duelsPerFilm: (log.length * 2) / films.length,
  };
};

describe("how much evidence a placement actually needs", () => {
  it("places nothing on a library barely touched — one duel each is not an opinion", () => {
    const films = library(40);
    const log = simulate(films, 20); // one duel per film
    const s = stats(films, log);
    expect(s.placed).toBe(0);
    expect(s.median).toBeLessThan(PLACE_CONFIDENCE);
  });

  // The number that matters: a session someone would actually sit through.
  it("places films after a realistic session, and reports the cost", () => {
    const films = library(40);
    const log = simulate(films, 200); // ten duels per film
    const s = stats(films, log);
    // Recorded so a change to any tunable shows up here as a number, not a vibe.
    // eslint-disable-next-line no-console
    console.log(
      `[calibration] 40 films · ${log.length} duels (${s.duelsPerFilm.toFixed(1)}/film) → ` +
        `${s.placed}/40 placed, median confidence ${s.median.toFixed(2)}`,
    );
    expect(s.placed).toBeGreaterThan(0);
  });

  it("settles most of a small library given a thorough session", () => {
    const films = library(20);
    const log = simulate(films, 200); // twenty duels per film
    const s = stats(films, log);
    // eslint-disable-next-line no-console
    console.log(
      `[calibration] 20 films · ${log.length} duels (${s.duelsPerFilm.toFixed(1)}/film) → ` +
        `${s.placed}/20 placed, median confidence ${s.median.toFixed(2)}`,
    );
    expect(s.placed).toBeGreaterThan(films.length / 2);
  });

  // WHAT CONFIDENCE IS, AND IS NOT — worth stating plainly, because the obvious
  // reading of the word is wrong and this cost a wrong assumption to find.
  //
  // Confidence measures how much the evidence PINS DOWN a film's position. It
  // does NOT measure how much the evidence agrees with itself. Contradictory
  // duels between two close films actually carry MORE information than lopsided
  // ones — "these two keep swapping" locates them both precisely, whereas a film
  // beating something obviously worse tells you almost nothing. So a viewer who
  // contradicts themselves produces HIGHER confidence, not lower.
  //
  // That is correct behaviour, not a flaw: three films that beat each other in a
  // ring really are all about equal, and their position as a group really is
  // well-determined. The thing it must never do is manufacture a confident
  // ORDER out of that contradiction — which is what this asserts.
  it("does not manufacture an ordering out of contradictory answers", () => {
    const films = library(20);
    let flip = 0;
    // Every fifth answer goes against the true order — a normal amount of human
    // inconsistency, not sabotage.
    const noisy = (a: Film, b: Film): "a" | "b" => {
      flip++;
      const truth = trueWinner(a, b);
      return flip % 5 === 0 ? (truth === "a" ? "b" : "a") : truth;
    };
    const spanOf = (log: Judgement[]) => {
      const beliefs = beliefsFor(films, log);
      const means = films.map((f) => beliefs.get(f.id)!.mean);
      return Math.max(...means) - Math.min(...means);
    };
    const clean = spanOf(simulate(films, 150));
    const messy = spanOf(simulate(films, 150, noisy));
    // eslint-disable-next-line no-console
    console.log(
      `[calibration] separation — consistent ${clean.toFixed(2)}, noisy ${messy.toFixed(2)}`,
    );
    // Consistent evidence spreads the library out; contradictions pull it in.
    // The ranking gets FLATTER under disagreement rather than confidently wrong.
    expect(messy).toBeLessThan(clean);
  });
});
