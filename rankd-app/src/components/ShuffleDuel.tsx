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
// reuses PosterCard so it inherits the compare screen's language
// rather than inventing a competing one, but the layout around them has had no
// design pass and is not meant to read as finished.

import { useCallback, useEffect, useRef, useState } from "react";

import { PosterCard, fadeLoserOut } from "./PosterCard";
import { SessionEnd } from "./SessionEnd";
import { applyJudgement, beliefsWhenIdle, seedOf, type Belief } from "@/lib/beliefs";
import { PRIOR_SPREAD } from "@/lib/bayes";
import { appendJudgements, newJudgement, type Judgement } from "@/lib/log";
import { backfillPosters, needsMeta, needsPoster, type FilmMeta } from "@/lib/meta";
import { nextPair, poolFor, type MatchOptions } from "@/lib/matchmaker";
import { sessionProgress } from "@/lib/progress";
import { RunBars } from "./RunBars";
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
  onMeta,
  options,
  onInfo,
  onExit,
  onList,
}: {
  films: Film[];
  onFilms: (films: Film[]) => void;
  /**
   * Fold a fetched TMDb response into one film. Separate from `onFilms` and
   * applied by the parent through a functional update, because artwork arrives
   * asynchronously while swiping keeps replacing the library — handing back a
   * whole array built from a closed-over `films` would silently undo whatever
   * duels landed while the request was in flight.
   */
  onMeta: (id: string, meta: FilmMeta) => void;
  options: ShuffleOptions;
  onInfo: (film: Film) => void;
  onExit: () => void;
  /** Leave for the list — where what you just made now lives. */
  onList: () => void;
}) {
  const [log, setLog] = useState<Judgement[] | null>(null);
  const [beliefs, setBeliefs] = useState<Map<string, Belief>>(new Map());
  const [pair, setPair] = useState<[Film, Film] | null>(null);
  const [count, setCount] = useState(0);
  // One undoable judgement, with the library exactly as it was before it — so
  // taking it back restores the scores too, not just the log row.
  const [pending, setPending] = useState<{ judgement: Judgement; films: Film[]; pair: [Film, Film] } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The poster row, so an exit animation can find the two <img>s to clone.
  const arenaRef = useRef<HTMLDivElement>(null);

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

  // ── Artwork ───────────────────────────────────────────────────────────
  //
  // Fast Shuffle shipped without any of this, so a film TMDb had never been
  // asked about stayed a blank rectangle forever — there was simply nothing in
  // this component that ever fetched a poster. DuelScreen backfills for its
  // pile; this mode has no pile, so it needs its own.
  //
  // Two loops, because they have completely different urgency. `fetchMeta` keeps
  // one in-flight request per film and shares it, so the two never duplicate
  // work: whichever asks first wins and the other awaits the same promise.

  // URGENT — the two films actually on screen, unpaced. Everything else can wait;
  // these are the ones being stared at right now.
  useEffect(() => {
    if (!pair) return;
    const need = pair.filter(needsPoster);
    if (need.length === 0) return;
    let stopped = false;
    void backfillPosters(need, onMeta, () => stopped, 0);
    return () => {
      stopped = true;
    };
  }, [pair, onMeta]);

  // BACKGROUND — the rest of the pool, paced, so a film has usually been fetched
  // before it is ever served. Runs once for the session rather than per swipe:
  // `films` changes on every judgement, and restarting the walk each time would
  // mean never getting past the first few.
  useEffect(() => {
    let stopped = false;
    const pool = poolFor(films, { scope: options.scope, includeConfirmed: options.includeConfirmed });
    // Films with no artwork at all first — a missing poster is a hole on screen,
    // where missing credits are a detail nobody is looking at.
    const queue = [...pool.filter(needsPoster), ...pool.filter((f) => !needsPoster(f) && needsMeta(f))];
    if (queue.length > 0) void backfillPosters(queue, onMeta, () => stopped);
    return () => {
      stopped = true;
    };
    // Once per session, deliberately — see above.
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

  // Show the answer landing before the pair is replaced.
  //
  // Without this the posters simply cut from one film to the next, which reads
  // as a glitch rather than as a consequence. The ordinary duel flies the winner
  // into the climbing seat — meaningless here, where neither card is a seat and
  // both films are peers — so the loser sinks and fades instead, and a draw
  // sinks both, because a draw is precisely the claim that neither won.
  const playExit = (outcome: "a" | "b" | "draw") => {
    const cards = arenaRef.current?.querySelectorAll<HTMLElement>("button");
    const imgs = [cards?.[0]?.querySelector("img"), cards?.[1]?.querySelector("img")];
    const losers = outcome === "draw" ? [0, 1] : [outcome === "a" ? 1 : 0];
    for (const i of losers) {
      const img = imgs[i];
      if (img) fadeLoserOut(img, pair?.[i].poster ?? "");
    }
  };

  const answer = (outcome: "a" | "b" | "draw") => {
    if (!pair || !log) return;
    const [a, b] = pair;
    playExit(outcome);
    flush(); // the previous judgement lands before this one is buffered

    const judgement = newJudgement(a.id, b.id, outcome, "shuffle");
    const nextLog = [...log, judgement];

    // Online update — the cheap per-swipe path. The batch refit that erases its
    // drift runs when the session ends, not between taps.
    const nextBeliefs = applyJudgement(beliefs, judgement, fallback);
    // A person run must not write scores.
    //
    // Its whole point is comparing films ACROSS tiers, and `score` is defined
    // inside a tier band — `respreadTier` would take a cross-tier answer and
    // fold it back inside the stars each film already has, which is worse than
    // ignoring it: the duel would appear to count and would silently mean
    // something else. So the judgement still lands in the log and the belief
    // still moves; only the write-back is skipped. The person's ordering is read
    // from the beliefs (rankByBelief), which is where a cross-tier answer can
    // actually live.
    const crossTier = options.scope.kind === "person";
    const placed = crossTier
      ? films
      : placeSettled(respreadFor(films, [a, b], nextBeliefs, options.includeConfirmed), nextBeliefs);

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
    setCount((n) => Math.max(0, n - 1));
    onFilms(pending.films);
    setPair(pending.pair);
    setPending(null);
  };

  // Leaving must not silently drop the last answer.
  useEffect(() => flush, [flush]);

  // Done ends the session rather than just closing it. The mode used to drop you
  // straight back where you started with nothing said, which is why finishing a
  // run felt like nothing had happened — the app went quiet at the exact moment
  // you had done the most work.
  const [ended, setEnded] = useState(false);
  const leave = () => {
    flush();
    setEnded(true);
  };

  const pool = poolFor(films, { scope: options.scope, includeConfirmed: options.includeConfirmed });

  if (ended) {
    // Best of what this run touched, so the result is what YOU just worked on
    // rather than the whole library's top — which the list already shows.
    const touched = new Set((log ?? []).slice(-count * 2).flatMap((j) => [j.a, j.b]));
    const ranked = films
      .filter((f) => touched.has(f.id))
      .sort((a, b) => b.score - a.score);
    const placed = pool.filter((f) => f.lock !== undefined).length;
    return (
      <SessionEnd
        title={count > 0 ? "Session done" : "Nothing settled"}
        blurb={
          count > 0
            ? "Every answer is kept. The list has moved to match."
            : "No duels this time, so nothing changed."
        }
        films={ranked}
        stats={[
          { label: count === 1 ? "duel" : "duels", value: String(count) },
          { label: "in range placed", value: String(placed) },
        ]}
        onList={onList}
        onAgain={onExit}
        againLabel="Keep shuffling"
      />
    );
  }

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

  // Render the CURRENT version of each film, not the snapshot taken when the
  // pair was served.
  //
  // `pair` holds Film objects and artwork arrives asynchronously, so a poster
  // fetched while you were looking at a card landed in the library and never
  // reached the screen — the card was still rendering the object from before the
  // fetch, whose `poster` was undefined. The pair says WHICH two films; the
  // library says what they currently look like.
  const [servedA, servedB] = pair;
  const a = films.find((f) => f.id === servedA.id) ?? servedA;
  const b = films.find((f) => f.id === servedB.id) ?? servedB;

  // Derived from the log rather than counted as you go, so walking away
  // mid-session and coming back an hour later resumes where you left off.
  const session = sessionProgress(
    poolFor(films, { scope: options.scope, includeConfirmed: options.includeConfirmed }),
    log ?? [],
  );
  // A person run is a shuffle underneath, but labelling it FAST SHUFFLE hides
  // the only thing that makes it different from one.
  const person = options.scope.kind === "person" ? options.scope.name : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The same three bars the climb shows, in the same order, meaning the same
          things. This mode grew its own readout first and the climb kept a single
          tier bar, so "how far through this am I" had two different answers
          depending on which game you were in. */}
      <RunBars
        films={films}
        log={log ?? []}
        title={person ? person.toUpperCase() : "FAST SHUFFLE"}
        run={{ label: "This run", done: session.compared, total: session.total }}
      />

      {/* A definite height that yields under pressure, matching the arena in the
          ordinary duel. Left as `flex-1` the cards grew to fill whatever was
          going spare and the posters stretched out of their 2:3 shape on a tall
          screen. */}
      <div style={{ flexGrow: 1 }} />
      <div
        ref={arenaRef}
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
          Draw
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

      {/* Given room rather than jammed against the bottom edge. It was sitting
          flush under the controls with no space of its own, which made the line
          read as a caption on the buttons instead of a record of what you just
          did. */}
      {/* The results feed was here. Removed for the same reason as the climb's:
          it narrated what you had just done back to you, on the screen where the
          next question is the only thing that matters. Undo does the job it was
          standing in for. */}
      <div style={{ flexGrow: 0.6 }} />
    </div>
  );
}

const noop = () => {};

// The three progress bars now live in RunBars.tsx, shared with the climb.

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-[13px] leading-relaxed text-dim">
      {children}
    </div>
  );
}
