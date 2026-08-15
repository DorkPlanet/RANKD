"use client";

// The moment the app opens.
//
// NOT a loading screen. The library comes off localStorage in under 92ms, so
// there is no wait to cover: this is time deliberately spent, and what it buys
// is the only moment the brand mark is ever the whole screen.
//
// The hold is a FLOOR, not a duration. AppShell keeps this mounted until the
// hold has elapsed AND the library is in hand, so the length never depends on
// how fast the phone is — a splash whose duration is a symptom rather than a
// decision is a bug.

import { BARS } from "@/lib/brand";

/** How long the assembled mark holds. The user approved ~600ms, deliberately. */
export const SPLASH_HOLD_MS = 620;
/** The fade out. Not part of the hold — the app is readable through it. */
export const SPLASH_FADE_MS = 280;

// The bars land before the hold begins, or the mark would still be arriving as
// it starts to leave: 90 + 4×38 + 300 = 542ms, comfortably inside 620.
const BAR_DELAY_MS = 90;
const BAR_STEP_MS = 38;

export default function Splash({ leaving }: { leaving: boolean }) {
  return (
    <div
      // aria-hidden and inert: it is on screen for under a second and says
      // nothing a screen reader needs, and announcing "RANKD" before the app it
      // is covering has been announced puts the brand ahead of the content.
      aria-hidden
      className={`fixed inset-0 z-[60] flex items-center justify-center ${leaving ? "splash-out" : ""}`}
      style={{ background: "var(--bg)" }}
    >
      <div className="text-center">
        <span
          className="splash-mark block font-display text-[44px] leading-none text-gold"
          style={{ textShadow: "0 2px 26px rgba(231,181,62,0.28)" }}
        >
          RANKD
        </span>
        <span className="mt-2.5 flex items-center justify-center gap-1.5">
          {BARS.map((c, i) => (
            <span
              key={c}
              className="splash-bar h-[3px] w-7 rounded-full"
              style={{ background: c, animationDelay: `${BAR_DELAY_MS + i * BAR_STEP_MS}ms` }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
