"use client";

// Fast Shuffle — the mode with no pile.
//
// King of the Hill asks "where does THIS film go?" and answers it by moving one
// film through an ordered pile. Fast Shuffle asks nothing of the kind. It picks whichever comparison the model can least predict, applies
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

import { Countdown } from "./Countdown";
import { PosterCard, TILT, fadeLoserOut } from "./PosterCard";
import { SessionEnd } from "./SessionEnd";
import { applyJudgement, beliefsWhenIdle, seedOf, type Belief } from "@/lib/beliefs";
import { PRIOR_SPREAD } from "@/lib/bayes";
import { appendJudgements, newJudgement, type Judgement } from "@/lib/log";
import { backfillPosters, needsMeta, needsPoster, type FilmMeta } from "@/lib/meta";
import { isPlaced } from "@/lib/lock";
import { nextPair, poolFor, type MatchOptions } from "@/lib/matchmaker";
import { RunStatus } from "./RunStatus";
import { PLACE_DUELS, countDuel, placeSettled, respreadFor } from "@/lib/shuffle";
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

/** Matches the climb's controls exactly — one language across both modes. */
const SHUFFLE_CONTROL =
  "px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim transition-colors active:scale-95";

export interface ShuffleOptions {
  scope: MatchOptions["scope"];
  includeConfirmed: boolean;
  /**
   * End the session after this many answers, or run open-ended when absent.
   *
   * ── Why a count and not a slice of the library ─────────────────────────
   *
   * The alternative considered was to pick N films and shuffle only those to
   * completion. The user's instinct was against it and the instinct is right,
   * for a reason worth writing down: the matchmaker's whole job is to ask the
   * question it can least predict the answer to, ACROSS the scope. Fencing it
   * into a subset takes that judgement away and spends every duel inside a
   * pen, which finishes those N films and leaves the rest exactly as they
   * were — a library that is sharp in one arbitrary patch and untouched
   * everywhere else.
   *
   * A count changes only where the session STOPS. The model still picks every
   * pair on the same terms it always did.
   *
   * ── What it fixes on screen ────────────────────────────────────────────
   *
   * It also supplies the one thing this mode never had: a number that responds
   * to every single tap. "Films to work out" moves when a film crosses the
   * confidence bar, which on a big library can be thousands of duels away —
   * see N11. Duels left moves by exactly one, every time, and ends at zero.
   */
  target?: number;
}

/**
 * Refit the whole model every this many answers.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * `beliefs.ts` is explicit that the design is two schedules: "the cheap update
 * keeps the swipe instant, the periodic fit keeps the answer honest". This
 * screen only ever ran the fit ONCE, on entry, and the comment on the answer
 * path said the batch refit "runs when the session ends, not between taps".
 *
 * It does not run when the session ends. It runs when the NEXT session starts —
 * and everything the model learned in between arrives in one lump at that
 * moment. Reported from a phone, and it is the exact signature: "after spamming
 * fast shuffle and no counter movement, I opened another fast shuffle and one
 * duel moved 173 movies."
 *
 * Simulated, which says the same thing: with online updates only, a 200-duel
 * sitting over an 86-film tier places ONE film. With a periodic refit it places
 * 86 — and the placements arrive spread across the session instead of all at
 * once on the way back in.
 *
 * ── Why twelve ─────────────────────────────────────────────────────────────
 *
 * The fit is measured at 861 films: 2k judgements → 10ms, 10k → 80ms, 40k →
 * 295ms. Cheap, but not free, and it runs off the interaction path through
 * `beliefsWhenIdle` for exactly that reason. Twelve is often enough that a
 * sitting sees several, and rare enough that a fast swiper is not queueing a
 * fit behind every other tap.
 */
const REFIT_EVERY = 12;

/**
 * How many duels one film stays on the left before the next takes over.
 *
 * Six, which is one more than the five a film needs to earn its provisional
 * number — so in the ordinary case the anchor is retired by being PLACED
 * rather than by running out of turns, and the cap is only there so a film the
 * matchmaker keeps failing to pair off cannot hold the screen forever.
 *
 * Rotation also happens early if the anchor gets placed sooner, which it can:
 * it may already have had duels from an earlier sitting.
 */
const ANCHOR_HOLD = 6;

/** How many films ahead the in-session artwork walk goes. See its use below. */
const LOOKAHEAD = 80;

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
  // The film held on the left, and how many duels it has served for.
  //
  // Kept HERE rather than derived from the pair, because the pair changes for
  // reasons that have nothing to do with the anchor — artwork arriving, a
  // re-serve after undo — and an anchor inferred from "whichever film is on the
  // left" would silently reset whenever any of those happened.
  const [anchor, setAnchor] = useState<{ id: string; held: number; wasPlaced: boolean } | null>(null);
  // Whether the opening serve has run yet.
  //
  // `pair === null` meant two completely different things — "not served yet"
  // and "nothing left to serve" — and only one of them has a message worth
  // showing. The opening effect sets `log` BEFORE awaiting the belief fit,
  // which on a big library is seconds, so for that whole window the screen
  // rendered "Nothing left to ask here." over a mode that was about to serve a
  // pair perfectly happily. Reported from a phone: three or four seconds of a
  // finished screen on the way in, every time.
  const [opened, setOpened] = useState(false);
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
    (
      currentFilms: Film[],
      currentLog: Judgement[],
      currentBeliefs: Map<string, Belief>,
      holdId?: string,
    ) => {
      const next = nextPair(currentFilms, currentLog, currentBeliefs, {
        scope: options.scope,
        includeConfirmed: options.includeConfirmed,
        anchorId: holdId,
      });
      // `nextPair` returns [anchor, opponent], but only as a PREFERENCE — it
      // falls back to the least-settled film when every pair involving the held
      // one is guarded. So the anchor is read back from what actually came out
      // rather than assumed, or the label would claim a film is staying while
      // the screen shows a different one.
      setPair(next);
      if (next) {
        setAnchor((a) =>
          a && a.id === next[0].id
            ? a
            : // Whether it ALREADY had a number when its turn began. The
              // rotation rule needs the transition, not the state — see below.
              { id: next[0].id, held: 0, wasPlaced: isPlaced(next[0]) },
        );
      }
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
      // After `serve`, never before: from here a null pair is a real answer
      // about the pool rather than a screen that has not loaded.
      setOpened(true);
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
    // CAPPED, and the cap is the point.
    //
    // This is a LOOKAHEAD — "usually fetched before it is ever served" — and a
    // lookahead does not need to be the whole library deep. King of the Hill
    // backfills the pile it is playing, a tier at most. Fast Shuffle's pool is
    // whatever scope you chose, and on "All films" that is every film you own.
    //
    // Queuing all of them meant a walk over ~861 films on entry, and the walk is
    // the expensive part: each step used to rewrite the entire library to
    // localStorage. That is fixed in `backfillPosters` itself, but the queue had
    // no business being that long either. Anything past the cap is the credits
    // sweep's job, which already walks the whole library on its own timer and is
    // built to be slow.
    const queue = [
      ...pool.filter(needsPoster),
      ...pool.filter((f) => !needsPoster(f) && needsMeta(f)),
    ].slice(0, LOOKAHEAD);
    if (queue.length > 0) void backfillPosters(queue, onMeta, () => stopped);
    return () => {
      stopped = true;
    };
    // Once per session, deliberately — see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── The periodic refit ──────────────────────────────────────────────────
  //
  // Fires on every REFIT_EVERY-th answer, off the interaction path.
  //
  // The reconciliation matters. `beliefsWhenIdle` is async and answers keep
  // landing while it runs, so the map it resolves with is fitted from a log
  // that may already be stale. Rather than drop those answers — which would
  // silently un-learn a duel the user just fought — the judgements that arrived
  // meanwhile are replayed onto the fitted map with the same online update the
  // swipe path uses. The fit erases the drift up to its snapshot; the replay
  // carries the rest forward.
  //
  // `logRef` rather than `log`: this must read the CURRENT log when the promise
  // resolves, not the one captured when the effect was declared.
  const logRef = useRef<Judgement[] | null>(null);
  useEffect(() => {
    logRef.current = log;
  }, [log]);

  // Only ever one refit outstanding.
  //
  // Not just to save work. `beliefsWhenIdle` shares an in-flight promise with
  // ANY concurrent caller regardless of the arguments it was asked with, so a
  // second refit started mid-flight would receive a map fitted from the FIRST
  // one's log — and the replay below, which slices by `atLog.length`, would
  // then skip every judgement between the two. Serialising removes the whole
  // class rather than trying to detect it.
  const refitting = useRef(false);

  const refit = (atLog: Judgement[], currentFilms: Film[]) => {
      if (refitting.current) return;
      refitting.current = true;
      void beliefsWhenIdle(currentFilms, atLog)
        .then((fitted) => {
        const now = logRef.current;
        if (!now) return;
        // Replay anything that landed while the fit was running.
        let merged = fitted;
        for (const j of now.slice(atLog.length)) {
          merged = applyJudgement(merged, j, fallback);
        }
        // Beliefs ONLY. The refit deliberately does not write films.
        //
        // `onFilms` takes an array rather than an updater, so writing the
        // library from a promise means writing a snapshot — and if an answer
        // landed while the fit was running, that snapshot is older than the
        // answer and would silently undo its score write.
        //
        // The next answer applies the placements instead: it calls
        // `placeSettled` with whatever beliefs are current, which are now the
        // refitted ones. Placements therefore land one tap after the refit,
        // which costs nothing anyone can perceive and removes the race outright.
        setBeliefs(merged);
        })
        .finally(() => {
          refitting.current = false;
        });
  };

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
  //
  // A winner "lift" was tried here and removed — the user disliked it on sight.
  // The reasoning was sound (only the loser animated, so the film you chose did
  // nothing) but the answer was not: a card that swells and fades in place reads
  // as a notification, not as a choice landing. If this is revisited, the thing
  // to solve is the ASYMMETRY, and the candidate is the surviving card settling
  // into the space rather than the chosen one performing.
  const playExit = (outcome: "a" | "b" | "draw") => {
    const cards = arenaRef.current?.querySelectorAll<HTMLElement>("button");
    const imgs = [cards?.[0]?.querySelector("img"), cards?.[1]?.querySelector("img")];
    const losers = outcome === "draw" ? [0, 1] : [outcome === "a" ? 1 : 0];
    // Each clone has to match the lean of the card it stands in for, or it lands
    // crooked against it — index 0 leans left now, index 1 right.
    const leanOf = (i: number) => (i === 0 ? -TILT : TILT);
    for (const i of losers) {
      const img = imgs[i];
      if (img) fadeLoserOut(img, pair?.[i].poster ?? "", leanOf(i));
    }
  };

  const answer = (outcome: "a" | "b" | "draw") => {
    if (!pair || !log) return;
    const [a, b] = pair;
    playExit(outcome);
    flush(); // the previous judgement lands before this one is buffered

    const judgement = newJudgement(a.id, b.id, outcome, "shuffle");
    const nextLog = [...log, judgement];

    // Online update — the cheap per-swipe path, applied to every answer. The
    // batch refit that erases its drift runs every REFIT_EVERY answers, off the
    // interaction path. It used to run only on entry, which meant a whole
    // session's learning surfaced in one jump when you next opened the mode.
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
    // The duel count first, so everything downstream sees it — including the
    // placement gate, which now reads it. Skipped on a cross-tier run for the
    // same reason the climb skips it: that comparison is not evidence about
    // either film's position inside its own tier.
    const counted = crossTier ? films : countDuel(films, [a, b]);
    const placed = crossTier
      ? counted
      : placeSettled(respreadFor(counted, [a, b], nextBeliefs, options.includeConfirmed), nextBeliefs);

    setPending({ judgement, films, pair });
    undoTimer.current = setTimeout(flush, UNDO_MS);

    setLog(nextLog);
    setBeliefs(nextBeliefs);
    setCount((n) => n + 1);
    onFilms(placed);
    // ── Does the anchor stay for another? ───────────────────────────────
    //
    // It is retired when it has earned its number, or when it has held for
    // ANCHOR_HOLD duels. The first is the ordinary case and the second is only
    // a backstop, since ANCHOR_HOLD is deliberately one more than the duels a
    // placement needs.
    //
    // `placed` is post-answer, so this reads the film as it is NOW — including
    // the placement this very duel may have just earned it.
    const heldFilm = anchor ? placed.find((f) => f.id === anchor.id) : undefined;
    const heldNow = anchor ? anchor.held + 1 : 0;
    // Retire on the TRANSITION into being placed, not on being placed.
    //
    // The first version tested `isPlaced(heldFilm)`, which is true from the
    // very first duel for a film that already had a number — and soft-locked
    // films stay in the pool precisely so the model can improve its own earlier
    // guess. So every one of them was retired after a single duel and the
    // second stage never got the anchor's help at all. Caught on screen: a
    // soft-locked film held for one duel while its neighbours held five.
    const justPlaced = !!heldFilm && !anchor?.wasPlaced && isPlaced(heldFilm);
    const retire = !anchor || !heldFilm || justPlaced || heldNow >= ANCHOR_HOLD;
    setAnchor(anchor && !retire ? { ...anchor, held: heldNow } : null);
    serve(placed, nextLog, nextBeliefs, retire ? undefined : anchor?.id);

    // Every twelfth answer, re-derive the whole model from the whole log. See
    // REFIT_EVERY: without this the session learns nothing it can act on until
    // the NEXT session opens, which is where the 173-films-in-one-tap came from.
    if (nextLog.length % REFIT_EVERY === 0) refit(nextLog, placed);

    // A bounded session ends itself. `count` is the state BEFORE this answer,
    // so the target is met when the increment reaches it.
    if (options.target && count + 1 >= options.target) {
      // Flush first: the pending judgement is written on a timer that the
      // session ending would otherwise outlive.
      flush();
      setEnded(true);
    }
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

  // ── What this mode is actually measuring ────────────────────────────
  //
  // It used to be `sessionProgress`: how many films in scope appear ANYWHERE
  // in the duel log. That number saturates after one duel per film, and one
  // duel per film is the point at which the model has worked out precisely
  // nothing. Simulated over a 120-film library: at 1.0 duels per film the
  // readout already says "0 films to go" while median confidence is 0.313 and
  // NOT ONE film has been placed. Reported from a phone as "it says 0 films to
  // go every time I come back", which is exactly right and is not a reset.
  //
  // What it measures now is how many the model has actually WORKED OUT — a
  // soft lock, granted when confidence clears `PLACE_CONFIDENCE`. That climbs
  // for as long as there is anything to learn, which is the whole span this
  // mode is played over.
  //
  // The pool excludes hard locks and nothing else, so it does not shrink under
  // the readout as films get placed: the denominator is stable and the
  // numerator climbs, which is what makes a bar mean something.
  const pool = poolFor(films, { scope: options.scope, includeConfirmed: options.includeConfirmed });
  const workedOut = pool.filter(isPlaced).length;

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
        title={count > 0 ? "Session done" : "Nothing changed"}
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

  // Two waits, named separately because they take noticeably different
  // amounts of time and the second is the long one. Reading the log is a
  // storage round trip; fitting the beliefs is the expensive part, and saying
  // so is better than a spinner that could mean anything.
  if (!log) {
    return <Centre>Reading the evidence…</Centre>;
  }

  if (!opened) {
    return <Centre>Working out what to ask you…</Centre>;
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
  // How many more duels this anchor has, whichever bound bites first.
  //
  // Unplaced: the placement gate, because that is what actually retires it.
  // Already placed and being refined: the hold cap, because the gate is behind
  // it. Never below 1 — a pill reading "0 MORE" over a duel you are being asked
  // to answer is a contradiction.
  const anchorLeft = Math.max(
    1,
    isPlaced(a)
      ? ANCHOR_HOLD - (anchor?.held ?? 0)
      : Math.min(PLACE_DUELS - (a.duels ?? 0), ANCHOR_HOLD - (anchor?.held ?? 0)),
  );
  const b = films.find((f) => f.id === servedB.id) ?? servedB;

  // A person run is a shuffle underneath, but labelling it FAST SHUFFLE hides
  // the only thing that makes it different from one.
  const person = options.scope.kind === "person" ? options.scope.name : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The same readout the climb shows, meaning the same thing. This mode grew
          its own first and the climb kept a single tier bar, so "how far through
          this am I" had two different answers depending on which game you were
          in. */}
      <RunStatus
        films={films}
        log={log ?? []}
        title={person ? person.toUpperCase() : "FAST SHUFFLE"}
        run={{
          // With a target the bar is the SESSION, which fills as you play.
          // Without one it is the pool, which on a big library barely moves —
          // honest, but not something to watch. See N11 in the register.
          done: options.target ? Math.min(count, options.target) : workedOut,
          total: options.target ?? pool.length,
        }}
        // The countdown below already says how many are left, so the default
        // opening line would print the same figure twice. This says what to do
        // instead, which is the more useful thing on a screen you have just
        // arrived at.
        idleLine="Pick the one you rate higher"
      />

      {/* The band the climb fills with its rank face, and this mode left empty.
          That hole is most of why this screen read as the older one: the duel
          has a live figure above the posters that changes on every answer, and
          here there was nothing between the progress bar and the artwork.

          What belongs there is the one number this mode can honestly report.
          It has no pile, no position and no end, so there is no rank to show —
          but there IS a shrinking set of films in scope that have never been
          compared, and every answer takes up to two off it. Same measurements
          as the climb's band, so the two screens share a skeleton rather than
          merely resembling each other. */}
      <div
        className="flex min-h-0 flex-shrink-[12] items-center justify-center overflow-hidden"
        style={{ height: 110, minHeight: 56 }}
      >
        {options.target ? (
          <Countdown
            n={Math.max(0, options.target - count)}
            label={options.target - count === 1 ? "duel left" : "duels left"}
          />
        ) : (
          <Countdown
            n={Math.max(0, pool.length - workedOut)}
            label={pool.length - workedOut === 1 ? "film to work out" : "films to work out"}
          />
        )}
      </div>
      <div
        ref={arenaRef}
        className="relative flex items-stretch justify-center gap-3 px-4"
        style={{ height: 356, flexShrink: 1, minHeight: 0 }}
      >
        {/* `side`, not `pick`: neither film is the pick here — they are peers and
            neither wears the gold — but the PAIR should still lean away from each
            other the way the climb's does. Without it both fell through to the
            same lean and sat parallel, which is what made this mode look unlike
            the compare screen it deliberately reuses. */}
        {/* The anchor's badge counts DOWN rather than saying "STAYING".
            The user's call, and it is the better of the two: a word tells you
            this film is here again, a number tells you how much longer — which
            is the thing you actually want to know when a film is in front of
            you for the fifth time.

            ── Why it counts to the PLACEMENT, not to the cap ──
            A film is retired from the anchor when it earns its number, and only
            falls back on ANCHOR_HOLD if the matchmaker somehow cannot get it
            there. So the honest number is whichever comes first, and for an
            unplaced film that is almost always the placement. Counting on the
            cap alone would show "3 more" and then rotate after one, which reads
            as a bug rather than as a film finishing early.

            A film that already HAS a number can still be anchored — soft locks
            stay in the pool so the model can improve on its own earlier guess —
            and for those the placement gate is already behind them, so the cap
            is the only bound left. Both branches mean the same thing on screen:
            how many more duels with this film.

            Shown from the SECOND duel. On the first there is nothing yet to
            have stayed from, and a countdown would be labelling a fact that has
            not happened. The badge slot is the climb's own, so this is the
            existing mechanism rather than new furniture on a protected screen. */}
        <PosterCard
          film={a}
          badge={anchor && anchor.id === a.id && anchor.held > 0 ? `${anchorLeft} MORE` : ""}
          side="left"
          pairId={a.id}
          onPick={() => answer("a")}
          onFlick={noop}
          onSink={noop}
          onInfo={onInfo}
        />
        <PosterCard film={b} badge="" side="right" pairId={a.id} onPick={() => answer("b")} onFlick={noop} onSink={noop} onInfo={onInfo} />
      </div>
      {/* Nearly all the slack above, matching the climb: the controls sit low,
          near the thumb that reaches for them, rather than floating mid-gap. */}
      <div style={{ flexGrow: 2.6 }} />

      {/* Text, not pills — the same change the climb's Draw/Undo/Done had, for
          the same reason. Boxes gave three secondary actions the weight of the
          two posters, on a screen whose whole subject is the artwork. The
          padding stays because it is the tap target. */}
      <div className="flex flex-shrink-0 items-center justify-center gap-1 px-5">
        <button onClick={() => answer("draw")} className={SHUFFLE_CONTROL}>
          Draw
        </button>
        {pending ? (
          <button onClick={undo} className={`${SHUFFLE_CONTROL} text-gold`}>
            Undo
          </button>
        ) : (
          <button onClick={leave} className={`${SHUFFLE_CONTROL} text-gold/70`}>
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
      <div style={{ flexGrow: 0.1 }} />
    </div>
  );
}

const noop = () => {};

// The countdown moved to Countdown.tsx when Rough Cut needed the same thing.
// The run readout lives in RunStatus.tsx, shared with the climb.

function Centre({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 text-center text-[13px] leading-relaxed text-dim">
      {children}
    </div>
  );
}
