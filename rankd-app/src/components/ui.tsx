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
 * Shared sheet chrome. Every panel in the app reuses it, so they all dismiss the
 * same way — the entire reason it is one component rather than eight similar
 * ones.
 *
 * It STOPS AT THE NAV rather than covering it, so a drawer stays visibly hinged
 * to the button that opened it and that button stays reachable. `--nav-h` is
 * published by `BottomNav`; it cannot be a constant, because the bar pads itself
 * into the home-indicator strip and its height is therefore a property of the
 * device. Falls back to 0, which is right for screens that draw no nav.
 */
export function Sheet({
  title,
  onClose,
  closing: closingRequest,
  scroll,
  children,
}: {
  title: string;
  onClose: () => void;
  /**
   * Close from OUTSIDE, playing the same exit as every other dismissal — the
   * nav's toggle needs this. A prop rather than an imperative handle, because
   * the alternative is setting state from an effect and that is the cascading
   * render the lint rule here catches.
   */
  closing?: boolean;
  /**
   * Scroll the CONTENT inside a fixed frame rather than scrolling the whole
   * panel, so the title and the Done button stay put over a long list.
   *
   * ── This prop is what unified five sheets ─────────────────────────────────
   *
   * There were five bottom-sheet implementations in this app: this one, a
   * near-copy in `Sheet.tsx`, two written out by hand inside `ProfileScreen`,
   * and a fifth in `AvatarCropper`. They disagreed about z-index (30, 40, 50),
   * scrim opacity (50% and 60% black), bottom padding, whether the panel stopped
   * above the nav or covered it, and — the part a user actually felt — whether
   * dismissing played an animation at all.
   *
   * The consequence was that the trophy icon and the gear icon sit two inches
   * apart in the same header and opened drawers that behaved differently: one
   * slid down and could be pulled shut, the other vanished between two frames
   * and ignored the drag on its own grabber. That grabber was decorative in four
   * of the five, which is worse than not drawing one.
   *
   * The only real difference worth keeping was the scroll frame, so it is a prop
   * and everything else is the same for everybody. `Sheet.tsx` is gone.
   */
  scroll?: boolean;
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
      style={{ bottom: "var(--nav-h, 0px)" }}
      onClick={onBackdrop}
    >
      <div
        // `pb-6`, not more: the nav owns the home-indicator strip now, so the
        // panel needs no extra clearance beneath it.
        className={`max-h-[82vh] w-full max-w-md rounded-t-3xl border-t border-border bg-surface px-6 pb-6 pt-5 ${
          scroll ? "flex flex-col" : "overflow-y-auto"
        } ${closing ? "sheet-out" : "sheet-in"}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The grabber and the title row are both pull targets: a 4px bar is a
            hard thing to catch with a thumb, and the header above the content is
            where a hand naturally lands. `touch-action: none` so the browser
            does not claim the drag for scrolling before we see it. */}
        <div
          {...pullHandlers}
          style={{ touchAction: "none" }}
          className="mx-auto -mt-2 flex h-7 w-24 flex-shrink-0 cursor-grab items-center justify-center"
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>
        <div
          {...pullHandlers}
          style={{ touchAction: "none" }}
          className="mb-5 flex flex-shrink-0 items-center justify-between"
        >
          <span className="min-w-0 truncate font-display text-2xl tracking-wide text-gold">{title}</span>
          <button onClick={close} className="ml-3 flex-shrink-0 text-sub font-bold text-dim active:scale-95">
            Done
          </button>
        </div>
        {scroll ? <div className="min-h-0 flex-1 overflow-y-auto">{children}</div> : children}
      </div>
    </div>
  );
}

// ── The three buttons, and only three ───────────────────────────────────────
//
// Counted before they were written: the FILLED GOLD action existed in eight
// forms across the app. Four heights (py-2, 2.5, 3, 3.5), two radii (full and
// xl), two sizes (text-sm and text-sub), two weights, tracking present on some
// and absent on others — and two different inks, because one button reached for
// `--bg` navy where the other twenty-one used the brown-black now called
// `--gold-ink`. The bordered secondary was no better: `rounded-xl` beside
// `rounded-full`, `text-xs` beside `text-label` beside `text-sub`, and three
// different press scales.
//
// None of that was a decision. It is what happens when the next screen copies
// whichever button happened to be nearest. So there are three now, they live
// here, and a fourth shape is a thing to argue for rather than a thing to paste.
//
//   Primary    one per surface, filled gold. The thing you came to do.
//   Secondary  bordered. Everything else that is still a button.
//   Quiet      no box at all. Dismissals, "not now", the way back.
//
// `wide` is the only size axis, and it is about LAYOUT rather than importance:
// a button that owns its row is wide, one sitting in a row of others is not.
// Importance is carried by which of the three you picked.
//
// A wide PRIMARY is taller than a wide secondary — 3.5 against 2.5 — because it
// is the one thing on the screen and it should look it. Every INLINE button is
// 2.5 whichever type it is, because inline means it is sharing a row with
// another one and two buttons side by side at different heights is the exact
// mismatch this file exists to stop. Settings' backup row had precisely that:
// Save at one height beside Restore at another.

type ButtonProps = {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Fills its row. Off by default, so a button in a group stays its own size. */
  wide?: boolean;
  /** Layout only — margins and flex. Never colours, sizes or radii. */
  className?: string;
  "aria-label"?: string;
};

/**
 * Destructive, and only on the SECONDARY.
 *
 * There is deliberately no danger primary. A filled red button is the loudest
 * thing a screen can contain, and every destructive act in this app is a second
 * tap confirming a first — so it is already the only thing being asked. Making
 * it shout as well is how a confirm dialog starts feeling like a threat.
 */
type DangerProps = ButtonProps & { danger?: boolean };

/** One filled gold action per surface. */
export function PrimaryButton({ children, wide, className = "", ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`rounded-full text-center text-sub font-bold active:scale-[0.98] disabled:opacity-40 ${
        wide ? "w-full py-3.5" : "px-5 py-2.5"
      } ${className}`}
      style={{ color: "var(--gold-ink)", background: "var(--gold)" }}
    >
      {children}
    </button>
  );
}

/** A bordered action. The default for anything that is not the one primary. */
export function SecondaryButton({ children, wide, danger, className = "", ...rest }: DangerProps) {
  return (
    <button
      {...rest}
      className={`rounded-full border text-center text-sub font-bold active:scale-[0.98] disabled:opacity-40 ${
        danger ? "" : "border-border text-text-hi"
      } ${wide ? "w-full py-2.5" : "px-5 py-2.5"} ${className}`}
      style={danger ? { color: "var(--danger)", borderColor: "var(--danger)" } : undefined}
    >
      {children}
    </button>
  );
}

/** No box. For dismissals and the way back — never for the thing being offered. */
export function QuietButton({ children, wide, className = "", ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      className={`text-center text-sub text-dim active:scale-95 disabled:opacity-40 ${
        wide ? "w-full py-2" : "px-2 py-1.5"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * The small caps line above a thing.
 *
 * It was written out by hand 135 times and drifted into ten different letter
 * spacings — 0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.2 and 0.22em, plus Tailwind's
 * own `wide` and `wider` — with 24 of those uses carrying no tracking and no
 * weight at all. Capitals arrived three separate ways as well: the `uppercase`
 * class, `.toUpperCase()` in JavaScript, and letters simply typed in caps in the
 * JSX.
 *
 * That last one is not merely inconsistent. A screen reader spells an all-caps
 * string out letter by letter, so "STARRING" was being read as S-T-A-R-R-I-N-G,
 * and the copy could not be searched for in the source in the form it was
 * written. The text goes in sentence case and CSS does the shouting.
 *
 * One tracking value. If a second level of eyebrow is ever genuinely needed, add
 * a prop here rather than a number at the call site.
 */
export function Eyebrow({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`block text-label font-bold uppercase tracking-[0.14em] text-dim ${className}`}>
      {children}
    </span>
  );
}

/**
 * Every text field in the app, as one class string.
 *
 * A constant rather than a component because inputs and textareas take a dozen
 * different props each and wrapping them would mean forwarding all of them.
 *
 * There were eight versions of this: three backgrounds (`bg-bg`,
 * `bg-transparent`, a white wash), five paddings, three sizes and two radii —
 * and the two that sit closest together in the app, the list's search and the
 * log sheet's search, differed in all three. The focus ring is deliberately not
 * here: it is one global rule in globals.css, so a field cannot be built
 * without one.
 */
export const FIELD =
  "w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-body text-text-hi outline-none placeholder:text-dim";

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
    <PrimaryButton wide onClick={onClick} disabled={disabled} className="mt-1">
      {label}
    </PrimaryButton>
  );
}

export function BackRow({ onClick }: { onClick: () => void }) {
  return (
    <QuietButton wide onClick={onClick} className="mt-3">
      ‹ Back
    </QuietButton>
  );
}

/**
 * A setting that persists, as a sliding switch.
 *
 * ── Two on/off idioms, and the line between them ──────────────────────────
 *
 * Settings had both, one row apart: "Let the list drift" was a `.tickbox`, and
 * the two controls under "Who can see you" were this pill. Same sheet, same kind
 * of question, two completely different controls — the single most visible
 * "two apps in one" moment in the app.
 *
 * They are not merged, because there IS a real distinction and it is worth
 * keeping. It just was not the one being drawn:
 *
 *   Switch   a SETTING. It persists, it changes how the app behaves from now
 *            on, and flipping it takes effect immediately.
 *   Tickbox  an OPTION for the thing you are about to do — shuffle this run,
 *            let this refine move a locked film. It is spent when the run is.
 *
 * So "Let the list drift" is a switch now and the run options stay ticks. If a
 * third shape ever appears, one of these two was the wrong answer.
 *
 * A `<button>` rather than the `<span role="switch">` this replaced: a span is
 * not focusable, so it was unreachable by keyboard and the global focus ring had
 * nothing to draw on.
 */
export function Switch({
  on,
  busy,
  onClick,
  label,
}: {
  on: boolean;
  busy?: boolean;
  onClick: () => void;
  /** Named for screen readers, which cannot see the sentence beside it. */
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className="mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors disabled:opacity-40"
      style={{ background: on ? "var(--gold)" : "var(--border)" }}
    >
      <span
        className="h-5 w-5 rounded-full transition-transform"
        style={{
          background: on ? "var(--gold-ink)" : "var(--bg)",
          transform: on ? "translateX(16px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

/**
 * One setting: what it is called, what it does, and the switch.
 *
 * The three rows that use this had been written out three times and disagreed
 * about the title's size — `text-sm` in two of them and `text-body` in the
 * third, for the same line doing the same job.
 */
export function SettingRow({
  title,
  blurb,
  on,
  busy,
  onToggle,
  className = "",
}: {
  title: string;
  blurb: React.ReactNode;
  on: boolean;
  busy?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <span className="min-w-0">
        <span className="block text-body text-text-hi">{title}</span>
        <span className="block text-sub leading-snug text-dim">{blurb}</span>
      </span>
      <Switch on={on} busy={busy} onClick={onToggle} label={title} />
    </div>
  );
}

export function ShuffleRow({ shuffle, onShuffle }: { shuffle: boolean; onShuffle: (v: boolean) => void }) {
  return (
    <label className="mb-3 flex items-center justify-between rounded-xl border border-border px-4 py-3">
      <span>
        <span className="block text-body text-text-hi">Shuffle the order</span>
        <span className="block text-sub leading-snug text-dim">
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

/**
 * The labels across the top of a screen that pages sideways.
 *
 * ── Two page-level tab bars that looked nothing alike ─────────────────────
 *
 * Takes and the profile sit one swipe apart on the ribbon, put their tabs in the
 * same place, and do the same job. They shared not one property: 10px small caps
 * against 13px sentence case, `font-bold` against no weight, 0.14em tracking
 * against none, gold-when-active against `--text-hi`-with-a-gold-rule, a `--band`
 * background against the page's own, and no container rule against one.
 *
 * The comment in `FeedScreen` said "Same treatment as the profile's panels,
 * because it is the same idiom doing the same job". It was right about the job.
 *
 * The profile's version wins because it is the one that scales: three labels at
 * 13px in sentence case fit across a phone and read as words, where three at
 * 10px in caps read as a legend. `nested` keeps the quieter small-caps version
 * for a bar INSIDE a page — `PeoplePanel`'s Following/Followers — which was
 * previously identical to the top-level one and therefore inverted the hierarchy.
 */
export function Tabs<T extends string>({
  labels,
  at,
  onPick,
  nested,
  className = "",
}: {
  labels: readonly T[];
  at: number;
  onPick: (i: number) => void;
  nested?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex justify-center gap-6 ${nested ? "" : "border-b border-border"} ${className}`}
      role="tablist"
    >
      {labels.map((label, i) => (
        <button
          key={label}
          role="tab"
          aria-selected={at === i}
          onClick={() => onPick(i)}
          className={
            nested
              ? "pb-2 text-label font-bold uppercase tracking-[0.14em] transition-colors"
              : "-mb-px pb-2.5 text-sub transition-colors"
          }
          style={{
            color: at === i ? (nested ? "var(--gold)" : "var(--text-hi)") : "var(--dim)",
            borderBottom: `2px solid ${at === i ? "var(--gold)" : "transparent"}`,
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A segmented choice — one of several, exactly one active. */
export function ScopeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-xl border px-2 py-2.5 text-sub font-bold active:scale-[0.98]"
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
//
// They are LABELS, so they cannot use the button components above — but they
// must not look like a third and fourth button either, which is what they had
// become: this one was `rounded-full … text-text … active:scale-95` and its
// neighbour `rounded-xl … text-text-hi … active:scale-[0.98]`, and the two
// render side by side inside Settings. `FILE_BUTTON` is the shared shape, and it
// is deliberately the same numbers as `SecondaryButton`.
const FILE_BUTTON =
  "flex-1 cursor-pointer rounded-full border border-border py-2.5 text-center text-sub font-bold text-text-hi active:scale-[0.98]";

export function ImportButton({
  label,
  merge,
  primary,
  onFile,
}: {
  label: string;
  merge?: boolean;
  /**
   * Draw it as THE action rather than one of two.
   *
   * The empty-library screen is the whole reason this exists. It renders a
   * single `ImportButton` as the only control a brand-new user has, and with no
   * `merge` it inherited the outlined treatment — so the most important button
   * in the app's first-run flow was drawn as its quietest, while the same screen
   * with films in it offered a full gold pill. Inside Settings the pair still
   * reads correctly: Merge is filled because it is the safe one, Replace
   * outlined because it overwrites.
   */
  primary?: boolean;
  onFile: (file: File, merge: boolean) => void;
}) {
  const filled = merge || primary;
  return (
    <label
      className={FILE_BUTTON}
      style={filled ? { color: "var(--gold-ink)", background: "var(--gold)", borderColor: "var(--gold)" } : undefined}
    >
      {label}
      <input
        type="file"
        // The zip is offered first because it is what Letterboxd actually hands
        // you — see `takeFile`, which reads the ratings file straight out of it.
        // The csv stays accepted for anyone who has already extracted one.
        accept=".zip,application/zip,.csv,text/csv"
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
    <label className={FILE_BUTTON}>
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
