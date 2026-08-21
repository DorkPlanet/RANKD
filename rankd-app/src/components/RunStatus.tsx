"use client";

// The one progress readout, for every mode.
//
// ── Why this stopped being a table ─────────────────────────────────────────
//
// It was three rows of label column, track, value column. That is the shape of
// a settings screen, and it sat directly above `RankFace` — which is centred
// typography, one gold numeral against one grey, no columns at all. Two visual
// languages on one screen, with the tabular one on top, and the whole zone read
// (in the user's words) "a little menu-like".
//
// So the columns are gone. One unlabelled track, one centred line beneath it, in
// the same small-caps treatment `RankFace` uses for its own `of 134`. The track
// shows the SHAPE of the run; `RankFace` below owns the NUMBERS. Previously both
// stated the same denominator 100px apart, which is exactly the trap the old
// comment here warned about — two readings of one number is how you end up with
// them disagreeing.
//
// ── Why the library bars left ──────────────────────────────────────────────
//
// SHUFFLED and LOCKED measured the whole library. At 861 films one duel moves a
// 204px track by a quarter of a pixel, so they could not respond to anything you
// did — a progress bar that is physically incapable of moving is furniture. They
// belong where you go to reflect, not where you play: `ListScreen`'s header
// carries the library-scale figures, and as of 21 Aug it breaks them into the
// three states rather than rolling them up — "1 you settled · 332 Rankd placed
// · 532 un-rnkd" over a plain "865 films".
//
// What replaces them answers to the duel you just fought. See `sessionStats`.

import { useState } from "react";

import { pct, sessionStats } from "@/lib/progress";
import { isHard } from "@/lib/lock";
import type { Judgement } from "@/lib/log";
import type { Film } from "@/lib/types";

// ── What a "sitting" is, and where its baseline lives ──────────────────────
//
// sessionStorage, which is per-TAB and dies with it. That is a sitting almost
// exactly, and it is the only store with the right lifetime: module-level
// variables are read during render (the React compiler rejects that, rightly),
// and component state resets on remount — `RunStatus` unmounts every time you look
// at your list, so a baseline in state would silently reset "6 settled" to "0"
// while the user watched.
//
// Read through a `useState` initialiser so it runs once per mount rather than
// once per render — the same trick `DuelScreen` uses for the strip preference.
const SITTING_KEY = "rankd-sitting-v1";

interface Sitting {
  start: number;
  /** Hard locks at the moment the sitting began, so "settled" can be a delta. */
  hard: number;
}

function openSitting(hardNow: number): Sitting {
  const fresh: Sitting = { start: Date.now(), hard: hardNow };
  if (typeof window === "undefined") return fresh;
  try {
    const raw = sessionStorage.getItem(SITTING_KEY);
    if (raw) return JSON.parse(raw) as Sitting;
    sessionStorage.setItem(SITTING_KEY, JSON.stringify(fresh));
  } catch {
    // Storage disabled. The sitting becomes "since this mount", which is wrong
    // only in the mild sense that the counts restart when you change screens.
  }
  return fresh;
}

export function RunStatus({
  films,
  log,
  /** What this run is working through, and out of how many. */
  run,
  /** Left-hand control — the tier stars in the climb, nothing in a shuffle. */
  lead,
  /** Centre label: the mode's name. */
  title,
  idleLine,
}: {
  films: Film[];
  log: readonly Judgement[];
  run: { done: number; total: number };
  lead?: React.ReactNode;
  title: string;
  /**
   * What to say before the first duel of a sitting, in place of "N to rank".
   *
   * Fast Shuffle needs it because its countdown band states that exact figure
   * 40px below — and two readings of one number is precisely the trap the note
   * at the top of this file was written about. The climb passes nothing and
   * keeps the default, since its rank face reports a position rather than a
   * remainder and the two do not collide.
   */
  idleLine?: string;
}) {
  const hardNow = films.filter(isHard).length;
  const [sitting] = useState(() => openSitting(hardNow));
  const stats = sessionStats(log, sitting.start, hardNow, sitting.hard);

  // Never a zero. "0 DUELS · 0 SETTLED" is a scoreboard for someone who has not
  // played yet, which is the opposite of inviting — so before the first duel the
  // line says what there is to do instead of what has not been done.
  const line =
    stats.duels === 0
      ? (idleLine ?? `${Math.max(0, run.total - run.done)} to rank`)
      : stats.settled === 0
        ? `${stats.duels} ${stats.duels === 1 ? "duel" : "duels"} this sitting`
        : `${stats.duels} ${stats.duels === 1 ? "duel" : "duels"} · ${stats.settled} settled`;

  return (
    <div className="flex-shrink-0 px-5">
      {/* mt-11 clears the header's 44px feather so the first row doesn't sit
          inside the fade. */}
      <div className="mx-auto mt-11 max-w-[330px]">
        {/* Anchored rather than flowed, so the centre label sits on the true
            centre whatever sits beside it.

            `min-h-5` is not decoration. The title is absolutely positioned and
            the only thing in normal flow is `lead` — which Fast Shuffle does not
            pass, having no tier to name. The row therefore collapsed to zero
            height there and the title rendered straight over the track below it,
            which is exactly what the screenshot showed. The climb escaped it
            only because its stars happened to give the row a line box. */}
        <div className="relative mb-2.5 flex min-h-5 items-baseline">
          <span className="shrink-0">{lead}</span>
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-extrabold tracking-[0.1em] text-dim">
            {title}
          </span>
        </div>

        {/* Full width and unlabelled. The only bar left is the only one that
            visibly moves: at 134 films in a tier it advances ~1.5px per duel,
            where the library bars managed a quarter of a pixel. */}
        <span className="flex h-1 w-full overflow-hidden rounded-full bg-border">
          <span
            className="h-full transition-[width] duration-500"
            style={{ width: `${pct(run.done, run.total)}%`, background: "var(--accent)" }}
          />
        </span>

        {/* Same treatment as RankFace's "of 134" — one type language for the
            whole zone rather than a table above a title. */}
        <p className="mt-2.5 text-center text-[9px] font-extrabold uppercase tracking-[0.22em] text-dim tabular-nums">
          {line}
        </p>
      </div>
    </div>
  );
}
