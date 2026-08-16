"use client";

// The end of a session — and, more importantly, the way out of one.
//
// Both modes used to stop rather than finish. A tier ending put you on a text
// screen whose only exit was starting another tier; Fast Shuffle's Done simply
// dropped you back where you started with nothing said. In both cases the app
// went quiet at the exact moment you had just done the most work, and left you
// to go and find the result yourself.
//
// So this screen does two things and no more. It shows what you made — with the
// posters, because that is what the whole app is made of and a text list was
// never going to feel like a payoff. And it hands you somewhere to go: the list,
// where the result now lives, or back to ranking. It is a door, not a trophy
// cabinet.
//
// PROVISIONAL LOOK — the shape is settled, the styling has had no design pass.

import type { Film } from "@/lib/types";
import { isHard } from "@/lib/lock";

export function SessionEnd({
  title,
  blurb,
  films,
  stats,
  onList,
  onAgain,
  againLabel,
  extra,
}: {
  title: string;
  blurb: string;
  /** What was ranked, your favourite first. Shown as posters; only the top few fit. */
  films: Film[];
  /** Short "what it cost / what it made" pairs. Empty ones are dropped. */
  stats: { label: string; value: string }[];
  onList: () => void;
  onAgain: () => void;
  againLabel: string;
  /**
   * What to do NEXT, specific to the run that just ended.
   *
   * Above the two exits, because it is the thing most likely to be wanted and
   * both exits lead away from it. A tier run puts the remaining Rough Cut piles
   * here; without it, finishing one pile of three dead-ended on a screen whose
   * only routes were the list or the top-level mode sheet, and the other two
   * piles were four taps away through a menu.
   *
   * Optional and unstyled by this component. It is a slot, not a feature.
   */
  extra?: React.ReactNode;
}) {
  const top = films.slice(0, 5);

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-7 py-6 text-center">
      <div>
        <div className="font-display text-2xl leading-none tracking-wide text-gold">{title}</div>
        <p className="mt-2 font-serif text-[13px] italic leading-snug text-dim">{blurb}</p>
      </div>

      {/* The result, as the app renders everything else. Five is what fits on a
          phone without shrinking the posters into stamps. */}
      {top.length > 0 && (
        <div className="flex items-end justify-center gap-2">
          {top.map((f, i) => (
            <div key={f.id} className="flex flex-col items-center gap-1" style={{ width: 56 }}>
              {f.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={f.poster}
                  alt={f.title}
                  className="w-full rounded-md object-cover"
                  style={{ aspectRatio: "2/3", boxShadow: i === 0 ? "0 0 0 2px var(--gold)" : "0 4px 14px rgba(0,0,0,.5)" }}
                />
              ) : (
                <span className="w-full rounded-md bg-border" style={{ aspectRatio: "2/3" }} />
              )}
              <span
                className={`font-serif text-[13px] leading-none ${isHard(f) ? "font-bold text-gold" : "text-dim"}`}
              >
                {i + 1}
              </span>
            </div>
          ))}
        </div>
      )}

      {stats.length > 0 && (
        <div className="flex items-baseline justify-center gap-5">
          {stats.map((s) => (
            <span key={s.label} className="text-[11px] text-dim">
              <b className="text-text-hi">{s.value}</b> {s.label}
            </span>
          ))}
        </div>
      )}

      {extra}

      {/* The way out. The list is primary because that is where what you just
          made now lives — the old screen's only exit was starting more work. */}
      <div className="flex w-full max-w-[260px] flex-col gap-2">
        <button
          onClick={onList}
          className="w-full rounded-full py-3 text-sm font-extrabold tracking-wide active:scale-95"
          style={{ color: "#1c1405", background: "var(--gold)" }}
        >
          See your list
        </button>
        <button
          onClick={onAgain}
          className="w-full rounded-full border border-border py-2.5 text-xs font-bold tracking-wide text-dim active:scale-95"
        >
          {againLabel}
        </button>
      </div>
    </div>
  );
}
