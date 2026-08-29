// Every glyph the app draws, in one place.
//
// They were scattered down the length of DuelScreen, which meant the file's
// table of contents was mostly SVG paths and the parts that actually decide
// anything were buried between them. Nothing here has behaviour or state; if a
// component in this file ever grows either, it belongs somewhere else.

export function ListIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

/**
 * TAKES — two positions, one above the other.
 *
 * Was a heartbeat polyline, which is the mark Letterboxd uses for its activity
 * feed, on a cell sitting in the same place doing an adjacent job. Copying the
 * shape as well as the slot was too much.
 *
 * Two bars of different lengths, the upper one longer: a ranking, at the
 * smallest scale it can be drawn. It says ORDER rather than pulse, which is what
 * this screen is actually about — a pulse belongs to a feed of events, and these
 * are placements.
 */
export function ActivityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="4" y1="8" x2="20" y2="8" />
      <line x1="4" y1="16" x2="13" y2="16" />
    </svg>
  );
}

export function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// Adding a film you've just watched. A plus inside the poster's own proportions
// rather than a bare +, so the cell reads as "another one of these" — the nav's
// other four icons all name a place, and this one names a thing.
//
// It replaced the stop glyph, which lost its job when Done moved into the duel
// itself. Stop-in-the-nav was always slightly wrong anyway: it was inert on
// every screen except one, and it sat two cells from the button that starts a
// run, which is a lot of consequence for a mis-tap.
export function AddFilmIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </svg>
  );
}

export function FilmIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M2 9h5M2 15h5M17 9h5M17 15h5" />
    </svg>
  );
}

export function BookIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    </svg>
  );
}

export function TrophyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

export function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/**
 * The disclosure arrow, pointing down. `open` turns it over.
 *
 * ── One chevron, where there were four ────────────────────────────────────
 *
 * It was drawn as a real SVG in the list's tier jump, as the text glyph `▾` in
 * Settings' rows and in two of the duel screen's pickers, and as `›` in three
 * more places. A text glyph renders at the SYSTEM font's metrics rather than on
 * the icon grid — different weight, different optical size, a different baseline
 * — and it moves when a font finishes loading. `globals.css` already makes
 * exactly this argument about the checkbox's tick, which is drawn rather than
 * typed for the same reason.
 */
export function ChevronIcon({ open, size = 13 }: { open?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s var(--ease)" }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** The same chevron lying on its side — "there is more this way". */
export function ChevronRightIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** A tick. Same shape as the one drawn inside `.tickbox`, so they agree. */
export function TickIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3.5 8.5l3 3 6-6.5" />
    </svg>
  );
}

/**
 * A star, earned or not. Drawn rather than typed for the same reason the tick
 * is: `★` and `☆` are different glyphs in most fonts and are not the same
 * WEIGHT, so a full trophy case rendered as a column of stars that did not line
 * up with each other.
 */
export function StarIcon({ filled, size = 15 }: { filled?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4-5.8-3-5.8 3 1.1-6.4L2.6 9.4l6.5-.9z" />
    </svg>
  );
}

export function RankdMark() {
  return <span className="font-display text-xl leading-none tracking-[0.1em]">RNK</span>;
}

// Points the way the pile is climbed — up the order, toward #1.
//
// A chevron and nothing else, because that is all anyone could ever see.
//
// This read as off-centre through two fixes that both measured perfectly. The
// box was widened, then the flanking numbers were given equal widths, and the
// glyph still looked wrong — because the maths was never the problem. The
// original was a 22px line with the chevron at its far right end, and the line
// was drawn in `--border`: 1.2:1 against the background, which is to say
// invisible. So the box centred, the numbers balanced, and the only VISIBLE ink
// — the gold chevron — sat nine pixels right of where the eye expected it.
//
// The lesson worth keeping: centre what can be seen, not what is in the DOM.
export function ClimbArrow() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
      <path d="M3 1l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Fades in from nothing so the numbers sit on a line that appears to emerge
// rather than a rule that stops dead.
export function Hairline({ flip }: { flip?: boolean }) {
  return (
    <span
      className="h-px w-12 flex-shrink-0"
      style={{
        background: `linear-gradient(to ${flip ? "left" : "right"}, transparent, var(--border))`,
      }}
    />
  );
}
