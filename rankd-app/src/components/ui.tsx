"use client";

// The shared vocabulary every panel is built from.
//
// These were defined in the middle of DuelScreen, which made them look like
// that screen's private business even though the setup sheets, the pickers and
// Settings all reach for them. Pulling them out is what stops the fourth panel
// from quietly inventing its own button.
//
// Nothing here knows about films, ranking or sessions. If a component needs to,
// it belongs in the screen that owns that concern, not in here.

import { useEffect, useRef, useState } from "react";

import { ORDERED_TIERS } from "@/lib/tiers";

// The panel has to outlive its dismissal long enough to slide back down.
// Exported because the nav's toggle has to hold the sheet mounted for exactly
// this long while it plays its exit; two different numbers would either cut the
// animation short or leave a spent panel on screen.
export const SHEET_EXIT_MS = 220;
/** How far the sheet must be pulled down before it counts as a dismissal. */
const PULL_TO_CLOSE_PX = 40;
// Long enough to outlast the browser's synthesised click after a touch (~300ms).
// Exported for the nav toggle, which is vulnerable to the same ghost click for
// the same reason and must ignore it for the same window.
export const SCRIM_ARM_MS = 400;

/**
 * Shared sheet chrome. Settings established this shape and every panel in the
 * app reuses it, so they all dismiss the same way — which is the entire reason
 * it is one component rather than eight similar ones.
 *
 * ── It stops at the nav, it does not cover it ──────────────────────────────
 *
 * This used to be `inset-0`, so a sheet opened from the bottom bar slid up over
 * the very button that opened it. That made the nav unreachable while a panel
 * was up, and — worse — it made the panel feel like it had come from nowhere.
 * A drawer opened by a button should be visibly hinged to that button.
 *
 * `--nav-h` is published by `BottomNav` (it cannot be a constant: the bar pads
 * itself into the home-indicator strip, so its height depends on the device).
 * It falls back to 0, which is correct for the screens that draw no nav at all.
 */
export function Sheet({
  title,
  onClose,
  closing: closingRequest,
  children,
}: {
  title: string;
  onClose: () => void;
  /**
   * Close from OUTSIDE, playing the same exit as every other dismissal.
   *
   * The nav's toggle needs this. Unmounting the sheet directly would work and
   * would skip the animation, which is a visible inconsistency on the one
   * dismissal a user performs most often.
   *
   * A prop rather than an imperative handle because the alternative is setting
   * state from an effect, and that is the cascading render the lint rule here
   * exists to catch. The owner already knows it is closing; it just says so.
   */
  closing?: boolean;
  children: React.ReactNode;
}) {
  // Closing plays the exit animation first and only then unmounts.
  const [selfClosing, setSelfClosing] = useState(false);
  const closing = selfClosing || !!closingRequest;
  const close = () => {
    if (closing) return;
    setSelfClosing(true);
    setTimeout(onClose, SHEET_EXIT_MS);
  };

  // ── The backdrop ignores clicks for its first moment on screen ────────────
  //
  // A GHOST CLICK closed the setup panel every time you chose a tier, and the
  // logic was innocent: picking a tier correctly closed the picker and reopened
  // King of the Hill. But a browser synthesises a `click` roughly 300ms after
  // your finger lifts, at the coordinates it lifted from — and by then the
  // picker has gone and the reopened panel's BACKDROP is what sits under that
  // point. Measured: `elementFromPoint` on the tap position two frames later
  // returns the new sheet's scrim, whose handler is `close`.
  //
  // It never showed up in testing with synthetic clicks, which fire once and
  // immediately. Arming the backdrop after the fact is the narrow fix: a sheet
  // that has just appeared cannot be dismissed by a tap the user aimed at
  // something else.
  // Armed by a timer rather than by comparing clocks during render — reading
  // `Date.now()` while rendering is impure and the compiler rejects it.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setArmed(true), SCRIM_ARM_MS);
    return () => clearTimeout(t);
  }, []);
  const onBackdrop = () => {
    if (armed) close();
  };

  // Pull the sheet down to dismiss it.
  //
  // The grabber at the top has always LOOKED like a drag handle and done
  // nothing, which is worse than not drawing one — the Rolodex's identical
  // grabber does pull, so the app was teaching a gesture on one surface and
  // ignoring it on every other. Same threshold as the Rolodex, for the same
  // reason: anything shorter is a tap on the handle, not a pull.
  const pullFrom = useRef<number | null>(null);
  const pullHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      pullFrom.current = e.clientY;
    },
    onPointerUp: (e: React.PointerEvent) => {
      const from = pullFrom.current;
      pullFrom.current = null;
      if (from !== null && e.clientY - from > PULL_TO_CLOSE_PX) close();
    },
    onPointerCancel: () => {
      pullFrom.current = null;
    },
  };
  return (
    <div
      className={`fixed inset-x-0 top-0 z-30 flex items-end justify-center bg-black/50 backdrop-blur-sm ${closing ? "scrim-out" : "scrim-in"}`}
      // Stops at the top of the nav. The scrim still dims everything above it,
      // so the game is still clearly behind a layer — the bar is simply not
      // part of what got covered.
      style={{ bottom: "var(--nav-h, 0px)" }}
      onClick={onBackdrop}
    >
      <div
        // `pb-6` rather than the old `pb-9`: that extra space existed to clear
        // the home indicator back when the panel reached the bottom of the
        // screen. The nav owns that strip now, so the padding was buying a gap
        // nobody needed.
        className={`max-h-[82vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-surface px-6 pb-6 pt-5 ${closing ? "sheet-out" : "sheet-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The grabber and the title row are both pull targets: a 4px bar is a
            hard thing to catch with a thumb, and the header above the content is
            where a hand naturally lands. `touch-action: none` so the browser
            does not claim the drag for scrolling before we see it. */}
        <div
          {...pullHandlers}
          style={{ touchAction: "none" }}
          className="mx-auto -mt-2 flex h-7 w-24 cursor-grab items-center justify-center"
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div {...pullHandlers} style={{ touchAction: "none" }} className="mb-5 flex items-center justify-between">
          <span className="font-display text-2xl tracking-wide text-gold">{title}</span>
          <button onClick={close} className="text-sm font-semibold text-dim active:scale-95">
            Done
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The one primary action a setup panel gets. */
export function StartButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mt-1 w-full rounded-full py-3 text-sm font-extrabold tracking-wide active:scale-95 disabled:opacity-40"
      style={{ color: "#1c1405", background: "var(--gold)" }}
    >
      {label}
    </button>
  );
}

export function BackRow({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-3 w-full text-center text-xs font-semibold text-dim active:scale-95">
      ‹ Back
    </button>
  );
}

export function ShuffleRow({ shuffle, onShuffle }: { shuffle: boolean; onShuffle: (v: boolean) => void }) {
  return (
    <label className="mb-3 flex items-center justify-between rounded-xl border border-border px-4 py-3">
      <span>
        <span className="block text-sm text-text-hi">Shuffle the order</span>
        <span className="block text-[11px] leading-snug text-dim">
          Face films in a random order instead of weakest first.
        </span>
      </span>
      <input
        type="checkbox"
        checked={shuffle}
        onChange={(e) => onShuffle(e.target.checked)}
        className="tickbox"
      />
    </label>
  );
}

/** A segmented choice — one of several, exactly one active. */
export function ScopeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl border px-2 py-2.5 text-[11px] font-bold active:scale-[0.98]"
      style={{
        borderColor: active ? "var(--gold)" : "var(--border)",
        color: active ? "var(--gold)" : "var(--dim)",
      }}
    >
      {label}
    </button>
  );
}

export function IconToggle({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border active:scale-95 ${
        active ? "border-gold text-gold" : "border-border text-dim"
      }`}
    >
      {icon}
    </button>
  );
}

/**
 * One track, two handles. Each input owns its own half — low runs from the
 * scale's floor up to the tier, high from the tier to the ceiling — so the two
 * can never sit on top of each other and both stay grabbable at any setting.
 */
export function RangeSlider({
  tier,
  low,
  high,
  onLow,
  onHigh,
}: {
  tier: number;
  low: number;
  high: number;
  onLow: (v: number) => void;
  onHigh: (v: number) => void;
}) {
  const MIN = 0.5;
  const MAX = 5;
  const pct = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;
  const split = pct(tier);
  const ticks = ORDERED_TIERS.map((t) => pct(t));

  return (
    <div className="dual-range">
      <div className="dual-track" />
      {ticks.map((t) => (
        <span key={t} className="dual-tick" style={{ left: `${t}%` }} />
      ))}
      <div className="dual-fill" style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />

      {/* Below the tier. Hidden at ½★, where there's nothing further down. */}
      {tier > MIN && (
        <input
          type="range"
          min={MIN}
          max={tier}
          step={0.5}
          value={low}
          aria-label="Lowest rating to include"
          style={{ left: 0, width: `${split}%` }}
          onChange={(e) => onLow(parseFloat(e.target.value))}
        />
      )}
      {/* Above the tier. Hidden at 5★. */}
      {tier < MAX && (
        <input
          type="range"
          min={tier}
          max={MAX}
          step={0.5}
          value={high}
          aria-label="Highest rating to include"
          style={{ left: `${split}%`, width: `${100 - split}%` }}
          onChange={(e) => onHigh(parseFloat(e.target.value))}
        />
      )}
    </div>
  );
}

// A styled <button> can't open a file picker, so both of these are labels
// wrapping a hidden input. Resetting the value on change is what makes picking
// the same file twice fire again.

export function ImportButton({
  label,
  merge,
  onFile,
}: {
  label: string;
  merge?: boolean;
  onFile: (file: File, merge: boolean) => void;
}) {
  return (
    <label
      className="flex-1 cursor-pointer rounded-full border border-border py-2.5 text-center text-xs font-bold tracking-wide text-text active:scale-95"
      style={merge ? { color: "#1c1405", background: "var(--gold)", borderColor: "var(--gold)" } : undefined}
    >
      {label}
      <input
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file, !!merge);
          e.target.value = "";
        }}
      />
    </label>
  );
}

export function RestoreButton({ onFile }: { onFile: (file: File) => void }) {
  return (
    <label className="flex-1 cursor-pointer rounded-xl border border-border py-2.5 text-center text-xs font-bold text-text-hi active:scale-[0.98]">
      Restore
      <input
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}
