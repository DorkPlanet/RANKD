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
//
// ── z-25, deliberately BELOW the sheets ────────────────────────────────────
//
// `Sheet` sits at z-30. Putting this above it meant opening the tier picker had
// to unmount the overlay first, which showed the bare duel for a frame before
// the sheet climbed — the app visibly jumping between screens. Underneath, the
// frost simply stays put while a sheet opens over it and is still there when the
// sheet closes, so there is nothing to flash and nowhere to land in between.
//
// Only ever rendered when there IS a run. With nothing in progress the duel
// screen shows its own empty state instead, which keeps the header and the nav
// rather than frosting over them.

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
  onContinue,
  onTier,
  onModes,
  onAbandon,
}: {
  run: ResumeRun;
  onContinue: () => void;
  onTier: () => void;
  onModes: () => void;
  onAbandon: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className="fixed inset-0 z-[25] flex items-center justify-center px-7"
      // Tapping the backdrop resumes. It was a hard gate first, on the grounds
      // that falling into a duel by mis-tapping is what this exists to stop —
      // but the game is RIGHT THERE behind the glass, so reaching past it reads
      // as "yes, that one" rather than as a slip.
      onClick={onContinue}
      // Dimmed hard, but not to nothing. At 82% the duel behind was invisible on
      // a screen that is already near-black, so the layer read as a dialog over
      // a void — which loses the one thing it is for.
      style={{
        background: "color-mix(in srgb, var(--bg) 58%, transparent)",
        backdropFilter: "blur(14px) saturate(1.2)",
        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
      }}
    >
      <div
        role="dialog"
        aria-label="Continue your run"
        onClick={(e) => e.stopPropagation()} // the card is not the backdrop
        className="resume-card w-full max-w-[320px] rounded-3xl border border-border px-6 py-7"
        style={{ background: "color-mix(in srgb, var(--surface) 92%, transparent)" }}
      >
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
