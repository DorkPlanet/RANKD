// What a climb actually COSTS, measured rather than asserted.
//
// The claim this file exists to pin down: the King of the Hill climb shows
// exactly n(n-1)/2 duels, independent of the answers and independent of how well
// the pile was seeded. Rough Cut's whole job is to hand the climb a near-sorted
// pile, and the surprise is that a near-sorted pile costs precisely as much as a
// shuffled one — because `refresh` always aims at the film directly above, and
// every settle drops the climbing film's index by exactly one.
//
//     A pass over m films is m-1 duels.  Σ(m-1) for m = n..2  =  n(n-1)/2.
//
// 185 films is 17,020 duels. The comment at roughCut.ts:5 says "several
// thousand", which undersells it threefold.
//
// This harness is the baseline. It plays the real engine against a perfectly
// consistent simulated user and counts what the user was shown. Nothing here
// tests a feature; it measures the floor that any improvement has to beat, and
// it is deliberately written BEFORE that improvement exists so the numbers
// cannot be fitted to it after the fact.

import { describe, expect, it } from "vitest";

import { choose, confirm, peekKnown, pendingConfirm, replayStep, startRun } from "@/lib/ladder";
import type { Judgement } from "@/lib/log";
import { buildRelations, decidedOrder } from "@/lib/relations";
import { tierMax, tierMin, type Rating } from "@/lib/tiers";
import type { Film, RankState } from "@/lib/types";

const RATING: Rating = 4;

// ── The simulated user ──────────────────────────────────────────────────────
//
// A ground-truth total order, and an answer function perfectly consistent with
// it. Consistency is the point: an inconsistent user can contradict themselves,
// and contradictions are a separate question (they land in the cycle handling,
// tested elsewhere). Here the user is an oracle, so the only thing varying is
// the engine.

/** Ground truth: g0 is the best film, g(n-1) the worst. */
const truth = (n: number): string[] => Array.from({ length: n }, (_, i) => `g${i}`);

function judge(order: readonly string[]) {
  const rank = new Map(order.map((id, i) => [id, i]));
  return (a: string, b: string): string => (rank.get(a)! < rank.get(b)! ? a : b);
}

// ── Seeds ───────────────────────────────────────────────────────────────────
//
// The seed is the one thing Rough Cut controls, so it is the axis worth varying.
//
//  · sorted   — the pile is already right. The best case Rough Cut aims at.
//  · roughCut — truth split into thirds, shuffled WITHIN each third. This is
//               exactly what a coarse flick pass knows: the right third, and
//               nothing whatever about the order inside it.
//  · random   — no information at all.

type Seed = "sorted" | "roughCut" | "random";

/** Deterministic PRNG, so a failing table is reproducible. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seedOrder(order: readonly string[], seed: Seed, rand: () => number): string[] {
  if (seed === "sorted") return [...order];
  if (seed === "random") return shuffle([...order], rand);
  const n = order.length;
  const cut = Math.ceil(n / 3);
  return [
    ...shuffle(order.slice(0, cut), rand),
    ...shuffle(order.slice(cut, cut * 2), rand),
    ...shuffle(order.slice(cut * 2), rand),
  ];
}

/**
 * Build the library the run will be started over.
 *
 * Scores are spread across the tier band in the SEEDED order, because that is
 * what the app would be holding: Rough Cut writes scores, and `startRun`'s pool
 * is score-sorted. Passing `only` would preserve a caller's order instead, but
 * the honest baseline is the ordinary tier run, so the seed goes into the scores.
 */
function library(seeded: readonly string[]): Film[] {
  const n = seeded.length;
  const [mn, mx] = [tierMin(RATING), tierMax(RATING)];
  return seeded.map((id, i) => ({
    id,
    title: id.toUpperCase(),
    rating: RATING,
    score: Math.round(mx - (i / Math.max(1, n - 1)) * (mx - mn)),
  }));
}

// ── Playing a run to the end ────────────────────────────────────────────────

export interface RunCost {
  /** Duels the user was actually shown and had to answer. */
  shown: number;
  /** Duels settled from the record, which the user never saw. */
  auto: number;
  /** Confirm screens — one "lock in" tap each, unless auto-finish takes them. */
  confirms: number;
  /** The finished order, best first. */
  order: string[];
  /** Milliseconds spent rebuilding the closure, summed over the whole run. */
  oracleMs: number;
  /**
   * How many remembered duels ran back-to-back, per uninterrupted stretch.
   *
   * The number the replay's pacing lives or dies by. The total saving says
   * nothing about what watching it FEELS like: a hundred streaks of two is a
   * pleasant rhythm, and two streaks of a hundred is a cutscene the user cannot
   * skip. Reported as a distribution for that reason.
   */
  streaks: number[];
  /** Replayed duels the user actually fought before, versus deduced ones. */
  direct: number;
  inferred: number;
}

interface PlayOpts {
  /** Consult the record before asking. */
  relations?: boolean;
  /** Offer "nothing left to decide" once the record totally orders the rest. */
  autoFinish?: boolean;
  /** Probability the simulated user answers against their own ground truth. */
  misTap?: number;
}

function playRun(
  order: readonly string[],
  seed: Seed,
  rand: () => number,
  opts: PlayOpts = {},
): RunCost {
  const truthful = judge(order);
  const answer = (a: string, b: string): string => {
    const right = truthful(a, b);
    if (!opts.misTap || rand() >= opts.misTap) return right;
    return right === a ? b : a; // a slip of the thumb
  };

  const seeded = seedOrder(order, seed, rand);
  const films = library(seeded);
  const pile = films.map((f) => f.id);

  // The log, as the app would hold it: every answered duel, accumulating. The
  // closure is rebuilt from scratch after each one, exactly as the shell's memo
  // does — so this measures the cost of remembering as well as the saving.
  let log: Judgement[] = [];
  let oracleMs = 0;
  const build = () => {
    if (!opts.relations) return undefined;
    const t0 = performance.now();
    const r = buildRelations(pile, log);
    oracleMs += performance.now() - t0;
    return r;
  };

  let st: RankState = startRun(films, RATING, { oracle: build() });
  let shown = 0;
  let auto = 0;
  let confirms = 0;
  let direct = 0;
  let inferred = 0;
  const streaks: number[] = [];
  const finished: string[] = [];

  // What the screen does between real decisions: play the remembered duels one
  // at a time. Counted as a streak, because that is the unit the user watches.
  const replay = () => {
    let n = 0;
    for (;;) {
      const step = peekKnown(st);
      if (!step) break;
      if (step.via === "direct") direct++;
      else inferred++;
      st = replayStep(st);
      n++;
    }
    auto += n;
    if (n > 0) streaks.push(n);
  };
  replay();

  // A run over n films terminates in n(n-1)/2 + n transitions at the very most;
  // the cap is an assertion that it did, not a mechanism for making it.
  const cap = order.length * order.length + order.length * 2;
  let steps = 0;

  while (st.session) {
    if (++steps > cap) throw new Error(`run did not terminate within ${cap} steps`);

    // Auto-finish: the record totally orders what is left, so there is nothing
    // to decide. One tap takes the lot.
    if (opts.autoFinish && st.oracle && st.session.unconfirmed.length > 1) {
      const rest = decidedOrder(st.session.unconfirmed, st.oracle);
      if (rest) {
        confirms++;
        finished.push(...rest);
        break;
      }
    }

    if (pendingConfirm(st)) {
      confirms++;
      finished.push(st.session.unconfirmed[0]);
      st = confirm(st);
      replay();
      continue;
    }

    shown++;
    st = choose(st, answer(st.session.contenderId, st.session.challengerId));
    log = [...log, ...st.journal];
    st = { ...st, journal: [], oracle: build() };
    replay();
  }

  return { shown, auto, confirms, order: finished, oracleMs, streaks, direct, inferred };
}

// ── The table ───────────────────────────────────────────────────────────────

// A 200-film run with the closure rebuilt after every duel takes tens of seconds
// — worth measuring, not worth paying on every `npm test`. The correctness
// assertions all run at sizes that are cheap; the full table is opt-in:
//
//     COST=1 npx vitest run test/climbCost.test.ts
//
const FULL = !!process.env.COST;
const SIZES = FULL ? [25, 50, 100, 200] : [25, 50, 100];
const SEEDS: Seed[] = ["sorted", "roughCut", "random"];

describe("climb cost — the baseline this feature has to beat", () => {
  const rows: string[] = [];

  it("shows exactly n(n-1)/2 duels, whatever the seed", () => {
    for (const n of SIZES) {
      const order = truth(n);
      for (const seed of SEEDS) {
        const t0 = performance.now();
        const cost = playRun(order, seed, rng(n * 7919 + seed.length));
        const ms = performance.now() - t0;

        // The whole point: the seed makes no difference at all.
        expect(cost.shown, `n=${n} seed=${seed}`).toBe((n * (n - 1)) / 2);
        // One lock-in tap per film.
        expect(cost.confirms, `n=${n} seed=${seed}`).toBe(n);
        // And a perfectly consistent user always lands on the truth.
        expect(cost.order, `n=${n} seed=${seed}`).toEqual(order);

        rows.push(
          `  n=${String(n).padStart(3)}  ${seed.padEnd(8)}  duels ${String(cost.shown).padStart(6)}` +
            `  confirms ${String(cost.confirms).padStart(4)}  ${ms.toFixed(0)}ms`,
        );
      }
    }
    // Written straight to stdout rather than through `console.log`: vitest
    // intercepts console output and this table is the whole point of the file.
    process.stdout.write(["", "KOTH baseline — duels the user is shown:", ...rows, "", ""].join("\n"));
  });

  it("costs the same whether the pile arrives sorted or shuffled", () => {
    const n = 50;
    const order = truth(n);
    const sorted = playRun(order, "sorted", rng(1));
    const random = playRun(order, "random", rng(1));
    // A near-sorted pile buys the CLIMB nothing, which is the finding that
    // motivates reading the evidence log. Rough Cut earns its keep by making the
    // duels easier to answer, not by making there be fewer of them.
    expect(sorted.shown).toBe(random.shown);
  });

  it.skipIf(!FULL)("a 185-film tier is 17,020 duels", () => {
    // Named because it is the size the app's own comments talk about, and
    // because "several thousand" is the number people have been quoting.
    expect((185 * 184) / 2).toBe(17020);
    const cost = playRun(truth(185), "roughCut", rng(185));
    expect(cost.shown).toBe(17020);
  });
});

// ── What remembering is worth ───────────────────────────────────────────────

describe("climb cost — reading the record the app already keeps", () => {
  it("prints the table", () => {
    const rows: string[] = [];
    for (const n of SIZES) {
      const order = truth(n);
      for (const seed of SEEDS) {
        const base = (n * (n - 1)) / 2;
        const after = playRun(order, seed, rng(n * 7919 + seed.length), {
          relations: true,
          autoFinish: true,
        });
        const cut = ((1 - after.shown / base) * 100).toFixed(1);
        const sorted = [...after.streaks].sort((x, y) => x - y);
        const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
        const mean = sorted.length ? after.auto / sorted.length : 0;
        const pctDirect = after.auto ? Math.round((after.direct / after.auto) * 100) : 0;
        rows.push(
          `  n=${String(n).padStart(3)}  ${seed.padEnd(8)}` +
            `  was ${String(base).padStart(6)}` +
            `  now ${String(after.shown).padStart(6)}` +
            `  (-${cut.padStart(5)}%)` +
            `  auto ${String(after.auto).padStart(6)}` +
            `  streaks ${String(sorted.length).padStart(4)}` +
            ` avg ${mean.toFixed(1).padStart(4)}` +
            ` p50 ${String(at(0.5)).padStart(3)}` +
            ` p95 ${String(at(0.95)).padStart(3)}` +
            ` max ${String(sorted[sorted.length - 1] ?? 0).padStart(3)}` +
            `  direct ${String(pctDirect).padStart(3)}%`,
        );
      }
    }
    process.stdout.write(
      ["", "KOTH with the evidence log read back — duels the user is shown:", ...rows, "", ""].join("\n"),
    );
  });

  it("costs n-1 duels on a pile that arrives sorted", () => {
    // Provable, and the reason a Rough Cut is worth doing. Pass one records every
    // consecutive pair, and the closure of those n-1 edges is a total order over
    // the whole pile — so every later pass is settled outright.
    for (const n of [25, 50, 100]) {
      const cost = playRun(truth(n), "sorted", rng(n), { relations: true, autoFinish: true });
      expect(cost.shown, `n=${n}`).toBe(n - 1);
    }
  });

  it("never changes the order it arrives at", () => {
    // The hard stop. This feature is allowed to remove duels; it is not allowed
    // to rank anything differently from the way the unaided climb would.
    for (const n of [25, 50, 100]) {
      for (const seed of SEEDS) {
        const before = playRun(truth(n), seed, rng(n + seed.length));
        const after = playRun(truth(n), seed, rng(n + seed.length), {
          relations: true,
          autoFinish: true,
        });
        expect(after.order, `n=${n} seed=${seed}`).toEqual(before.order);
      }
    }
  });

  it("saves work on every seed, not just the tidy ones", () => {
    for (const n of SIZES) {
      for (const seed of SEEDS) {
        const base = (n * (n - 1)) / 2;
        const after = playRun(truth(n), seed, rng(n * 31 + seed.length), { relations: true });
        expect(after.shown, `n=${n} seed=${seed}`).toBeLessThan(base);
      }
    }
  });

  it("survives a user who contradicts themselves", () => {
    // Mis-taps put cycles in the record. The oracle refuses the pairs inside
    // them, so those duels come back — the run costs more and still finishes.
    // Nothing here asserts the ORDER, because a user who answers wrongly gets an
    // order that reflects that; the point is that it terminates and stays legal.
    const n = 60;
    for (const misTap of [0.02, 0.05, 0.1]) {
      const sloppy = playRun(truth(n), "roughCut", rng(n), {
        relations: true,
        autoFinish: true,
        misTap,
      });
      // Terminates, places every film exactly once, and still beats the baseline.
      expect(sloppy.order, `misTap=${misTap}`).toHaveLength(n);
      expect(new Set(sloppy.order).size, `misTap=${misTap}`).toBe(n);
      expect(sloppy.shown, `misTap=${misTap}`).toBeLessThan((n * (n - 1)) / 2);
    }
    // Deliberately NOT asserted: that a sloppy run costs more than a clean one.
    // It sounds obvious and it is not true. A mis-tap makes the oracle refuse the
    // pairs caught in the cycle it creates, which adds duels — but it also sends
    // the pile down an entirely different trajectory, and a run that happens to
    // resolve into a decisive shape early can finish in fewer. The measured
    // numbers went both ways, so the honest claim is the one above: contradictions
    // are absorbed, not that they are paid for at a predictable rate.
  });

  it.skipIf(!FULL)("keeps the closure rebuild well inside a frame", () => {
    const n = 200;
    const cost = playRun(truth(n), "roughCut", rng(n), { relations: true, autoFinish: true });
    // Total time across the whole run, divided by the duels that triggered a
    // rebuild. This is the per-tap cost the user actually feels.
    const perDuel = cost.oracleMs / Math.max(1, cost.shown);
    expect(perDuel).toBeLessThan(16);
  });
});
