// The estimator: a regularised Bayesian Bradley–Terry model.
//
// PORTED, near-verbatim, from Nth (`lib/ranking/bayes.ts`) — MIT licensed,
// © 2026 James Cameron. See THIRD-PARTY.md. The maths is unchanged on purpose:
// it is a proven implementation with a test suite behind it, and quietly
// "improving" a Gaussian update is how you get a ranking that looks fine and is
// wrong. Only the surrounding commentary is rankd's.
//
// What it is for HERE. Rankd's placement mechanics decide where a film sits;
// this decides what the accumulated evidence THINKS, which is a different and
// deliberately non-authoritative question. Nothing in this file moves the list.
// It is read by the matchmaker (what to ask next), by the confidence readout
// (how settled a film is), and by the review card (where the evidence disagrees
// with you). The user's confirmed placements remain the user's.
//
// Each film carries a Gaussian belief over its latent score: a posterior `mean`
// and a posterior `spread` (its standard deviation — how settled it is). The
// prior is the film's star tier; the judgement log is the likelihood. The prior
// regularises the fit, so a film with few or disconnected comparisons falls back
// toward its star rating instead of diverging — a film that has only ever won
// drifts a shrinking amount per win and converges to a finite score.
//
// Everything here is pure. No storage, no React, no clock.

/** A Gaussian belief over one film's latent score. */
export interface Belief {
  /** Posterior mean — where the evidence thinks this film belongs. */
  mean: number;
  /** Posterior spread — the belief's standard deviation (settledness). */
  spread: number;
}

/**
 * The prior's initial spread: how unsettled a film is before any duel.
 *
 * Scale note, and the one thing to get right when reading this file: beliefs
 * live on a 1–10 scale (a film's star rating × 2), NOT on rankd's 1–10,000 score
 * bands. Keeping Nth's scale keeps its constants meaningful. Projecting back into
 * the bands is `shuffle.ts`'s job, and it does it by re-spreading a tier in
 * belief order rather than by arithmetic — so a tier band can never be escaped.
 *
 * Wide relative to that 1–10 scale, so a star rating is a soft starting point a
 * handful of duels can move well past, not a cap.
 */
export const PRIOR_SPREAD = 3;

/**
 * The performance spread `β`: the per-duel noise between a film's latent score
 * and how it "performed" in one judgement. It sets how much a single decisive
 * result can move the two means — larger is more conservative.
 */
export const PERFORMANCE_SPREAD = 1;

/**
 * The draw weight: how hard a Skip pulls two beliefs together relative to a
 * decisive result, in (0, 1]. A Skip is the strongest available statement that
 * two films are neighbours, but its intent is ambiguous ("too close to call" vs
 * "I don't remember these well"), so it counts for LESS than a decisive answer.
 * At 1 it would pull as hard; at 0 it would do nothing.
 */
export const DRAW_WEIGHT = 0.5;

/**
 * The draw margin `ε`: the half-width (in score units) of the latent band inside
 * which two films count as tied. A Davidson-style tie needs a positive margin —
 * with none the draw update is undefined, since a zero-width band has zero
 * probability. Kept below the performance spread so a Skip reads as "these are
 * close", not "these are the same film".
 */
export const DRAW_MARGIN = 0.5;

/**
 * How many ordinal positions a film's belief must disagree with its actual list
 * position before the review card is willing to say so. Below this it is noise;
 * at or above it is worth a question. Nth uses the same number for the same
 * reason — it is the threshold for "large enough to notice".
 */
export const LARGE_MOVE_THRESHOLD = 5;

// Standard normal pdf.
function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// Error function (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7) — enough for a
// display-grade posterior, and avoids a maths dependency.
function erf(x: number): number {
  const sign = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return sign * y;
}

// Standard normal cdf.
function normalCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// The two TrueSkill-style correction terms for a decisive result. `v` is the mean
// shift (always positive, so the winner moves up and the loser down), `w` is the
// spread-tightening factor in (0, 1). For a very confident loss (large negative
// t) the naive `pdf/cdf` underflows, so fall back to its asymptote `v ≈ -t`.
function decisiveTerms(t: number): { v: number; w: number } {
  const cdf = normalCdf(t);
  const v = cdf > 1e-9 ? normalPdf(t) / cdf : -t;
  const w = v * (v + t);
  return { v, w };
}

/**
 * Apply one decisive duel to the winner's and loser's beliefs. The winner's mean
 * rises and the loser's falls, and both spreads tighten.
 *
 * A single Gaussian-approximate posterior update of the Bradley–Terry
 * likelihood: the update magnitude scales with each film's own spread, so a
 * settled film barely moves against one contradicting result while an unsettled
 * one moves a lot — and, because the spread shrinks with every duel, an
 * only-ever-won film's gains diminish and its score stays finite.
 *
 * This is the CHEAP per-swipe path. `fitBeliefs` below is the periodic
 * reconvergence that erases the drift these incremental updates accumulate.
 */
export function updateDecisive(winner: Belief, loser: Belief): { winner: Belief; loser: Belief } {
  const wVar = winner.spread * winner.spread;
  const lVar = loser.spread * loser.spread;
  const c2 = 2 * PERFORMANCE_SPREAD * PERFORMANCE_SPREAD + wVar + lVar;
  const c = Math.sqrt(c2);
  const t = (winner.mean - loser.mean) / c;
  const { v, w } = decisiveTerms(t);

  return {
    winner: {
      mean: winner.mean + (wVar / c) * v,
      spread: Math.sqrt(wVar * (1 - (wVar / c2) * w)),
    },
    loser: {
      mean: loser.mean - (lVar / c) * v,
      spread: Math.sqrt(lVar * (1 - (lVar / c2) * w)),
    },
  };
}

// The two Davidson-tie correction terms for a Skip, at the standardised mean gap
// `t` and standardised draw margin `eps`. `v` is the mean nudge whose sign pulls
// the higher-mean film DOWN and the lower UP — toward each other — and vanishes
// when the two are already level; `w` in (0, 1) tightens both spreads. The mirror
// of `decisiveTerms`, for a tie band rather than a strict win. For a vanishing
// draw probability the ratio underflows, so fall back to the asymptote that still
// pulls the pair together.
function drawTerms(t: number, eps: number): { v: number; w: number } {
  const denom = normalCdf(eps - t) - normalCdf(-eps - t);
  if (denom < 1e-9) {
    return { v: t < 0 ? -eps - t : eps - t, w: 1 };
  }
  const v = (normalPdf(-eps - t) - normalPdf(eps - t)) / denom;
  const w = v * v + ((eps - t) * normalPdf(eps - t) - (-eps - t) * normalPdf(-eps - t)) / denom;
  return { v, w };
}

/**
 * Apply one Skip as a down-weighted Davidson-style draw. It nudges the two means
 * TOWARD each other and TIGHTENS both spreads — the settledness that they are
 * adjacent — but never synthesises a winner: the update is symmetric in the pair
 * and, when the two are already level, moves neither mean.
 *
 * This is what makes rankd's "too close to call" a real answer rather than a
 * dodge. Both the nudge and the tightening are damped by `DRAW_WEIGHT`, so a Skip
 * is strictly the weaker signal; because the spread still shrinks, repeated Skips
 * converge rather than oscillate.
 */
export function updateDraw(a: Belief, b: Belief): { a: Belief; b: Belief } {
  const aVar = a.spread * a.spread;
  const bVar = b.spread * b.spread;
  const c2 = 2 * PERFORMANCE_SPREAD * PERFORMANCE_SPREAD + aVar + bVar;
  const c = Math.sqrt(c2);
  const t = (a.mean - b.mean) / c;
  const { v, w } = drawTerms(t, DRAW_MARGIN / c);

  return {
    a: {
      mean: a.mean + DRAW_WEIGHT * (aVar / c) * v,
      spread: Math.sqrt(aVar * (1 - DRAW_WEIGHT * (aVar / c2) * w)),
    },
    b: {
      mean: b.mean - DRAW_WEIGHT * (bVar / c) * v,
      spread: Math.sqrt(bVar * (1 - DRAW_WEIGHT * (bVar / c2) * w)),
    },
  };
}

/**
 * The displayed confidence derived from a spread: 0 at the wide prior (nothing
 * known) rising toward 1 as duels tighten the belief. Clamped to [0, 1].
 *
 * This is the number rankd could never express before. `duels` counts how many
 * questions a film was asked; this says how much the answers actually settled it
 * — a film that won five duels against films it obviously beats is barely more
 * settled than one that fought none.
 */
export function confidenceFromSpread(spread: number): number {
  const settled = 1 - spread / PRIOR_SPREAD;
  return Math.min(1, Math.max(0, settled));
}

// ---------------------------------------------------------------------------
// The batch schedule: a full posterior recompute over the whole judgement log.
//
// Where `updateDecisive`/`updateDraw` are the online, incremental,
// order-DEPENDENT moves, `fitBeliefs` is the order-INDEPENDENT recompute that
// erases the drift they accumulate. Same model: a Gaussian prior at each film's
// star seed, the whole log as the likelihood, the same correction terms.
//
// Order-independence is structural, not incidental. The log-posterior is strictly
// concave (a Gaussian prior plus log-concave Bradley–Terry win terms plus
// log-concave Davidson tie terms), so it has ONE maximum. Iterating to
// convergence therefore lands on that single point regardless of the order duels
// were fought — which is exactly the property that lets a re-fit absorb a
// contradiction cycle (A beat B beat C beat A settles all three together, low
// confidence) instead of letting the most recent answer win, which is what
// rankd's engine alone does and cannot help doing.

/** One film to fit: its id and its prior mean — the star seed (rating × 2). */
export interface FitEntry {
  id: string;
  seed: number;
}

/** One judgement from the log, by the ids it names. Every row weighs the same —
 * a duel from a year ago is evidence exactly as much as one from this morning. */
export interface FitComparison {
  aId: string;
  bId: string;
  outcome: "a" | "b" | "draw";
}

/**
 * Iteration cap: an absolute ceiling on sweeps so a pathological log can never
 * spin forever. The concave objective converges well within this for any real
 * library; it is a safety valve, not the expected stopping point.
 */
export const REFIT_MAX_ITERATIONS = 200;

/**
 * Convergence tolerance: the sweep stops once no film's score moved by more than
 * this over a full pass. Well below the 1–10 scale, so the result is stable to
 * more digits than anything ever displays.
 */
export const REFIT_CONVERGENCE_TOLERANCE = 1e-5;

// Which side of a judgement a film sat on, from its own perspective — so one
// adjacency list per film carries everything a coordinate update needs.
type Edge =
  | { kind: "win"; other: number }
  | { kind: "loss"; other: number }
  | { kind: "draw"; other: number };

/**
 * Recompute every film's posterior belief from the seeds and the whole log,
 * order-independently. Returns one `Belief` per id.
 *
 * Coordinate-ascent Newton on the log-posterior: each sweep moves every film
 * toward the mode of its own conditional (its prior pull plus the evidence
 * touching it), reusing the same correction terms the online update uses.
 * Because the objective is strictly concave the sweeps climb to the single global
 * maximum, so the answer depends only on the multiset of judgements. The
 * per-film spread is the Laplace standard deviation at that mode, so a film with
 * no duels keeps the wide `PRIOR_SPREAD` and a heavily-judged one tightens.
 *
 * NOT CHEAP: up to `REFIT_MAX_ITERATIONS` sweeps over every film and every edge
 * touching it. Callers must keep this off the interaction path — see beliefs.ts,
 * which runs it on idle and caches. Never call it inside a swipe handler.
 */
export function fitBeliefs(
  entries: readonly FitEntry[],
  comparisons: readonly FitComparison[],
): Map<string, Belief> {
  const n = entries.length;
  const indexById = new Map<string, number>();
  entries.forEach((e, i) => indexById.set(e.id, i));

  const seed = entries.map((e) => e.seed);
  const mean = seed.slice();
  const edges: Edge[][] = entries.map(() => []);

  // The performance noise `c` and draw margin are the SAME tunables the online
  // update uses; here `c² = 2β²` is the likelihood curvature at the mode.
  const c2 = 2 * PERFORMANCE_SPREAD * PERFORMANCE_SPREAD;
  const c = Math.sqrt(c2);
  const eps = DRAW_MARGIN / c;
  const priorPrecision = 1 / (PRIOR_SPREAD * PRIOR_SPREAD);

  for (const cmp of comparisons) {
    const ai = indexById.get(cmp.aId);
    const bi = indexById.get(cmp.bId);
    // A judgement naming a film not in the fit set (deleted, or filtered out) is
    // simply not evidence about anyone here — skip it rather than invent a node.
    if (ai === undefined || bi === undefined) continue;

    if (cmp.outcome === "draw") {
      edges[ai].push({ kind: "draw", other: bi });
      edges[bi].push({ kind: "draw", other: ai });
    } else {
      const [wi, li] = cmp.outcome === "a" ? [ai, bi] : [bi, ai];
      edges[wi].push({ kind: "win", other: li });
      edges[li].push({ kind: "loss", other: wi });
    }
  }

  // The likelihood gradient and information (curvature) for one film at the
  // current means. Shared by the ascent sweeps and the final spread pass, so the
  // two can never diverge.
  const localGradAndInfo = (i: number): { grad: number; info: number } => {
    let grad = 0;
    let info = 0;
    for (const edge of edges[i]) {
      if (edge.kind === "win") {
        const t = (mean[i] - mean[edge.other]) / c;
        const { v, w } = decisiveTerms(t);
        grad += v / c;
        info += w / c2;
      } else if (edge.kind === "loss") {
        const t = (mean[edge.other] - mean[i]) / c;
        const { v, w } = decisiveTerms(t);
        grad -= v / c;
        info += w / c2;
      } else {
        // A Skip counts for `DRAW_WEIGHT` of a decisive result in both its pull
        // and its information. `drawTerms`' `v` already pulls this film toward
        // its partner, so the sign is uniform whichever side of the pair it is.
        const t = (mean[i] - mean[edge.other]) / c;
        const { v, w } = drawTerms(t, eps);
        grad += (DRAW_WEIGHT * v) / c;
        info += (DRAW_WEIGHT * w) / c2;
      }
    }
    return { grad, info };
  };

  for (let sweep = 0; sweep < REFIT_MAX_ITERATIONS; sweep++) {
    let maxDelta = 0;
    // Gauss–Seidel: each film steps using the latest means, which converges more
    // steadily than a simultaneous update on this coupled, concave problem.
    for (let i = 0; i < n; i++) {
      const { grad, info } = localGradAndInfo(i);
      const precision = priorPrecision + info;
      // One Newton step toward the conditional mode: the likelihood pull plus the
      // prior pull back toward the seed, divided by the total precision.
      const gradient = grad - (mean[i] - seed[i]) * priorPrecision;
      const step = gradient / precision;
      mean[i] += step;
      const delta = Math.abs(step);
      if (delta > maxDelta) maxDelta = delta;
    }
    if (maxDelta < REFIT_CONVERGENCE_TOLERANCE) break;
  }

  // Spread at the mode: the Laplace posterior standard deviation. Prior precision
  // alone (no evidence) gives exactly `PRIOR_SPREAD`, so a film that has never
  // been duelled reads maximally unsettled — consistent with the online path.
  const beliefs = new Map<string, Belief>();
  for (let i = 0; i < n; i++) {
    const { info } = localGradAndInfo(i);
    const spread = 1 / Math.sqrt(priorPrecision + info);
    beliefs.set(entries[i].id, { mean: mean[i], spread });
  }
  return beliefs;
}
