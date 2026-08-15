"use client";

// A number that goes down, and is seen going down.
//
// ── Why this is shared rather than written twice ───────────────────────────
//
// Fast Shuffle and Rough Cut both have a shrinking pile and no other live
// figure on screen. They are the two modes with no rank to report — the climb
// has its rank face, and these had a small-caps line of the kind you read once
// and then stop seeing. One component means they cannot drift into two
// slightly different treatments of the same idea, which is how the progress
// readouts ended up disagreeing before (see the note atop RunStatus).
//
// ── Why it rolls ───────────────────────────────────────────────────────────
//
// A figure replaced in place is read as a label. This one is the only thing
// that moves as a CONSEQUENCE of the answer just given, so it has to be seen
// moving or it may as well be static text. The outgoing number leaves upward
// and the incoming one arrives from below: an odometer counting down, which is
// what it is.
//
// The previous value is held in STATE for the length of the roll rather than
// read from a ref during render. React unmounts the old span the instant the
// prop changes, and there is nothing to animate out if it is already gone.
//
// A step is not always 1 — a Fast Shuffle duel can retire two films at once —
// so nothing here assumes a single decrement.

import { useEffect, useRef, useState } from "react";

import { Hairline } from "./Icons";

/** Matches `.sd-roll-in` / `.sd-roll-out` in globals.css. */
const ROLL_MS = 380;

const DIGIT =
  "absolute inset-0 flex items-center justify-center font-display leading-none tracking-wide text-gold tabular-nums";

export function Countdown({
  n,
  label,
  size = 32,
  tight,
}: {
  n: number;
  /** Small caps under the number. Already singular/plural as the caller wants it. */
  label: string;
  /** Font size of the digits. The rolling window is sized from it. */
  size?: number;
  /**
   * Pull the label up against the number and drop the hairlines.
   *
   * Rough Cut needs this and Fast Shuffle does not, and the difference is what
   * else is on the screen. There the countdown sits in a band of its own with
   * the posters well clear of it, so the rules give it somewhere to sit. Here it
   * is stacked directly above the artwork and every pixel it takes comes out of
   * the poster — which is the thing the screen is actually for.
   */
  tight?: boolean;
}) {
  const [prev, setPrev] = useState<number | null>(null);
  const last = useRef(n);

  useEffect(() => {
    if (last.current === n) return;
    setPrev(last.current);
    last.current = n;
    const t = setTimeout(() => setPrev(null), ROLL_MS);
    return () => clearTimeout(t);
  }, [n]);

  return (
    <div className={`flex flex-col items-center ${tight ? "gap-0.5" : "gap-2.5"}`}>
      <div className="flex items-center gap-4">
        {!tight && <Hairline />}
        {/* Fixed width and clipped, so the digits roll THROUGH a window rather
            than the row jumping when the count crosses a power of ten.
            `tabular-nums` for the same reason it is on the climb's rank face. */}
        {/* 1.06 was the window height and it clipped nothing, but it also left
            a sliver of dead space under the digits that the label then had to
            clear. 0.94 crops to the cap height of the display face, which is
            all these glyphs occupy — the numerals have no descender. */}
        <span
          className="relative block min-w-[4ch] overflow-hidden"
          style={{ height: Math.round(size * (tight ? 0.94 : 1.06)) }}
        >
          {prev !== null && (
            <span key={`out-${prev}`} className={`${DIGIT} sd-roll-out`} style={{ fontSize: size }}>
              {prev.toLocaleString()}
            </span>
          )}
          <span
            key={n}
            className={`${DIGIT} ${prev !== null ? "sd-roll-in" : ""}`}
            style={{ fontSize: size }}
          >
            {n.toLocaleString()}
          </span>
        </span>
        {!tight && <Hairline flip />}
      </div>
      <span className="text-[9px] font-extrabold uppercase tracking-[0.22em] text-dim">{label}</span>
    </div>
  );
}
