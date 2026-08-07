"use client";

// Fast Shuffle — the mode with no pile.
//
// King of the Hill and Spotlight both ask "where does THIS film go?" and answer
// it by moving one film through an ordered pile. Fast Shuffle asks nothing of
// the kind. It picks whichever comparison the model can least predict, applies
// the answer, and picks again. There is no contender, no climb, no confirm and
// no end — you leave when you're bored.
//
// It is the only mode allowed to reorder the list, and only because entering it
// is the opt-in. Tier bands still hold: see shuffle.ts, where band containment
// falls out of how scores are written rather than being clamped afterwards.
//
// PROVISIONAL LOOK — the mechanic is settled, the presentation is not. This
// reuses PosterCard and LastResult so it inherits the compare screen's language
// rather than inventing a competing one, but the layout around them has had no
// design pass and is not meant to read as finished.

import { useCallback, useEffect, useRef, useState } from "react";

import { LastResult, PosterCard } from "./PosterCard";
import { applyJudgement, beliefsWhenIdle, seedOf, type Belief } from "@/lib/beliefs";
import { PRIOR_SPREAD } from "@/lib/bayes";
import { appendJudgements, newJudgement, type Judgement } from "@/lib/log";
import { nextPair, poolFor, type MatchOptions } from "@/lib/matchmaker";
import { placeSettled, respreadFor } from "@/lib/shuffle";
import type { Film } from "@/lib/types";

/**
 * How long a judgement waits before it is written. Long enough to notice a
 * mis-tap and reach the undo, short enough that a paused answer lands promptly.
 *
 * Note on what this buffer is NOT. Nth needs an elaborate serialized queue here
 * because its commit is a network round trip that a fast streak can overlap.
 * Ours is a synchronous localStorage write, and React already serializes event
 * handlers, so the machinery would be solving a problem this app doesn't have.
 * What survives is the part that earns its keep: one undoable judgement.
 */
const UNDO_MS = 2600;

export interface ShuffleOptions {
  scope: MatchOptions["scope"];
  includeConfirmed: boolean;
}

export default function ShuffleDuel({
  films,
  onFilms,
  options,
  onInfo,
  onExit,
}: {
  films: Film[];
  onFilms: (films: Film[]) => void;
  options: ShuffleOptions;
  onInfo: (film: Film) => void;
  onExit: () => void;
}) {
  const [log, setLog] = useState<Judgement[] | null>(null);
  const [beliefs, setBeliefs] = useState<Map<string, Belief>>(new Map());
  const [pair, setPair] = useState<[Film, Film] | null>(null);
  const [results, setResults] = useState<{ won: string; lost: string; at: number; drew?: boolean }[]>([]);
  const [count, setCount] = useState(0);
  // One undoable judgement, with the library exactly as it was before it — so
  // taking it back restores the scores too, not just the log row.
  const [pending, setPending] = useState<{ judgement: Judgement; films: Film[]; pair: [Film, Film] } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fallback = useCallback(
    (id: string): Belief => {
      const film = films.find((f) => f.id === id);
      return { mean: film ? seedOf(film) : 0, spread: PRIOR_SPREAD };
    },
    [films],
  );

  // The log is the model's whole input, so it is read once and then kept in
  // memory — re-reading storage between swipes would be a round trip per tap for
  // information we already hold.
  // Serve a pair from whatever the model currently thinks.
  const serve = useCallback(
    (currentFilms: Film[], currentLog: Judgement[], currentBeliefs: Map<string, Belief>) => {
      setPair(
        nextPair(currentFilms, currentLog, currentBeliefs, {
          scope: options.scope,
          includeConfirmed: options.includeConfirmed,
        }),
      );
    },
    [options.scope, options.includeConfirmed],
  );

  // Opening the session: read the log, fit the beliefs off the interaction path,
  // then serve. The first pair deliberately waits for the fit rather than being
  // served from an empty model and swapped underneath — a pair that changes
  // while you are looking at it is worse than one that takes a moment to arrive.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const { loadLog } = await import("@/lib/log");
      const loaded = await loadLog();
      if (!alive) return;
      setLog(loaded);
      const fitted = await beliefsWhenIdle(films, loaded);
      if (!alive) return;
      setBeliefs(fitted);
      serve(films, loaded, fitted);
    })();
    return () => {
      alive = false;
    };
    // Deliberately once: this is the session's starting evidence, and re-running
    // it on every film change would refit mid-streak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = useCallback((judgement: Judgement) => {
    void appendJudgements([judgement]);
  }, []);

  // Write the buffered judgement and clear the undo. Called by the timer, by the
  // next swipe, and on the way out — whichever comes first.
  const flush = useCallback(() => {
    setPending((p) => {
      if (p) commit(p.judgement);
      return null;
    });
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }, [commit]);

  const answer = (outcome: "a" | "b" | "draw") => {
    if (!pair || !log) return;
    const [a, b] = pair;
    flush(); // the previous judgement lands before this one is buffered

    const judgement = newJudgement(a.id, b.id, outcome, "shuffle");
    const nextLog = [...log, judgement];

    // Online update — the cheap per-swipe path. The batch refit that erases its
    // drift runs when the session ends, not between taps.
    const nextBeliefs = applyJudgement(beliefs, judgement, fallback);
    const respread = respreadFor(films, [a, b], nextBeliefs, options.includeConfirmed);
    const placed = placeSettled(respread, nextBeliefs);

    setResults((prev) =>
      [
        {
          won: outcome === "b" ? b.title : a.title,
          lost: outcome === "b" ? a.title : b.title,
          at: Date.now(),
          drew: outcome === "draw",
        },
        ...prev,
      ].slice(0, 2),
    );
    setPending({ judgement, films, pair });
    undoTimer.current = setTimeout(flush, UNDO_MS);

    setLog(nextLog);
    setBeliefs(nextBeliefs);
    setCount((n) => n + 1);
    onFilms(placed);
    serve(placed, nextLog, nextBeliefs);
  };

  // Take back the last answer. It was never written, so there is nothing to
  // delete — the log stays append-only and never even sees the mis-tap.
  const undo = () => {
    if (!pending) return;
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    setLog((l) => (l ? l.filter((j) => j.id !== pending.judgement.id) : l));
    setResults((r) => r.slice(1));
    setCount((n) => Math.max(0, n - 1));
    onFilms(pending.films);
    setPair(pending.pair);
    setPending(null);
  };

  // Leaving must not silently drop the last answer.
  useEffect(() => flush, [flush]);

  const leave = () => {
    flush();
    onExit();
  };

  const pool = poolFor(films, { scope: options.scope, includeConfirmed: options.includeConfirmed });

  if (!log) {
    return <Centre>Reading the evidence…</Centre>;
  }

  if (!pair) {
    return (
      <Centre>
        {pool.length < 2
          ? "Not enough films in range to compare. Widen the scope and try again."
          : "Nothing left to ask here."}
        <button
          onClick={leave}
          className="mt-4 rounded-full border border-border px-5 py-2 text-xs font-bold text-text-hi active:scale-95"
        >
          Done
        </button>
      </Centre>
    );
  }

  const [a, b] = pair;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* No rank, no target, no pile — there is genuinely nothing to be at. What
          there is instead is how much you've done and how much is in play. */}
      <div className="flex flex-shrink-0 items-baseline justify-between px-5 pt-2 pb-1">
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-dim">FAST SHUFFLE</span>
        <span className="text-[11px] text-dim">
          <b className="text-text-hi">{count}</b> {count === 1 ? "duel" : "duels"} · {pool.length} in play
        </span>
      </div>

      {/* A definite height that yields under pressure, matching the arena in the
          ordinary duel. Left as `flex-1` the cards grew to fill whatever was
          going spare and the posters stretched out of their 2:3 shape on a tall
          screen. */}
      <div style={{ flexGrow: 1 }} />
      <div
        className="relative flex items-stretch justify-center gap-3 px-4"
        style={{ height: 356, flexShrink: 1, minHeight: 0 }}
      >
        <PosterCard film={a} badge="" onPick={() => answer("a")} onFlick={noop} onSink={noop} onInfo={onInfo} />
        <PosterCard film={b} badge="" onPick={() => answer("b")} onFlick={noop} onSink={noop} onInfo={onInfo} />
      </div>
      <div style={{ flexGrow: 1 }} />

      <div className="flex flex-shrink-0 justify-center gap-2 px-5">
        <button
          onClick={() => answer("draw")}
          className="rounded-full border border-border px-4 py-1.5 text-[11px] font-bold tracking-wide text-dim active:scale-95"
        >
          Too close to call
        </button>
        {pending ? (
          <button
            onClick={undo}
            className="rounded-full border px-4 py-1.5 text-[11px] font-bold tracking-wide active:scale-95"
            style={{ color: "var(--gold)", borderColor: "var(--gold)" }}
          >
            Undo
          </button>
        ) : (
          <button
            onClick={leave}
            className="rounded-full border border-border px-4 py-1.5 text-[11px] font-bold tracking-wide text-dim active:scale-95"
          >
            Done
          </button>
        )}
      </div>

      <div className="flex flex-shrink-0 justify-center">
        <LastResult results={results} />
      </div>
    </div>
  );
}

const noop = () => {};

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-[13px] leading-relaxed text-dim">
      {children}
    </div>
  );
}
