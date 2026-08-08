"use client";

// The one progress readout, for every mode.
//
// The climb and Fast Shuffle grew their own separately: the climb had a single
// bar reporting a tier, Fast Shuffle had three reporting the library. Which
// meant the same question — how far through this am I — was answered in two
// different shapes depending on which game you happened to be in, and a person
// run, started from outside both, briefly showed you both at once.
//
// So there is one component and three bars, always in the same order and always
// meaning the same thing:
//
//   THIS RUN  what you are doing now, whatever "now" is — a tier, a shuffle
//             scope, a filmography. The only bar whose denominator changes.
//   SHUFFLED  how much of the whole library has ever been compared.
//   LOCKED    how much of it has a position, and who decided: gold for what you
//             committed, quieter for what the evidence placed.
//
// The bottom two are library-wide in every mode on purpose. They are the slow
// numbers — the ones that make an hour of ranking visible — and rescoping them
// per run would make them lurch every time you changed what you were doing.
//
// PROVISIONAL LOOK — the shape is settled, the styling has had no design pass.

import { libraryProgress, pct, type LibraryProgress } from "@/lib/progress";
import type { Judgement } from "@/lib/log";
import type { Film } from "@/lib/types";

export function RunBars({
  films,
  log,
  /** What this run is working through, and out of how many. */
  run,
  /** Left-hand control — the tier stars in the climb, nothing in a shuffle. */
  lead,
  /** Centre label: the mode's name. */
  title,
}: {
  films: Film[];
  log: readonly Judgement[];
  run: { label: string; done: number; total: number };
  lead?: React.ReactNode;
  title: string;
}) {
  const p: LibraryProgress = libraryProgress(films, log);

  return (
    <div className="flex-shrink-0 px-5">
      {/* mt-11 clears the header's 44px feather so the first row doesn't sit
          inside the fade. */}
      <div className="mx-auto mt-11 max-w-[330px]">
        {/* Anchored rather than flowed, so the centre label sits on the true
            centre whatever sits beside it.
            No count here: the THIS RUN bar directly below states it, and the old
            layout said "0 placed · 134 to go" on this line and then drew a bar
            meaning the same thing — two readings of one number, which is how you
            end up with them disagreeing. */}
        <div className="relative mb-2 flex items-baseline">
          <span className="shrink-0">{lead}</span>
          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-extrabold tracking-[0.1em] text-dim">
            {title}
          </span>
        </div>

        <Bar
          label={run.label}
          value={`${run.done} of ${run.total}`}
          segments={[{ pct: pct(run.done, run.total), colour: "var(--accent)" }]}
        />
        <Bar
          label="Shuffled"
          value={`${p.shuffled} of ${p.total}`}
          segments={[
            { pct: pct(p.shuffled, p.total), colour: "color-mix(in srgb, var(--accent) 55%, var(--border))" },
          ]}
        />
        <Bar
          label="Locked"
          value={p.soft > 0 ? `${p.hard} + ${p.soft}` : `${p.hard} of ${p.total}`}
          segments={[
            { pct: pct(p.hard, p.total), colour: "var(--gold)" },
            // Distinct from the hard segment without competing with it — the
            // model's placements count, but they are not your decisions.
            { pct: pct(p.soft, p.total), colour: "color-mix(in srgb, var(--gold) 38%, var(--border))" },
          ]}
        />
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  segments,
}: {
  label: string;
  value: string;
  segments: { pct: number; colour: string }[];
}) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[9px] font-extrabold tracking-[0.12em] text-dim">{label.toUpperCase()}</span>
        <span className="text-[10px] text-dim">{value}</span>
      </div>
      <div className="flex h-1 overflow-hidden rounded-full bg-border">
        {segments.map((s, i) => (
          <div
            key={i}
            className="h-full transition-[width] duration-500"
            style={{ width: `${s.pct}%`, background: s.colour }}
          />
        ))}
      </div>
    </div>
  );
}
