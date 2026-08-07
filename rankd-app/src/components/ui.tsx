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

import { useState } from "react";

import { ORDERED_TIERS } from "@/lib/tiers";

// The panel has to outlive its dismissal long enough to slide back down.
const SHEET_EXIT_MS = 220;

/**
 * Shared sheet chrome. Settings established this shape; modes, tier and
 * spotlight all reuse it, so every panel in the app dismisses the same way —
 * which is the entire reason it is one component rather than four similar ones.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Closing plays the exit animation first and only then unmounts.
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, SHEET_EXIT_MS);
  };
  return (
    <div
      className={`fixed inset-0 z-30 flex items-end justify-center bg-black/50 backdrop-blur-sm ${closing ? "scrim-out" : "scrim-in"}`}
      onClick={close}
    >
      <div
        className={`max-h-[82vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-border bg-surface px-6 pb-9 pt-5 ${closing ? "sheet-out" : "sheet-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <div className="mb-5 flex items-center justify-between">
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
        style={{ accentColor: "var(--gold)", width: 18, height: 18 }}
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
