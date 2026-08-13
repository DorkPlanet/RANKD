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
// PROVISIONAL LOOK — the mechanic is the point; the styling has had no design
// pass and is not meant to read as finished.

import { useRef, useState } from "react";

import { applyRoughCut, BUCKETS, roughCutPool, type Bucket } from "@/lib/roughCut";
import { starsFor, type Rating } from "@/lib/tiers";
import type { Film } from "@/lib/types";
import { Header } from "./DuelScreen";

/** How far a pointer must travel before it counts as a flick rather than a tap. */
const FLICK_PX = 44;

const TARGET =
  "flex-1 py-3 text-[10px] font-extrabold uppercase tracking-[0.16em] transition-colors active:scale-95";

export default function RoughCut({
  films,
  tier,
  onFilms,
  onExit,
  onSettings,
  onTrophies,
}: {
  films: Film[];
  tier: Rating;
  onFilms: (films: Film[]) => void;
  onExit: () => void;
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
  const start = useRef<{ x: number; y: number } | null>(null);

  const film = pool[at];
  const done = at >= pool.length;

  // Applied against the CURRENT library rather than the one captured at mount,
  // so anything the credits sweep filled in while you were placing survives.
  const commit = (picked: Map<string, Bucket>) => {
    onFilms(applyRoughCut(films, tier, picked));
    onExit();
  };

  const place = (bucket: Bucket) => {
    if (!film) return;
    const next = new Map(choices).set(film.id, bucket);
    setChoices(next);
    setAt((i) => i + 1);
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
          <p className="font-display text-3xl tracking-wide text-gold">{choices.size} placed</p>
          <p className="mt-3 text-[12px] leading-relaxed text-dim">
            {starsFor(tier)} is roughly in order now. Ranking it properly from here is a fraction of
            the work — the climb starts from what you just decided rather than from nothing.
          </p>

          {/* Going again on ONE pile is the answer to "I can see clumps that
              belong together but I can't place the whole tier". The sub-band
              maths already composes (see lib/roughCut.ts), so a second pass over
              a third refines it to ninths and keeps everything the first pass
              established. */}
          <div className="mt-7 w-full max-w-[300px]">
            <p className="mb-2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-dim">
              Go again on one pile
            </p>
            <div className="flex gap-2">
              {counts.map(({ bucket, n }) => (
                <button
                  key={bucket}
                  disabled={n < 2}
                  onClick={() => refine(bucket)}
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
            className="mt-7 rounded-xl border border-gold/50 px-8 py-3 text-xs font-bold text-gold active:scale-[0.98]"
          >
            Keep it
          </button>
          <button
            onClick={onExit}
            className="mt-2 px-6 py-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-dim active:scale-95"
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
        <span className="flex h-1 w-full overflow-hidden rounded-full bg-border">
          <span
            className="h-full transition-[width] duration-300"
            style={{ width: `${(at / pool.length) * 100}%`, background: "var(--accent)" }}
          />
        </span>
        <p className="mt-2.5 text-center text-[9px] font-extrabold uppercase tracking-[0.22em] text-dim tabular-nums">
          {at + 1} of {pool.length}
        </p>
      </div>

      <div style={{ flexGrow: 1 }} />

      {/* One film, centred. `key` on the id so a new film cannot inherit the
          previous one's transition mid-flight. */}
      <div
        key={film.id}
        className="flex shrink flex-col items-center px-8"
        onPointerDown={(e) => (start.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const from = start.current;
          start.current = null;
          if (!from) return;
          const dy = e.clientY - from.y;
          // The same gestures the duel screen uses: up is better, down is worse.
          if (Math.abs(dy) > FLICK_PX) place(dy < 0 ? "top" : "bottom");
        }}
        style={{ minHeight: 0, touchAction: "pan-x" }}
      >
        <span
          className="mb-3 line-clamp-2 text-center font-display font-normal leading-[1.15] tracking-[0.02em] text-text-hi"
          style={{ fontSize: film.title.length > 44 ? 22 : film.title.length > 28 ? 26 : 32 }}
        >
          {film.title}
        </span>
        <div
          className="overflow-hidden rounded-xl bg-surface"
          style={{ aspectRatio: "2 / 3", maxHeight: 300, boxShadow: "0 8px 26px rgba(0,0,0,0.55)" }}
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
          every decision made in the first minute. */}
      <div className="mx-auto flex w-full max-w-[330px] flex-shrink-0 items-center px-5">
        <button onClick={() => place("bottom")} className={`${TARGET} text-dim`}>
          Lower
        </button>
        <button onClick={() => place("middle")} className={`${TARGET} text-text-hi`}>
          Middle
        </button>
        <button onClick={() => place("top")} className={`${TARGET} text-gold`}>
          Upper
        </button>
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
