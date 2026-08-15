"use client";

// Walking back into a game.
//
// A LAYER, not a screen. The duel stays behind it, hard-blurred, so you can see
// the shape of what you were doing — a screen that replaced the duel could only
// describe your run, where this one shows it to you. That is the whole point of
// it, and why the backdrop must never dim to opaque.
//
// It is a junction, not a control panel: one primary action, two quiet routes
// out, and the destructive one below a rule. Tiers and modes are NOT rebuilt
// here — `TierPicker` and `ModePanel` already do that and are already tested.
//
// Abandoning drops the unfinished ORDERING only. Every duel already fought stays
// in the log, because the log is always literally true.

import { useState } from "react";

import { starsFor, type Rating } from "@/lib/tiers";

export interface ResumeRun {
  tier: Rating;
  /** Films in this tier that already hold a position. */
  placed: number;
  total: number;
}

export default function ResumeOverlay({
  run,
  films,
  placed,
  onContinue,
  onTier,
  onModes,
  onAbandon,
}: {
  /** The climb waiting behind this layer, or null when nothing is running. */
  run: ResumeRun | null;
  /** Library totals, for the line shown when there is nothing to resume. */
  films: number;
  placed: number;
  onContinue: () => void;
  onTier: () => void;
  onModes: () => void;
  onAbandon: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[65] flex items-center justify-center px-7"
      // Deliberately not dismissible by tapping away. This is a decision point,
      // not a notification: falling back into a duel by mis-tapping the backdrop
      // is the exact thing it exists to stop.
      // Dimmed hard, but not to nothing. At 82% the duel behind was invisible on
      // a screen that is already near-black, so the layer read as a dialog over
      // a void — which loses the one thing it is for. At 58% the posters come
      // through as colour and shape without being readable, so you can see that
      // a game is waiting without being able to play it by eye.
      style={{
        background: "color-mix(in srgb, var(--bg) 58%, transparent)",
        backdropFilter: "blur(14px) saturate(1.2)",
        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
      }}
    >
      <div
        role="dialog"
        aria-label={run ? "Continue your run" : "Choose what to rank"}
        className="resume-card w-full max-w-[320px] rounded-3xl border border-border px-6 py-7"
        style={{ background: "color-mix(in srgb, var(--surface) 92%, transparent)" }}
      >
        {run ? (
          <>
            <span className="block text-[9px] font-extrabold uppercase tracking-[0.2em] text-dim">
              King of the Hill
            </span>
            <span className="mt-2 block font-display text-[32px] leading-none tracking-wide text-gold">
              {starsFor(run.tier)}
            </span>
            <span className="mt-2.5 block text-[12px] text-dim tabular-nums">
              {run.placed} of {run.total} placed
            </span>

            <button
              onClick={onContinue}
              className="mt-6 w-full rounded-full bg-gold py-3.5 text-center text-[13px] font-bold text-[#1c1405] active:scale-[0.99]"
            >
              Continue
            </button>

            <Route label="Another tier" onClick={onTier} />
            <Route label="Something else" onClick={onModes} />

            <div className="card-rule my-4" />

            {confirming ? (
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-text">Abandon this run?</span>
                <span className="flex gap-3">
                  <button
                    onClick={() => setConfirming(false)}
                    className="text-[12px] text-dim active:scale-95"
                  >
                    No
                  </button>
                  <button onClick={onAbandon} className="text-[12px] font-bold text-gold active:scale-95">
                    Yes
                  </button>
                </span>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="w-full text-left text-[12px] text-dim active:scale-95"
              >
                Abandon this run
              </button>
            )}
          </>
        ) : (
          <>
            <span className="block font-display text-[26px] leading-tight tracking-wide text-text-hi">
              Nothing on the table
            </span>
            <span className="mt-2.5 block text-[12px] text-dim tabular-nums">
              {films.toLocaleString()} films &middot; {placed.toLocaleString()} placed
            </span>

            <button
              onClick={onTier}
              className="mt-6 w-full rounded-full bg-gold py-3.5 text-center text-[13px] font-bold text-[#1c1405] active:scale-[0.99]"
            >
              Pick a tier
            </button>

            <Route label="Something else" onClick={onModes} />
          </>
        )}
      </div>
    </div>
  );
}

/** A quiet way out. Chevron rather than a button, so it reads as a route. */
function Route({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-3.5 flex w-full items-center justify-between text-[12px] text-text active:scale-[0.99]"
    >
      {label}
      <span className="text-dim">&rsaquo;</span>
    </button>
  );
}
