"use client";

// Rough Cut — dealing a tier into three piles, one film at a time.
//
// The whole screen is one question asked repeatedly: upper, middle or lower
// third of this tier? No opponent, no climb, no confirm. See lib/roughCut.ts for
// why this exists and why it writes scores rather than judgements.
//
// It is deliberately the FASTEST surface in the app. A duel asks you to weigh
// two things; this asks you to place one, which is a much cheaper thought — so
// the layout gives the artwork the room and puts three large targets under it,
// and the flick gestures from the duel screen work here too for anyone already
// holding that muscle memory.
//
// ── What the motion is for ─────────────────────────────────────────────────
//
// This shipped with none, and next to the duel screen it read as an older app:
// there the cards float, tilt, fly into the climbing seat and get thrown off the
// edge, while here a poster was simply replaced by the next poster.
//
// The fix is not decoration. You answer this screen roughly once a second for
// fifty films, and at that rate the only thing that keeps a session from feeling
// like data entry is being able to FEEL each answer land without reading
// anything. So: the card follows your thumb and leans as it goes, the target you
// are aimed at lifts while the other two recede, and the placed film flies into
// the pile it was filed under. Every duration here is shorter than the duel's
// equivalent, because this surface has to stay the fastest one in the app.

import { useEffect, useRef, useState } from "react";

import { applyRoughCut, BUCKETS, roughCutPool, type Bucket } from "@/lib/roughCut";
import { starsFor, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";
import { Header } from "./DuelScreen";
import { flyPosterTo } from "./PosterCard";

/** How far a pointer must travel before it counts as a flick rather than a tap. */
const FLICK_PX = 44;
/**
 * How long the card is left flying before the queue advances.
 *
 * Shorter than the flight itself (380ms), on the same reasoning as the duel's
 * `flyPosterAcross`: the state commits UNDER the clone while it is still moving,
 * so the next film is already settling in behind rather than waiting for the
 * last one to finish leaving. Waiting the full duration would put a visible
 * pause between every answer, which is the one thing this screen cannot afford.
 */
const FILE_MS = 150;
/** How far a drag can pull the card, so it never leaves its own space. */
const DRAG_CAP = 90;

const TARGET =
  "rc-target flex-1 py-3 text-[10px] font-extrabold uppercase tracking-[0.16em] active:scale-95";

export default function RoughCut({
  films,
  tier,
  onFilms,
  onExit,
  onRankPile,
  onSettings,
  onTrophies,
}: {
  films: Film[];
  tier: Rating;
  onFilms: (films: Film[]) => void;
  onExit: () => void;
  /** Apply the pass and start a King of the Hill run over just this pile. */
  onRankPile: (films: Film[], ids: string[]) => void;
  onSettings: () => void;
  onTrophies: () => void;
}) {
  // The pile is fixed for the duration of a pass. Re-deriving it as scores
  // change would reorder the queue under the user mid-pass — they would see
  // films they had already placed come back around. `refine` replaces it
  // wholesale to start a second pass over one pile.
  const [pass, setPass] = useState<{ films: Film[]; n: number }>(() => ({
    films: roughCutPool(films, tier),
    n: 1,
  }));
  const pool = pass.films;
  const [at, setAt] = useState(0);
  const [choices, setChoices] = useState<Map<string, Bucket>>(new Map());
  const [next, setNext] = useState<"rank" | "split">("rank");
  const start = useRef<{ x: number; y: number } | null>(null);

  // `drag` is how far the thumb has pulled the card; `aimed` is the bucket it
  // would land in if released now. Both null when idle, so nothing moves and all
  // three targets read equally. Following the thumb is what turns the flick from
  // a shortcut you must remember into a gesture you can see working.
  const [drag, setDrag] = useState<number | null>(null);
  const [aimed, setAimed] = useState<Bucket | null>(null);
  // Bumped on every placement, purely as an animation key for the progress bar.
  const [beat, setBeat] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  // The three targets, so a placed card can be sent to the one it was filed
  // under. Measured at animation time rather than stored as coordinates, which
  // would go stale the moment the layout moved.
  const targets = useRef<Partial<Record<Bucket, HTMLButtonElement | null>>>({});

  const film = pool[at];
  const done = at >= pool.length;

  // Applied against the CURRENT library rather than the one captured at mount,
  // so anything the credits sweep filled in while you were placing survives.
  const commit = (picked: Map<string, Bucket>) => {
    onFilms(applyRoughCut(films, tier, picked));
    onExit();
  };

  /**
   * File the film on screen into one of the three piles.
   *
   * The state change is the same three lines it always was; everything around it
   * is the animation. The clone is spawned BEFORE `setAt` moves the queue on,
   * because the moment it does React swaps the poster and there is nothing left
   * to take a picture of.
   */
  const place = (bucket: Bucket) => {
    if (!film) return;

    const poster = cardRef.current?.querySelector("img");
    const target = targets.current[bucket];
    if (poster && target) flyPosterTo(poster, target, film.poster ?? "");

    const advance = () => {
      setChoices((c) => new Map(c).set(film.id, bucket));
      setAt((i) => i + 1);
      setBeat((b) => b + 1);
      setDrag(null);
      setAimed(null);
    };

    // Commit under the clone while it is still moving — but only when there was
    // a clone to hide behind. With no artwork the flight never happened, so
    // waiting would just be a delay before nothing.
    if (poster && target) setTimeout(advance, FILE_MS);
    else advance();
  };

  /**
   * Apply this pass, then climb one of its piles.
   *
   * The applied library is handed OUT rather than read back from the prop: the
   * parent's state update has not landed by the time this returns, so a caller
   * reading `state.films` would start the run against the pre-pass scores and
   * throw the whole pass away.
   */
  const rankPile = (bucket: Bucket) => {
    const applied = applyRoughCut(films, tier, choices);
    const ids = [...choices.entries()].filter(([, b]) => b === bucket).map(([id]) => id);
    onRankPile(applied, ids);
  };

  /**
   * Apply this pass, then start another over one of its piles.
   *
   * The scores have to LAND before the next pass reads them — `applyRoughCut`
   * spreads films across a sub-band, and the second pass narrows within that
   * band. Running it against the pre-pass library would re-derive from the flat
   * order and throw the first pass away.
   */
  const refine = (bucket: Bucket) => {
    const applied = applyRoughCut(films, tier, choices);
    onFilms(applied);
    const keep = new Set(
      [...choices.entries()].filter(([, b]) => b === bucket).map(([id]) => id),
    );
    setPass({ films: applied.filter((f) => keep.has(f.id)), n: pass.n + 1 });
    setChoices(new Map());
    setAt(0);
  };

  const undo = () => {
    if (at === 0) return;
    const back = at - 1;
    const next = new Map(choices);
    next.delete(pool[back].id);
    setChoices(next);
    setAt(back);
  };

  if (done) {
    const counts = BUCKETS.map((b) => ({
      bucket: b,
      n: [...choices.values()].filter((v) => v === b).length,
    }));
    return (
      <main className="relative flex h-dvh flex-col overflow-hidden select-none">
        <Header onSettings={onSettings} onTrophies={onTrophies} />
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          {/* The number counts up rather than appearing. It is the one figure
              this screen exists to report, and a count-up is the cheapest way to
              make a total read as something that was accumulated. */}
          <p className="rc-rise font-display text-3xl tracking-wide text-gold" style={{ "--i": 0 } as React.CSSProperties}>
            <CountUp to={choices.size} /> placed
          </p>
          <p className="rc-rise mt-3 text-[12px] leading-relaxed text-dim" style={{ "--i": 1 } as React.CSSProperties}>
            {starsFor(tier)} is roughly in order now. Ranking it properly from here is a fraction of
            the work — the climb starts from what you just decided rather than from nothing.
          </p>

          {/* Taking ONE pile forward is the natural next move, and dropping back
              into the whole tier is not — you have just decided these films
              belong together, so the run that follows should be about them.
              `startRun` has always accepted an arbitrary pile (`only`), and it
              is independent of `crossTier`, so a pile run still writes scores
              and locks like any other climb.

              RANK or SPLIT, chosen first, so the three piles are one row of
              buttons rather than six. Split is the answer when a pile is still
              too big to duel; rank is the answer when it isn't. */}
          <div className="rc-rise mt-7 w-full max-w-[300px]" style={{ "--i": 2 } as React.CSSProperties}>
            <div className="mb-2 flex gap-1">
              {(["rank", "split"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setNext(m)}
                  className={`flex-1 rounded-lg border py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] active:scale-95 ${
                    next === m ? "border-gold text-gold" : "border-border text-dim"
                  }`}
                >
                  {m === "rank" ? "Rank a pile" : "Split again"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {counts.map(({ bucket, n }) => (
                <button
                  key={bucket}
                  disabled={n < 2}
                  onClick={() => (next === "rank" ? rankPile(bucket) : refine(bucket))}
                  className="flex-1 rounded-xl border border-border py-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-text-hi active:scale-[0.98] disabled:opacity-30"
                >
                  {bucket === "top" ? "Upper" : bucket === "middle" ? "Middle" : "Lower"}
                  <span className="ml-1.5 text-dim tabular-nums">{n}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => commit(choices)}
            className="rc-rise mt-7 rounded-xl border border-gold/50 px-8 py-3 text-xs font-bold text-gold active:scale-[0.98]"
            style={{ "--i": 3 } as React.CSSProperties}
          >
            Keep it
          </button>
          <button
            onClick={onExit}
            className="rc-rise mt-2 px-6 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim active:scale-95"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            Throw it away
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header onSettings={onSettings} onTrophies={onTrophies} />

      <div className="mx-auto mt-11 w-full max-w-[330px] flex-shrink-0 px-5">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className="text-base text-gold">{starsFor(tier)}</span>
          <span className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-dim">
            Rough cut{pass.n > 1 ? ` · pass ${pass.n}` : ""}
          </span>
        </div>
        {/* `key={beat}` re-mounts the fill on every placement, which is what
            replays the bloom — a CSS animation that has already run does not
            restart because a style changed. Same mechanism as the duel screen's
            arrival veil, and for the same reason. */}
        <span className="flex h-1 w-full overflow-hidden rounded-full bg-border">
          <span
            key={beat}
            className="rc-bar-pulse h-full transition-[width] duration-300"
            style={{ width: `${(at / pool.length) * 100}%`, background: "var(--accent)" }}
          />
        </span>
        <p className="mt-2.5 text-center text-[9px] font-extrabold uppercase tracking-[0.22em] text-dim tabular-nums">
          {at + 1} of {pool.length}
        </p>
      </div>

      <div style={{ flexGrow: 1 }} />

      {/* One film, centred. `key` on the id so a new film cannot inherit the
          previous one's transition mid-flight — and so `rc-card` replays its
          entrance for every film rather than only the first. */}
      <div
        ref={cardRef}
        key={film.id}
        className="rc-card flex shrink flex-col items-center px-8"
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY };
          // Capture, so a drag that leaves the card still reports its release
          // here. Same reason `PosterCard` does it: without this the gesture is
          // lost the moment the thumb crosses the poster's edge.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // best-effort — the gesture still works, it just cannot leave the card
          }
        }}
        onPointerMove={(e) => {
          const from = start.current;
          if (!from) return;
          const dy = e.clientY - from.y;
          // Resisted rather than followed 1:1, and capped: the card is reporting
          // the gesture, not being dragged across the screen.
          setDrag(Math.max(-DRAG_CAP, Math.min(DRAG_CAP, dy * 0.55)));
          setAimed(Math.abs(dy) > FLICK_PX ? (dy < 0 ? "top" : "bottom") : null);
        }}
        onPointerUp={(e) => {
          const from = start.current;
          start.current = null;
          if (!from) {
            setDrag(null);
            setAimed(null);
            return;
          }
          const dy = e.clientY - from.y;
          // The same gestures the duel screen uses: up is better, down is worse.
          if (Math.abs(dy) > FLICK_PX) {
            place(dy < 0 ? "top" : "bottom");
            return;
          }
          // Short of the threshold, so it springs back rather than placing.
          setDrag(null);
          setAimed(null);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(null);
          setAimed(null);
        }}
        style={{ minHeight: 0, touchAction: "pan-x" }}
      >
        <span
          className="mb-3 line-clamp-2 text-center font-display font-normal leading-[1.15] tracking-[0.02em] text-text-hi"
          style={{ fontSize: film.title.length > 44 ? 22 : film.title.length > 28 ? 26 : 32 }}
        >
          {film.title}
        </span>
        {/* The lean is derived from the drag rather than fixed, so the card
            banks INTO the direction it is being sent — up tips it back, down
            tips it forward. The transition is dropped while dragging so the
            poster tracks the thumb exactly, and restored on release so it
            springs back instead of snapping. */}
        <div
          className="overflow-hidden rounded-xl bg-surface"
          style={{
            aspectRatio: "2 / 3",
            maxHeight: 300,
            boxShadow: "0 8px 26px rgba(0,0,0,0.55)",
            transform: drag ? `translateY(${drag}px) rotate(${drag * 0.045}deg)` : undefined,
            transition: drag === null ? "transform 0.28s cubic-bezier(.2,.8,.3,1)" : "none",
          }}
        >
          {film.poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={film.poster} alt={film.title} className="h-full w-full object-cover" draggable={false} />
          )}
        </div>
        {film.year && <span className="mt-2 text-[11px] text-dim">{film.year}</span>}
      </div>

      <div style={{ flexGrow: 1.4 }} />

      {/* Lowest on the left, rising to the right — the same direction the scale
          runs everywhere else. It read the other way round at first, which put
          the best pile where the eye expects the worst and quietly inverted
          every decision made in the first minute.

          While a drag is live the aimed target lifts and the other two recede,
          so the gesture's outcome is legible BEFORE you commit to it. Nothing
          moves at all when `aimed` is null, which is every moment you are not
          mid-drag — the row is furniture the rest of the time. */}
      <div className="mx-auto flex w-full max-w-[330px] flex-shrink-0 items-center px-5">
        {(
          [
            { bucket: "bottom", label: "Lower", tone: "text-dim" },
            { bucket: "middle", label: "Middle", tone: "text-text-hi" },
            { bucket: "top", label: "Upper", tone: "text-gold" },
          ] as const
        ).map(({ bucket, label, tone }) => (
          <button
            key={bucket}
            ref={(el) => {
              targets.current[bucket] = el;
            }}
            onClick={() => place(bucket)}
            className={`${TARGET} ${aimed === bucket ? `rc-target-armed text-gold` : aimed ? `rc-target-idle ${tone}` : tone}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-shrink-0 items-center justify-center gap-1 pb-6">
        <button
          onClick={undo}
          disabled={at === 0}
          className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim active:scale-95 disabled:opacity-30"
        >
          Undo
        </button>
        {/* Leaving keeps what you placed. A pass abandoned two-thirds through is
            still two-thirds of a sorted tier, and throwing that away to punish
            an interruption would be the wrong lesson. */}
        <button
          onClick={() => commit(choices)}
          className="px-4 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-gold/70 active:scale-95"
        >
          Done
        </button>
      </div>
    </main>
  );
}

/**
 * A number that arrives by counting rather than by appearing.
 *
 * Rough Cut's summary reports one figure and it is the whole point of the
 * screen, so it is worth the few hundred milliseconds it takes to read as an
 * accumulation. Nothing else in the app counts up — a total that animates
 * everywhere is a tic, and this is the only place the number IS the reward.
 *
 * Driven by `requestAnimationFrame` rather than a per-tick timer so it costs one
 * frame callback and lands exactly on `to` however long a frame took. Reduced
 * motion skips straight to the answer: a count-up is pure movement, so there is
 * nothing left of it worth keeping once movement is declined.
 */
function CountUp({ to, ms = 520 }: { to: number; ms?: number }) {
  // The decision is taken HERE, above the animating component, rather than as a
  // branch inside its effect. An effect that has to setState on the way out to
  // correct its own initial value is a cascading render — and the whole point of
  // the reduced-motion case is that nothing should move, including the number
  // jumping from 0 to its answer on the second frame. `Ticker` is mounted only
  // when there is genuinely something to animate, so its effect has one job.
  const still =
    to <= 0 ||
    (typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  // `tabular-nums` so the width does not jitter as the digits change.
  if (still) return <span className="tabular-nums">{to}</span>;
  // Keyed by the target, so a changed total restarts the count rather than
  // leaving the old one stranded — which is also what lets the effect below
  // depend on nothing.
  return <Ticker key={to} to={to} ms={ms} />;
}

function Ticker({ to, ms }: { to: number; ms: number }) {
  const [n, setN] = useState(0);

  useEffect(() => {
    let raf = 0;
    const started = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ms);
      // Ease out, so it sprints and then settles rather than crawling to the end.
      setN(Math.round(to * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);

  return <span className="tabular-nums">{n}</span>;
}
