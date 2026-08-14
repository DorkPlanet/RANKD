"use client";

// The moment the app opens.
//
// ── This is not a loading screen ───────────────────────────────────────────
//
// It is important to be honest about that, because everything about how it is
// built follows from it. The library comes off localStorage in under 92ms —
// far too fast to see — so there is no wait here to cover. A splash is time you
// CHOOSE to spend, taken from the user, every single time they open the app.
//
// Which means it has to buy something. What it buys is the only moment the
// brand mark is ever the whole screen: the wordmark settling out of wide
// tracking, then the five bars drawing outward from the centre in sequence.
// In the header those bars are a static rule under a title; here they are the
// mark assembling itself, and that is a thing you can only show once per
// opening. Everything else the app does is film.
//
// Type and the brand rules — the two things this app draws — and nothing else.
//
// ── Why the timing is split in two ────────────────────────────────────────
//
// `SPLASH_HOLD_MS` is the deliberate part: how long the finished mark sits
// still. `SPLASH_FADE_MS` is the apology for the deliberate part — the app is
// legible through it, so the real cost is the hold and not the total.
//
// The hold is a FLOOR, not a duration. AppShell keeps this mounted until the
// hold has elapsed AND the library is actually in hand, so on a slow device the
// splash covers the load rather than vanishing onto an empty screen. On every
// real device the library wins that race and the hold is the only thing being
// waited on, which is the point: the length of the splash must not depend on
// how fast the phone is, or it stops being a decision and becomes a symptom.

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
