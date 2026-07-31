"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFilms, saveFilms } from "@/lib/store";
import {
  startRun,
  startSpotlight,
  abandonSpotlight,
  getPair,
  choose,
  confirm,
  pendingConfirm,
  flickToTop,
  flickToBottom,
  skipToFilm,
  stepBackFromConfirm,
  promotionTarget,
  startPromotionDuel,
  promoteDirect,
  promotionWon,
  completePromotion,
} from "@/lib/ladder";
import { ORDERED_TIERS, starsFor, type Rating } from "@/lib/tiers";
import { loadBrightness, saveBrightness, applyBrightness } from "@/lib/brightness";
import { fetchMeta, backfillPosters, type FilmMeta } from "@/lib/meta";
import { parseLetterboxdCsv, mergeFilms } from "@/lib/importCsv";
import type { Film, RankState } from "@/lib/types";

const DEFAULT_TIER = 4 as const;
const BARS = ["#D81E26", "#DAA520", "#00A3A3", "#1E3A8A", "#6B4E9E"];

// Degrees each card leans. The climbing card tilts one way, the challenger the
// other; clones have to match or they land crooked against the real poster.
const TILT = 2;

// Spawn a copy of a poster that outlives the re-render, so a film can be seen
// leaving rather than simply being replaced. Positioned from the element's
// CENTRE and its untransformed size — a rotated element's bounding rect is the
// axis-aligned box around it, which is bigger than the poster itself.
function posterClone(el: HTMLElement, poster: string, ring: string): HTMLElement {
  const r = el.getBoundingClientRect();
  const w = el.offsetWidth || r.width;
  const h = el.offsetHeight || r.height;
  const left = r.left + r.width / 2 - w / 2;
  const top = r.top + r.height / 2 - h / 2;
  const clone = document.createElement("div");
  clone.style.cssText = `position:fixed;left:${left}px;top:${top}px;width:${w}px;height:${h}px;border-radius:12px;overflow:hidden;z-index:9999;pointer-events:none;box-shadow:${ring}`;
  clone.innerHTML = `<img src="${poster}" style="width:100%;height:100%;object-fit:cover;display:block"/>`;
  document.body.appendChild(clone);
  return clone;
}

// Centre point of an element, which rotation about the centre leaves unmoved.
function centreOf(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// Flick: the poster carries on along the throw, so it leaves the way it was
// thrown rather than always arcing to the same spot regardless of the gesture.
function flyPosterAway(el: HTMLElement, poster: string, vx: number, vy: number, tilt: number) {
  const mag = Math.hypot(vx, vy) || 1;
  const ux = vx / mag;
  const uy = vy / mag;
  const travel = Math.max(window.innerWidth, window.innerHeight);
  const spin = tilt + ux * 22; // start from the card's lean, then lean into the throw
  const clone = posterClone(el, poster, "0 0 0 3px #e7b53e,0 16px 44px rgba(231,181,62,.5)");
  clone
    .animate(
      [
        { transform: `translate(0,0) rotate(${tilt}deg) scale(1)`, opacity: 1, offset: 0 },
        {
          transform: `translate(${ux * travel * 0.3}px,${uy * travel * 0.3}px) rotate(${tilt + (spin - tilt) * 0.4}deg) scale(0.94)`,
          opacity: 1,
          offset: 0.35,
        },
        {
          transform: `translate(${ux * travel}px,${uy * travel}px) rotate(${spin}deg) scale(0.45)`,
          opacity: 0,
          offset: 1,
        },
      ],
      { duration: 520, easing: "cubic-bezier(.2,.7,.3,1)" },
    )
    .addEventListener("finish", () => clone.remove());
}

// The beaten challenger sinks and fades, revealing its replacement underneath,
// rather than the two cutting straight from one film to the next.
function fadeLoserOut(el: HTMLElement, poster: string) {
  const clone = posterClone(el, poster, "0 8px 26px rgba(0,0,0,0.55)");
  clone
    .animate(
      [
        { transform: `translate(0,0) rotate(${TILT}deg) scale(1)`, opacity: 1 },
        { transform: `translate(0,18px) rotate(${TILT}deg) scale(0.94)`, opacity: 0 },
      ],
      { duration: 320, easing: "cubic-bezier(.4,0,1,1)" },
    )
    .addEventListener("finish", () => clone.remove());
}

// The challenger sits on the right, but winning makes it the climbing film on
// the left. Without this it simply appears over there the instant state updates
// — the film you just chose jumps the screen. Slide a clone across so the pick
// visibly takes its new seat.
function flyPosterAcross(fromImg: HTMLElement, toImg: HTMLElement, poster: string) {
  const a = centreOf(fromImg);
  const b = centreOf(toImg);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clone = posterClone(fromImg, poster, "0 0 0 3px #e7b53e,0 14px 38px rgba(0,0,0,.6)");
  clone
    .animate(
      [
        // Leaves at the challenger's lean and arrives at the climber's, so it
        // settles flush against the card it is replacing rather than crooked.
        { transform: `translate(0,0) rotate(${TILT}deg) scale(1)`, offset: 0 },
        { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 14}px) rotate(0deg) scale(1.04)`, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) rotate(${-TILT}deg) scale(1)`, offset: 1 },
      ],
      { duration: 340, easing: "cubic-bezier(.4,0,.2,1)" },
    )
    .addEventListener("finish", () => clone.remove());
}

export default function DuelScreen() {
  const [state, setState] = useState<RankState | null>(null);

  useEffect(() => {
    const films = loadFilms();
    // Open on the biggest tier that can actually be played — with a real library
    // the default 4★ might be empty, and an empty screen is a poor first look.
    const best = pickOpeningTier(films);
    try {
      setState(startRun(films, best));
    } catch {
      setState({ films, session: null });
    }
  }, []);

  const [brightness, setBrightness] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [tierOpen, setTierOpen] = useState(false);
  const [spotlightFor, setSpotlightFor] = useState<Rating | null>(null);
  const [shuffle, setShuffle] = useState(false);
  // How far either side of the chosen tier to pull films in from, set
  // independently so a 1★ run can reach down to 0.5★ and up to 1.5★.
  const [below, setBelow] = useState(0);
  const [above, setAbove] = useState(0);
  const [infoFilm, setInfoFilm] = useState<Film | null>(null);

  // The strip is a map, not a control — folding it away buys the duel ~110px
  // when you just want to play. Remembered, since it's a working preference.
  const [stripOpen, setStripOpen] = useState(true);
  useEffect(() => {
    setStripOpen(localStorage.getItem(STRIP_KEY) !== "closed");
  }, []);
  const toggleStrip = () =>
    setStripOpen((v) => {
      localStorage.setItem(STRIP_KEY, v ? "closed" : "open");
      return !v;
    });
  useEffect(() => {
    const b = loadBrightness();
    setBrightness(b);
    applyBrightness(b);
  }, []);
  const changeBrightness = (t: number) => {
    setBrightness(t);
    applyBrightness(t);
    saveBrightness(t);
  };

  // Fill in artwork for the tier being played. Scoped to the active pile rather
  // than the whole library — an import can be hundreds of films, and only these
  // are ever on screen. Persists as each one lands so progress survives a reload.
  const pileKey = state?.session?.unconfirmed.join(",") ?? "";
  useEffect(() => {
    if (!state?.session) return;
    const { unconfirmed, contenderId } = state.session;
    // Fetch in the order they'll be SEEN, not pile order. The contender sits at
    // the bottom of the pile and climbs upward, so plain pile order fetches the
    // whole tier before reaching the two films actually on screen — a 130-film
    // tier left them blank for half a minute.
    const ci = unconfirmed.indexOf(contenderId);
    const byWhenSeen = [
      unconfirmed[ci], // the contender itself
      ...unconfirmed.slice(0, ci).reverse(), // then upward: its next opponents
      ...unconfirmed.slice(ci + 1), // then everything already passed
    ].filter(Boolean);

    const need = byWhenSeen
      .map((id) => state.films.find((f) => f.id === id))
      .filter((f): f is Film => !!f && !f.poster);
    if (need.length === 0) return;

    let stopped = false;
    backfillPosters(
      need,
      (id, poster) =>
        setState((s) => {
          if (!s) return s;
          const films = s.films.map((f) => (f.id === id ? { ...f, poster } : f));
          saveFilms(films);
          return { ...s, films };
        }),
      () => stopped,
    );
    return () => {
      stopped = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pileKey]);

  if (!state) return null;
  const { session } = state;

  const decide = (winnerId: string) => setState(choose(state, winnerId));
  const flick = (filmId: string) => setState(flickToTop(state, filmId));
  const sink = (filmId: string) => setState(flickToBottom(state, filmId));
  const scrub = (filmId: string) => setState((s) => (s ? skipToFilm(s, filmId) : s));
  const lockIn = () => {
    // Winning the promotion duels banks a new star rating instead of a position.
    const next = promotionWon(state) ? completePromotion(state) : confirm(state);
    saveFilms(next.films); // confirmation is the only committed data
    setState(next);
  };
  const backOut = () => setState(stepBackFromConfirm(state));

  const beginRun = (tier: Rating, films = state.films) => {
    try {
      setState(startRun(films, tier, { shuffle, below, above }));
    } catch {
      setState({ films, session: null }); // fewer than 2 films in range
    }
  };

  const beginSpotlight = (filmId: string) => {
    try {
      setState(startSpotlight(state.films, filmId, { shuffle }));
    } catch {
      setState(state); // no peers to place against — leave the run alone
    }
  };

  // Leaving a spotlight must put the film back exactly as it was.
  const endRun = () => {
    const next = session?.mode === "spotlight" ? abandonSpotlight(state) : { ...state, session: null };
    saveFilms(next.films);
    setState(next);
  };

  const promoteTo = promotionTarget(state);
  const takeOnTierAbove = () => setState(startPromotionDuel(state));
  const assertPromotion = () => {
    const next = promoteDirect(state);
    saveFilms(next.films);
    setState(next);
  };

  // Swap the whole library for an imported one and restart the run on it.
  const loadLibrary = (films: Film[]) => {
    saveFilms(films);
    beginRun(pickOpeningTier(films), films);
  };

  const pair = getPair(state);
  const champion = pendingConfirm(state);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header />
      <TierProgress
        tier={session?.tier ?? DEFAULT_TIER}
        mode={session?.mode ?? "koth"}
        placed={session?.confirmed.length ?? 0}
        toGo={session?.unconfirmed.length ?? 0}
        onPickTier={() => setTierOpen(true)}
      />

      {champion ? (
        <ConfirmView
          champion={champion}
          rank={(session?.confirmed.length ?? 0) + 1}
          onConfirm={lockIn}
          onBack={(session?.unconfirmed.length ?? 0) > 1 ? backOut : undefined}
          spotlight={session?.mode === "spotlight"}
          promoteTo={promoteTo}
          onTakeOn={takeOnTierAbove}
          onAssertPromotion={assertPromotion}
          justPromoted={promotionWon(state)}
        />
      ) : pair && session ? (
        <Duel
          contender={pair.contender}
          challenger={pair.opponent}
          pile={session.unconfirmed}
          confirmed={session.confirmed}
          films={state.films}
          tier={session.tier}
          onPick={decide}
          onFlick={flick}
          onSink={sink}
          onScrub={scrub}
          onInfo={setInfoFilm}
          stripOpen={stripOpen}
          onToggleStrip={toggleStrip}
        />
      ) : (
        <TierComplete films={state.films} tier={session?.tier ?? DEFAULT_TIER} onPickTier={() => setTierOpen(true)} />
      )}

      <BottomNav onSettings={() => setSettingsOpen(true)} onModes={() => setModeOpen(true)} onEnd={endRun} />

      {infoFilm && <FilmInfo film={infoFilm} onClose={() => setInfoFilm(null)} />}

      {modeOpen && (
        <ModePanel
          films={state.films}
          tier={session?.tier ?? DEFAULT_TIER}
          shuffle={shuffle}
          onShuffle={setShuffle}
          below={below}
          above={above}
          onBelow={setBelow}
          onAbove={setAbove}
          onClose={() => setModeOpen(false)}
          onKoth={(t) => {
            beginRun(t);
            setModeOpen(false);
          }}
          onSpotlight={(t) => {
            setSpotlightFor(t);
            setModeOpen(false);
          }}
          onPickTier={() => {
            setModeOpen(false);
            setTierOpen(true);
          }}
        />
      )}

      {tierOpen && (
        <TierPicker
          films={state.films}
          current={session?.tier ?? DEFAULT_TIER}
          onClose={() => setTierOpen(false)}
          onPick={(t) => {
            beginRun(t);
            setTierOpen(false);
          }}
        />
      )}

      {spotlightFor !== null && (
        <SpotlightPicker
          films={state.films}
          tier={spotlightFor}
          onClose={() => setSpotlightFor(null)}
          onPick={(id) => {
            beginSpotlight(id);
            setSpotlightFor(null);
          }}
        />
      )}

      {settingsOpen && (
        <Settings
          brightness={brightness}
          onChange={changeBrightness}
          onClose={() => setSettingsOpen(false)}
          films={state.films}
          onImport={loadLibrary}
        />
      )}
    </main>
  );
}

// Open on a tier that can actually be played, preferring the default when it
// works and otherwise the fullest — a real import may have nothing at 4★.
function pickOpeningTier(films: Film[]): Rating {
  const counts = new Map<Rating, number>();
  for (const f of films) counts.set(f.rating, (counts.get(f.rating) ?? 0) + 1);
  if ((counts.get(DEFAULT_TIER) ?? 0) >= 2) return DEFAULT_TIER;
  let best: Rating = DEFAULT_TIER;
  let most = 0;
  for (const t of ORDERED_TIERS) {
    const n = counts.get(t) ?? 0;
    if (n > most) {
      most = n;
      best = t;
    }
  }
  return best;
}

// Bottom nav — bookends the black header, so the play area sits between two
// dark bands. Sized to its final height now, so adding List/Stats later slots
// in without re-flowing the duel.
function BottomNav({
  onSettings,
  onModes,
  onEnd,
}: {
  onSettings: () => void;
  onModes: () => void;
  onEnd: () => void;
}) {
  return (
    <nav
      className="flex flex-shrink-0 items-stretch border-t"
      // Pad into the home-indicator strip so the bar's black reaches the
      // physical bottom edge instead of cutting off into the page background.
      style={{ background: "var(--header-bg)", borderColor: "var(--border)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* Five equal cells so RNK sits dead centre — it's the core loop. Ending
          the session sits beside it, since that's the duel's own control.
          Add-film and Search live inside List, not out here. */}
      <NavItem label="Your list" icon={<ListIcon />} />
      <NavItem label="End session" onClick={onEnd} icon={<StopIcon />} />
      <NavItem label="Rank" active onClick={onModes} icon={<RankdMark />} />
      <NavItem label="Activity" icon={<ActivityIcon />} />
      {/* Account owns Settings — for now it opens the sheet directly, since the
          brightness slider is the only setting that exists yet. */}
      <NavItem label="You" onClick={onSettings} icon={<PersonIcon />} />
    </nav>
  );
}

function ListIcon() {
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

function ActivityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

// A stop glyph — unambiguous as "end what's running", where an X read as "close".
function StopIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <rect x="9" y="9" width="6" height="6" rx="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

// Icon-only: labels cost vertical space the duel needs more than the nav does.
function NavItem({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="flex flex-1 items-center justify-center py-4 transition-colors active:scale-95"
      style={{ color: active ? "var(--gold)" : "var(--dim)" }}
    >
      {icon}
    </button>
  );
}

function RankdMark() {
  return <span className="font-display text-xl leading-none tracking-[0.1em]">RNK</span>;
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Shared sheet chrome — the Settings sheet established this; modes, tier and
// spotlight all reuse it so every panel dismisses the same way.
const SHEET_EXIT_MS = 220;

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // The panel has to outlive the dismissal long enough to slide back down, so
  // closing plays the exit first and only then unmounts.
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

const tierCounts = (films: Film[]): Map<Rating, number> => {
  const m = new Map<Rating, number>();
  for (const f of films) m.set(f.rating, (m.get(f.rating) ?? 0) + 1);
  return m;
};

function ShuffleRow({ shuffle, onShuffle }: { shuffle: boolean; onShuffle: (v: boolean) => void }) {
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

function StartButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
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

function BackRow({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="mt-3 w-full text-center text-xs font-semibold text-dim active:scale-95">
      ‹ Back
    </button>
  );
}

// One track, two handles — the range is a single span, so it reads as one
// control rather than two settings that happen to be related.
function RangeSlider({
  low,
  high,
  onLow,
  onHigh,
}: {
  low: number;
  high: number;
  onLow: (v: number) => void;
  onHigh: (v: number) => void;
}) {
  const MIN = 0.5;
  const MAX = 5;
  const pct = (v: number) => ((v - MIN) / (MAX - MIN)) * 100;
  return (
    <div className="dual-range">
      <div className="dual-track" />
      <div className="dual-fill" style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={0.5}
        value={low}
        aria-label="Lowest rating to include"
        onChange={(e) => onLow(parseFloat(e.target.value))}
      />
      <input
        type="range"
        min={MIN}
        max={MAX}
        step={0.5}
        value={high}
        aria-label="Highest rating to include"
        onChange={(e) => onHigh(parseFloat(e.target.value))}
      />
    </div>
  );
}

function ModePanel({
  films,
  tier,
  shuffle,
  onShuffle,
  below,
  above,
  onBelow,
  onAbove,
  onClose,
  onKoth,
  onSpotlight,
  onPickTier,
}: {
  films: Film[];
  tier: Rating;
  shuffle: boolean;
  onShuffle: (v: boolean) => void;
  below: number;
  above: number;
  onBelow: (v: number) => void;
  onAbove: (v: number) => void;
  onClose: () => void;
  onKoth: (t: Rating) => void;
  onSpotlight: (t: Rating) => void;
  onPickTier: () => void;
}) {
  // Pick the game first, then set it up. A flat list asked you to read a tier
  // and a range before knowing what they were for — and showed a range control
  // to Spotlight, which is always single-tier and ignores it entirely.
  const [chosen, setChosen] = useState<"koth" | "spotlight" | null>(null);

  const lowEdge = tier - below;
  const highEdge = tier + above;
  // The range pulls films in from either side, so the count has to reflect the
  // whole span, not just the chosen tier.
  const count = films.filter((f) => f.rating >= lowEdge && f.rating <= highEdge).length;
  const playable = count >= 2;

  if (chosen === null) {
    return (
      <Sheet title="Play" onClose={onClose}>
        <ModeRow
          title="King of the Hill"
          blurb="Rank a whole tier. Each winner keeps climbing until something beats it."
          onClick={() => setChosen("koth")}
        />
        <ModeRow
          title="Spotlight"
          blurb="Pick one film and find where it really belongs — it can push into the tier above."
          onClick={() => setChosen("spotlight")}
        />
      </Sheet>
    );
  }

  if (chosen === "spotlight") {
    // Spotlight's only real setting is which film, and that's the next screen.
    return (
      <Sheet title="Spotlight" onClose={onClose}>
        <button
          onClick={onPickTier}
          className="mb-3 flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 active:scale-[0.99]"
        >
          <span className="text-[11px] font-extrabold tracking-[0.12em] text-dim">TIER</span>
          <span className="flex items-baseline gap-2">
            <span className="text-base text-gold">{starsFor(tier)}</span>
            <span className="text-[11px] text-dim">
              {tierCounts(films).get(tier) ?? 0} films ›
            </span>
          </span>
        </button>
        <ShuffleRow shuffle={shuffle} onShuffle={onShuffle} />
        <StartButton label="Choose a film" onClick={() => onSpotlight(tier)} disabled={(tierCounts(films).get(tier) ?? 0) < 2} />
        <BackRow onClick={() => setChosen(null)} />
      </Sheet>
    );
  }
  return (
    <Sheet title="King of the Hill" onClose={onClose}>
      <button
        onClick={onPickTier}
        className="mb-3 flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 active:scale-[0.99]"
      >
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-dim">TIER</span>
        <span className="flex items-baseline gap-2">
          <span className="text-base text-gold">{starsFor(tier)}</span>
          <span className="text-[11px] text-dim">
            {count} film{count === 1 ? "" : "s"} ›
          </span>
        </span>
      </button>

      {/* Reach set independently either side — a 1★ run might want 0.5★ below
          and 1.5★ above, which a single symmetric figure can't express.
          Cross-tier duels are the ones the overall order most needs: they're the
          only comparisons that say anything about how two star bands relate. */}
      <div className="mt-4 rounded-xl border border-border px-4 py-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm text-text-hi">Range</span>
          <span className="text-[11px] text-gold">
            {starsFor(lowEdge)} – {starsFor(highEdge)}
          </span>
        </div>

        {/* Both handles are clamped past the chosen tier, so the range always
            contains the tier the run is anchored to. */}
        <RangeSlider
          low={lowEdge}
          high={highEdge}
          onLow={(v) => onBelow(tier - Math.min(v, tier))}
          onHigh={(v) => onAbove(Math.max(v, tier) - tier)}
        />
        <div className="flex justify-between text-[10px] text-dim">
          <span>½</span>
          <span>★★★★★</span>
        </div>

        {(below > 0 || above > 0) && (
          <p className="mt-2 text-[11px] leading-snug text-dim">
            {count} films in range. Every film keeps its own star rating — this only decides which
            films meet each other.
          </p>
        )}
      </div>

      <div className="mt-2">
        <ShuffleRow shuffle={shuffle} onShuffle={onShuffle} />
      </div>

      <StartButton label={`Start · ${count} films`} onClick={() => onKoth(tier)} disabled={!playable} />
      {!playable && (
        <p className="mt-2 text-center text-[11px] text-gold">
          Only {count} film{count === 1 ? "" : "s"} in range — widen it or pick another tier.
        </p>
      )}
      <BackRow onClick={() => setChosen(null)} />
    </Sheet>
  );
}

function ModeRow({
  title,
  blurb,
  disabled,
  onClick,
}: {
  title: string;
  blurb: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="mb-2 w-full rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99] disabled:opacity-40"
    >
      <span className="block font-display text-lg tracking-wide text-text-hi">{title}</span>
      <span className="block text-[11px] leading-snug text-dim">{blurb}</span>
    </button>
  );
}

// Every tier with its count. Tiers you can't play are shown but inert — seeing
// that 4.5★ holds one film explains why it isn't offered.
function TierPicker({
  films,
  current,
  onClose,
  onPick,
}: {
  films: Film[];
  current: Rating;
  onClose: () => void;
  onPick: (t: Rating) => void;
}) {
  const counts = tierCounts(films);
  return (
    <Sheet title="Choose a tier" onClose={onClose}>
      {ORDERED_TIERS.map((t) => {
        const n = counts.get(t) ?? 0;
        const playable = n >= 2;
        return (
          <button
            key={t}
            disabled={!playable}
            onClick={() => onPick(t)}
            className="mb-1.5 flex w-full items-center justify-between rounded-xl border border-border px-4 py-3 text-left active:scale-[0.99] disabled:opacity-30"
          >
            <span className="text-base text-gold">{starsFor(t)}</span>
            <span className="flex items-center gap-2 text-[11px] text-dim">
              {n === 0 ? "none" : `${n} film${n === 1 ? "" : "s"}`}
              {n === 1 && " — needs 2"}
              {t === current && <span className="text-gold">✓</span>}
            </span>
          </button>
        );
      })}
    </Sheet>
  );
}

function SpotlightPicker({
  films,
  tier,
  onClose,
  onPick,
}: {
  films: Film[];
  tier: Rating;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const inTier = films
    .filter((f) => f.rating === tier)
    .sort((a, b) => b.score - a.score)
    .filter((f) => f.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet title="Spotlight" onClose={onClose}>
      <p className="mb-3 text-[11px] leading-snug text-dim">
        Pick a {starsFor(tier)} film to re-place. It starts at the bottom and climbs to where it
        belongs.
      </p>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search this tier"
        className="mb-3 w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text-hi outline-none placeholder:text-dim"
      />
      {inTier.slice(0, 40).map((f) => (
        <button
          key={f.id}
          onClick={() => onPick(f.id)}
          className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2 text-left active:scale-[0.99]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={f.poster} alt="" style={{ width: 26, aspectRatio: "2/3", objectFit: "cover", borderRadius: 3 }} />
          <span className="min-w-0 flex-1 truncate text-sm text-text-hi">{f.title}</span>
          {f.year && <span className="text-[11px] text-dim">{f.year}</span>}
        </button>
      ))}
      {inTier.length === 0 && <p className="text-[11px] text-dim">Nothing matches.</p>}
    </Sheet>
  );
}

// A label wrapping a hidden file input — a styled <button> can't open a picker.
function ImportButton({
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
          e.target.value = ""; // so picking the same file twice still fires
        }}
      />
    </label>
  );
}

// Long-press card — for settling a "wait, which one is this?" mid-duel. Poster,
// year and tagline are local and paint instantly; the TMDb detail streams in
// underneath so the card is never blocked on the network.
function FilmInfo({ film, onClose }: { film: Film; onClose: () => void }) {
  const [meta, setMeta] = useState<FilmMeta | null>(null);
  useEffect(() => {
    let live = true;
    fetchMeta(film).then((m) => {
      if (live) setMeta(m);
    });
    return () => {
      live = false;
    };
  }, [film]);

  const crew = meta
    ? ([
        ["Director", meta.director],
        ["Written by", meta.writer],
        ["Cinematography", meta.cinematographer],
        ["Music", meta.composer],
      ].filter(([, v]) => v) as [string, string][])
    : [];

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center backdrop-blur-sm"
      style={{ background: "rgba(0,0,0,0.7)", padding: "1.5rem" }}
      onClick={onClose}
    >
      <div
        className="w-full overflow-y-auto border border-border"
        style={{ background: "var(--surface)", maxWidth: 300, maxHeight: "88vh", borderRadius: 16 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex gap-3 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={film.poster}
            alt={film.title}
            style={{ width: 88, flexShrink: 0, aspectRatio: "2 / 3", objectFit: "cover", borderRadius: 8 }}
          />
          <div className="min-w-0 flex-1">
            <div className="font-display text-xl leading-none tracking-wide text-text-hi">{film.title}</div>
            <div className="mt-1.5 text-[11px] font-bold tracking-[0.1em] text-gold">
              {film.year} · {film.rating}★{meta?.runtime ? ` · ${meta.runtime}m` : ""}
            </div>
            {meta?.genres?.length ? (
              <div className="mt-1.5 text-[11px] leading-snug text-dim">{meta.genres.slice(0, 3).join(" · ")}</div>
            ) : null}
            {film.tagline && (
              <p className="mt-2 font-serif text-[13px] italic leading-snug text-text">“{film.tagline}”</p>
            )}
          </div>
        </div>

        {meta?.synopsis && (
          <p className="px-4 pb-3 text-[12px] leading-relaxed text-text">{meta.synopsis}</p>
        )}

        {meta?.cast?.length ? (
          <div className="px-4 pb-3">
            <div className="text-[10px] font-extrabold tracking-[0.12em] text-dim">STARRING</div>
            <div className="mt-1 text-[12px] leading-snug text-text">{meta.cast.join(", ")}</div>
          </div>
        ) : null}

        {crew.length > 0 && (
          <div className="border-t border-border px-4 py-3">
            {crew.map(([role, name]) => (
              <div key={role} className="flex justify-between gap-3 py-0.5 text-[12px]">
                <span className="text-dim">{role}</span>
                <span className="text-right text-text-hi">{name}</span>
              </div>
            ))}
          </div>
        )}

        {!meta && <div className="px-4 pb-4 text-[11px] text-dim">Loading details…</div>}
      </div>
    </div>
  );
}

// Settings sheet — home for the brightness slider (and future settings).
function Settings({
  brightness,
  onChange,
  onClose,
  films,
  onImport,
}: {
  brightness: number;
  onChange: (t: number) => void;
  onClose: () => void;
  films: Film[];
  onImport: (films: Film[]) => void;
}) {
  const [note, setNote] = useState<string | null>(null);

  const takeFile = async (file: File, merge: boolean) => {
    const { films: parsed, skipped } = parseLetterboxdCsv(await file.text());
    if (parsed.length === 0) {
      setNote("No rated films found — is that a Letterboxd ratings.csv?");
      return;
    }
    const next = merge ? mergeFilms(films, parsed) : parsed;
    onImport(next);
    setNote(
      `${merge ? "Merged" : "Imported"} ${parsed.length} films` +
        (skipped ? ` · skipped ${skipped} unrated` : "") +
        ". Posters are loading in the background.",
    );
  };

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-extrabold tracking-[0.12em] text-dim">BRIGHTNESS</span>
          <span className="text-[11px] text-dim">{Math.round(brightness * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(brightness * 100)}
          onChange={(e) => onChange(parseInt(e.target.value, 10) / 100)}
          className="w-full"
          style={{ accentColor: "var(--accent)" }}
        />
        <div className="mt-1.5 flex justify-between text-[11px] text-dim">
          <span>Deep</span>
          <span>Bright</span>
        </div>

        <div className="mt-7 border-t border-border pt-5">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-extrabold tracking-[0.12em] text-dim">YOUR FILMS</span>
            <span className="text-[11px] text-dim">{films.length} in the library</span>
          </div>
          <p className="mb-3 text-[11px] leading-snug text-dim">
            Import a Letterboxd <span className="text-text">ratings.csv</span>. Merge keeps anything
            you&apos;ve already placed; replace starts over.
          </p>
          <div className="flex gap-2">
            <ImportButton label="Merge" merge onFile={takeFile} />
            <ImportButton label="Replace" onFile={takeFile} />
          </div>
          {note && <p className="mt-3 text-[11px] leading-snug text-gold">{note}</p>}
        </div>
      </div>
    </Sheet>
  );
}

function Header() {
  return (
    <header
      className="relative px-6 pb-3"
      style={{ background: "var(--header-bg)", paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}
    >
      <button
        aria-label="Achievements"
        className="absolute right-5 text-dim transition-colors active:scale-95"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      >
        <TrophyIcon />
      </button>
      <div className="text-center">
        <span className="font-display text-[28px] leading-none tracking-[0.06em] text-gold" style={{ textShadow: "0 2px 20px rgba(231,181,62,0.22)" }}>
          RANKD
        </span>
        <div className="mt-1 flex items-center justify-center gap-1">
          {BARS.map((c) => (
            <span key={c} className="h-[3px] w-5 rounded-full" style={{ background: c }} />
          ))}
        </div>
      </div>
      {/* Short feather below the solid header — ported from rankd.html .lh-header::after */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-full h-11"
        style={{
          background:
            "linear-gradient(to bottom, color-mix(in srgb, var(--header-bg) 92%, transparent), color-mix(in srgb, var(--header-bg) 50%, transparent) 40%, transparent)",
        }}
      />
    </header>
  );
}

// The tier + progress strip, sitting on the body just under the header feather.
function TierProgress({
  tier,
  mode,
  placed,
  toGo,
  onPickTier,
}: {
  tier: Rating;
  mode: string;
  placed: number;
  toGo: number;
  onPickTier: () => void;
}) {
  return (
    <div className="px-6">
      {/* mt-11 clears the header's 44px feather so the progress bar doesn't sit
          inside the fade. */}
      <div className="mx-auto mt-11 max-w-[330px]">
        <div className="mb-1.5 flex items-baseline justify-between">
          {/* The tier reads as its stars, and doubles as the quickest way to
              switch — the label you're looking at is the control. */}
          <button onClick={onPickTier} className="flex items-baseline gap-1.5 active:scale-95">
            <span className="text-base leading-none text-gold">{starsFor(tier)}</span>
            <span className="text-[10px] leading-none text-dim">▾</span>
          </button>
          <span className="text-[11px] text-text/55">
            {mode === "spotlight" ? (
              <b className="text-gold">SPOTLIGHT</b>
            ) : (
              <>
                <b className="text-text-hi">{placed}</b> placed · {toGo} to go
              </>
            )}
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-border">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.round((placed / Math.max(placed + toGo, 1)) * 100)}%`,
              background: "var(--accent)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── The climb: contender vs the film above, both UN-RNKD ───────────────────
function Duel({
  contender,
  challenger,
  pile,
  confirmed,
  films,
  tier,
  onPick,
  onFlick,
  onSink,
  onScrub,
  onInfo,
  stripOpen,
  onToggleStrip,
}: {
  contender: Film;
  challenger: Film;
  pile: string[]; // unconfirmed, index 0 = top
  confirmed: string[]; // locked shelf, index 0 = #1
  films: Film[];
  tier: Rating;
  onPick: (id: string) => void;
  onFlick: (id: string) => void;
  onSink: (id: string) => void;
  onScrub: (id: string) => void;
  onInfo: (film: Film) => void;
  stripOpen: boolean;
  onToggleStrip: () => void;
}) {
  const arenaRef = useRef<HTMLDivElement>(null);
  // Newest first, capped at two — the one before last is context, anything older
  // is clutter.
  const [results, setResults] = useState<{ won: string; lost: string; at: number }[]>([]);

  // Intercept a win by the right-hand card so it slides into the climbing seat
  // before the state swap paints. Picking the left card needs none of this — it
  // is already where it is going to be.
  const pick = (id: string) => {
    // Record the result before state moves on — the screen otherwise gives no
    // acknowledgement that a tap landed at all.
    const won = id === contender.id ? contender : challenger;
    const lost = id === contender.id ? challenger : contender;
    setResults((prev) => [{ won: won.title, lost: lost.title, at: Date.now() }, ...prev].slice(0, 2));

    const arena = arenaRef.current;
    const cards = arena?.querySelectorAll<HTMLElement>("button");
    const climbImg = cards?.[0]?.querySelector("img");
    const challImg = cards?.[1]?.querySelector("img");

    if (id === challenger.id && climbImg && challImg) {
      flyPosterAcross(challImg, climbImg, challenger.poster ?? "");
      setTimeout(() => onPick(id), 200); // commit mid-flight, under the clone
      return;
    }
    if (id === contender.id && challImg) {
      // The climber stays put; only the beaten challenger needs to leave.
      fadeLoserOut(challImg, challenger.poster ?? "");
      onPick(id); // commit at once so the replacement fades up underneath
      return;
    }
    onPick(id);
  };

  // Low → high for the rolodex (bottom of pile first).
  const lowToHigh = useMemo(
    () => [...pile].reverse().map((id) => films.find((f) => f.id === id)!).filter(Boolean),
    [pile, films],
  );

  // Locked films sit above the whole pile, so they tail the strip. confirmed[0]
  // is #1, so reversing puts the weakest lock nearest the pile and #1 furthest.
  const locked = useMemo(
    () =>
      [...confirmed]
        .reverse()
        .map((id, j) => ({ film: films.find((f) => f.id === id)!, rank: confirmed.length - j }))
        .filter((x) => x.film),
    [confirmed, films],
  );

  return (
    <>
      <div className="mt-3 flex flex-col items-center">
        <Tips />
      </div>

      {/* The question belongs to the duel, so it lives inside the arena and
          travels with the posters. Left outside it, folding the strip away
          stranded it in the middle of the freed space. */}
      <div ref={arenaRef} className="flex flex-1 flex-col px-4">
        {/* A fixed gap above the posters, and every flexible space below them.
            Centring them in the arena meant folding the strip away resized the
            arena and shifted the posters with it; anchoring them here means the
            freed height all lands underneath and they never move. Sized to sit
            them where centring used to, and allowed to shrink so a short screen
            reclaims it rather than overflowing. */}
        <div style={{ height: 110, flexShrink: 1 }} />
        <div className="relative flex items-center justify-center gap-3">
        <PosterCard film={contender} badge="CLIMBING" pick onPick={pick} onFlick={onFlick} onSink={onSink} onInfo={onInfo} />
        <PosterCard film={challenger} badge="UN-RNKD" onPick={pick} onFlick={onFlick} onSink={onSink} onInfo={onInfo} />
        </div>
        {/* Stays in the layout flow so it can never overlap anything at any
            screen height. It only needs to look right with the strip folded
            away, so rather than pinning it, the fade-in simply WAITS for the
            drawer to finish moving — invisible while the layout shifts, so it
            never appears to slide. Fading out has no delay. */}
        <div style={{ flexGrow: 1.6 }} />
        <div
          aria-hidden={stripOpen}
          className="pointer-events-none flex justify-center"
          style={{
            opacity: stripOpen ? 0 : 1,
            transition: "opacity 0.25s var(--ease)",
            transitionDelay: stripOpen ? "0s" : "0.3s",
          }}
        >
          <LastResult results={results} />
        </div>
        <div style={{ flexGrow: 1 }} />
      </div>

      <Rolodex
        lowToHigh={lowToHigh}
        locked={locked}
        tier={tier}
        contenderId={contender.id}
        challengerId={challenger.id}
        onScrub={onScrub}
        open={stripOpen}
        onToggle={onToggleStrip}
      />
    </>
  );
}

// Every mechanic the duel screen understands, cycled one at a time — the screen
// carries no chrome explaining itself, so this is where the game gets taught.
const TIPS = [
  // "Tap the one you like more" is gone — the question under the posters now
  // says that, and a tip repeating it wastes a turn of the cycle.
  "Whichever film wins keeps climbing",
  "Flick a film up to send it straight to the top",
  "Flick a film down to send it to the bottom",
  "Hold a film to see who's in it and what it's about",
  "Swipe the row below to choose who you face next",
  "Pull the handle down to hide the row",
  "Nothing's saved until you lock a film into place",
];
const STRIP_KEY = "rankd-strip-open";
const TIP_MS = 9500; // dwell
const TIP_FADE_MS = 550; // matches the .tip opacity transition

function Tips() {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    // Fade the old tip out, swap the text while it's invisible, fade back in —
    // a crossfade rather than a cut. Opacity lives in CSS so the shine keeps
    // running underneath instead of restarting on every change.
    const cycle = setInterval(() => {
      setShown(false);
      setTimeout(() => {
        setI((n) => (n + 1) % TIPS.length);
        setShown(true);
      }, TIP_FADE_MS);
    }, TIP_MS);
    return () => clearInterval(cycle);
  }, []);

  return (
    <span className="tip px-6 text-center text-[11px] leading-snug" style={{ opacity: shown ? 1 : 0 }}>
      {TIPS[i]}
    </span>
  );
}

function PosterCard({
  film,
  badge,
  pick,
  onPick,
  onFlick,
  onSink,
  onInfo,
}: {
  film: Film;
  badge: string;
  pick?: boolean;
  onPick: (id: string) => void;
  onFlick: (id: string) => void;
  onSink: (id: string) => void;
  onInfo: (film: Film) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    held.current = false;
    // Capture the pointer so an upward drag off the poster still reports its
    // release here — without this the flick is lost the moment you leave the card.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — capture is a best-effort enhancement
    }
    holdTimer.current = setTimeout(() => {
      held.current = true; // swallows the tap on release, so holding never picks
      onInfo(film);
    }, 450);
  };

  // Any real movement means they're flicking or scrolling, not holding.
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    if (Math.abs(e.clientX - s.x) > 8 || Math.abs(e.clientY - s.y) > 8) cancelHold();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    cancelHold();
    const s = start.current;
    start.current = null;
    if (!s) return;
    if (held.current) {
      held.current = false;
      return; // the hold already opened the info card
    }
    const dy = e.clientY - s.y;
    const dx = e.clientX - s.x;
    if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx)) {
      // vertical throw → up sends it to the top of the pile, down to the bottom
      const img = e.currentTarget.querySelector("img");
      if (img) flyPosterAway(img, film.poster ?? "", dx, dy, pick ? -TILT : TILT);
      const land = dy < 0 ? onFlick : onSink;
      setTimeout(() => land(film.id), 170);
    } else {
      onPick(film.id); // tap = pick winner
    }
  };

  const onPointerCancel = () => {
    cancelHold();
    start.current = null;
  };

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()} // holding must not raise the OS menu
      style={{ touchAction: "none" }}
      className="group relative flex w-[46%] max-w-[180px] flex-col items-center transition-transform active:scale-95"
    >
      <span
        className={`mb-3 w-full text-center font-display text-[32px] font-normal leading-[1.15] tracking-[0.02em] text-text-hi line-clamp-2 ${pick ? "float-c" : "float-d"}`}
        style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}
      >
        {film.title}
      </span>
      {/* Wrapper carries the float so the badge drifts with its poster. The
          poster itself keeps overflow-hidden for its rounded corners, so the
          badge has to hang off this wrapper to straddle the bottom edge. */}
      {/* The tilt lives on the wrapper, not the poster, so the badge rotates with
          the card and sits square to its bottom edge — a level badge on a tilted
          card reads as off-centre even when it is mathematically centred. */}
      <div
        className={`relative w-full ${pick ? "float-a" : "float-b"}`}
        style={{ rotate: `${pick ? -TILT : TILT}deg` }}
      >
        <div
          className="w-full overflow-hidden rounded-xl"
          style={{
            aspectRatio: "2 / 3",
            boxShadow: pick
              ? "0 0 0 3px var(--gold), 0 10px 30px color-mix(in srgb, var(--gold) 35%, transparent)"
              : "0 8px 26px rgba(0,0,0,0.55)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={film.poster} alt={film.title} className="h-full w-full object-cover" draggable={false} />
        </div>
        <span
          className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-[0.07em]"
          style={
            pick
              ? { color: "#1c1405", background: "var(--gold)" }
              : { color: "var(--dim)", background: "var(--surface)", border: "1px solid var(--border)" }
          }
        >
          {badge}
        </span>
      </div>
    </button>
  );
}

// ── The confirm moment: the champion tops the pile, take a real number ─────
function ConfirmView({
  champion,
  rank,
  onConfirm,
  onBack,
  spotlight,
  promoteTo,
  onTakeOn,
  onAssertPromotion,
  justPromoted,
}: {
  champion: Film;
  rank: number;
  onConfirm: () => void;
  onBack?: () => void;
  spotlight?: boolean;
  promoteTo?: Rating;
  onTakeOn?: () => void;
  onAssertPromotion?: () => void;
  justPromoted?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <span className="text-[11px] font-extrabold tracking-[0.14em] text-gold">
        {justPromoted ? `⭐ EARNED ${starsFor(champion.rating)}` : "🏆 TOPS THE PILE"}
      </span>
      <div className="w-40 overflow-hidden rounded-xl" style={{ boxShadow: "0 0 0 3px var(--gold), 0 12px 36px color-mix(in srgb, var(--gold) 45%, transparent)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={champion.poster} alt={champion.title} className="w-full" style={{ aspectRatio: "2 / 3", objectFit: "cover" }} />
      </div>
      <div>
        <div className="font-serif text-xl font-bold text-text-hi">{champion.title}</div>
        {justPromoted ? (
          <div className="mt-1 text-base text-gold">{starsFor(champion.rating)}</div>
        ) : (
          <div className="mt-1 font-serif text-5xl font-bold text-gold">#{rank}</div>
        )}
      </div>
      <button
        onClick={onConfirm}
        className="rounded-full px-8 py-3 text-sm font-extrabold tracking-wide active:scale-95"
        style={{ color: "#1c1405", background: "var(--gold)", boxShadow: "0 4px 20px color-mix(in srgb, var(--gold) 40%, transparent)" }}
      >
        {justPromoted ? `Lock in at ${starsFor(champion.rating)}` : spotlight ? "Lock in here" : `Lock in as #${rank}`}
      </button>

      {/* Topping a tier in Spotlight is the one moment a star rating can change:
          earn it against the tier above, or assert it outright. */}
      {promoteTo !== undefined && !justPromoted && (
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={onTakeOn}
            className="rounded-full border px-6 py-2.5 text-xs font-bold tracking-wide active:scale-95"
            style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          >
            Take on {starsFor(promoteTo)}
          </button>
          <button onClick={onAssertPromotion} className="text-[11px] font-semibold text-dim active:scale-95">
            or move it up without dueling
          </button>
        </div>
      )}

      {onBack && !justPromoted && (
        <button onClick={onBack} className="-mt-1 text-xs font-semibold text-dim active:scale-95">
          Not yet — keep playing
        </button>
      )}
    </div>
  );
}

function TierComplete({ films, tier, onPickTier }: { films: Film[]; tier: Rating; onPickTier: () => void }) {
  const ranked = films.filter((f) => f.rating === tier && f.confirmed).sort((a, b) => b.score - a.score);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="font-display text-2xl tracking-wide text-gold">🏆 {starsFor(tier)} placed</div>
      <p className="font-serif italic text-dim">Every film in this tier has found its spot.</p>
      <button
        onClick={onPickTier}
        className="rounded-full border border-gold px-5 py-2 text-xs font-bold tracking-wide text-gold active:scale-95"
      >
        Choose another tier
      </button>
      <ol className="mt-2 w-full max-w-xs space-y-1 text-left">
        {ranked.map((f, i) => (
          <li key={f.id} className="flex gap-3 text-sm text-text">
            <span className="w-6 text-right font-serif font-bold text-gold">{i + 1}</span>
            <span>{f.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Rolodex — the unconfirmed pile, contender pinned as a gold YOU marker ──
function Rolodex({
  lowToHigh,
  locked,
  tier,
  contenderId,
  challengerId,
  onScrub,
  open,
  onToggle,
}: {
  lowToHigh: Film[];
  locked: { film: Film; rank: number }[];
  tier: Rating;
  contenderId: string;
  challengerId: string;
  onScrub: (id: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef(0);
  const userScrolling = useRef(false);
  const prevPileKey = useRef("");
  const prevContenderId = useRef("");
  const pullFrom = useRef<number | null>(null);
  const pileKey = lowToHigh.map((f) => f.id).join(",");

  const syncHighlight = () => {
    const track = trackRef.current;
    if (!track) return null;
    const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    const cells = track.querySelectorAll<HTMLElement>("[data-fid]");
    cells.forEach((el) => {
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    });
    cells.forEach((el) => el.classList.toggle("rol-centered", el === best));
    return (best as HTMLElement | null)?.dataset.fid ?? null;
  };

  const centerFilm = (id: string) => {
    const track = trackRef.current;
    if (!track) return;
    const el = track.querySelector<HTMLElement>(`[data-fid="${id}"]`);
    if (el) track.scrollLeft = el.offsetLeft - track.clientWidth / 2 + el.clientWidth / 2;
  };

  // Re-centre the challenger when the PILE changes (flick / confirm / contender
  // win) OR the contender changes — tapping the challenger makes IT the new
  // contender without reordering the pile, so watching pileKey alone misses it.
  // Never re-centre on a plain scrub (challengerId-only change) so the strip
  // stays put under the thumb.
  useEffect(() => {
    if (prevPileKey.current === pileKey && prevContenderId.current === contenderId) return;
    prevPileKey.current = pileKey;
    prevContenderId.current = contenderId;
    requestAnimationFrame(() => {
      centerFilm(challengerId);
      syncHighlight();
    });
  }, [pileKey, contenderId, challengerId]);

  useEffect(() => {
    syncHighlight();
  });

  // Re-opening mounts a fresh, unscrolled track, but prevPileKey still holds the
  // key from before it was folded away — so clear it or the centring effect
  // decides nothing has changed and leaves the strip parked at the far left.
  useEffect(() => {
    if (!open) return;
    prevPileKey.current = "";
    requestAnimationFrame(() => {
      centerFilm(challengerId);
      syncHighlight();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const markUserScroll = () => (userScrolling.current = true);
  const handleScroll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(syncHighlight);
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      const id = syncHighlight();
      // Only commit a scrub for a user-driven scroll — a programmatic reorder
      // (flick / confirm) also fires scroll events and must NOT override the challenger.
      // Any film but the contender is a legal target: scrubbing up leaps past
      // films it clears, scrubbing down drops it below a weaker one.
      if (userScrolling.current && id && id !== challengerId) onScrub(id);
      userScrolling.current = false;
    }, 100);
  };

  return (
    <div className="relative w-full pb-1">
      {/* A grabber, not a chevron — the strip pulls open and closed like a
          drawer, so drag it or tap it. */}
      <button
        onClick={onToggle}
        onPointerDown={(e) => (pullFrom.current = e.clientY)}
        onPointerUp={(e) => {
          const from = pullFrom.current;
          pullFrom.current = null;
          if (from == null) return;
          const dy = e.clientY - from;
          // A deliberate pull wins over the tap; anything smaller is a tap.
          if (Math.abs(dy) > 12) {
            e.preventDefault();
            if (dy > 0 === open) onToggle(); // pull down to close, up to open
          }
        }}
        aria-label={open ? "Hide the film strip" : "Show the film strip"}
        aria-expanded={open}
        className="mx-auto flex h-7 w-20 items-center justify-center"
        style={{ touchAction: "none" }}
      >
        <span
          className="block rounded-full"
          style={{
            width: 34,
            height: 4,
            background: open ? "var(--border)" : "color-mix(in srgb, var(--gold) 55%, transparent)",
            transition: "background 0.25s var(--ease)",
          }}
        />
      </button>
      {/* pt-7: the centred poster scales 1.16x upward from its bottom edge, and
          overflow-x:auto forces overflow-y to auto — without headroom the track
          slices the top off it and its glow. */}
      {/* Stays mounted and animates its row from 0fr to 1fr, so it slides rather
          than snaps — and keeps its scroll position while folded away. */}
      <div
        className="grid"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.3s var(--ease)" }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
        <div
          ref={trackRef}
          onScroll={handleScroll}
          onPointerDown={markUserScroll}
          onTouchStart={markUserScroll}
          onWheel={markUserScroll}
          className="rol-track flex items-end gap-2.5 overflow-x-auto pb-2 pt-7 px-[calc(50%-25px)] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [scroll-snap-type:x_proximity] [&::-webkit-scrollbar]:hidden"
        >
        <TierDivider tier={tier} />
        {lowToHigh.map((f) =>
          f.id === contenderId ? (
            // The climbing film sits IN the strip at its real position, so it
            // occupies layout space — overlaying it caused it to stack on top of
            // whichever cell happened to scroll under it. No data-fid: it must
            // never be pickable as its own challenger.
            <div key={f.id} className="flex w-[50px] flex-shrink-0 flex-col items-center gap-1">
              <div
                className="w-full overflow-hidden rounded-md"
                style={{ aspectRatio: "2 / 3", boxShadow: "0 0 0 2px var(--gold), 0 0 16px color-mix(in srgb, var(--gold) 70%, transparent)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.poster} alt="" className="h-full w-full object-cover" draggable={false} />
              </div>
              <span className="font-serif text-[10px] font-extrabold tracking-wide text-gold">YOU</span>
            </div>
          ) : (
            <div key={f.id} data-fid={f.id} className="rol-cell flex w-[50px] flex-shrink-0 flex-col items-center gap-1 [scroll-snap-align:center]">
              <div className="rol-poster w-full overflow-hidden rounded-md bg-surface" style={{ aspectRatio: "2 / 3" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.poster} alt="" className="h-full w-full object-cover" draggable={false} />
              </div>
              <span className="text-[9px] font-bold tracking-wide text-dim/70">UN-RNKD</span>
            </div>
          ),
        )}
        {/* Locked films tail the strip — they outrank the whole pile, so the
            shelf you're building stays in view. They carry no data-fid, so they
            can't be scrubbed to; re-opening them is a later feature. */}
        {locked.map(({ film }) => (
          <div key={film.id} className="flex w-[50px] flex-shrink-0 flex-col items-center gap-1">
            {/* A padlock, not a number. `confirmed` is per-tier, so a rank shown
                here would read as "#1 of everything" when it only means "#1 of
                this tier" — and a 5★ film already outranks the whole 4★ shelf.
                The strip's job is "this is settled"; the real number belongs
                where it can say "#2 overall, #1 in 4★" (overallRank exists for
                that). */}
            <LockIcon />
            <div
              className="w-full overflow-hidden rounded-md bg-surface"
              style={{ aspectRatio: "2 / 3", boxShadow: "0 0 0 1.5px var(--gold)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={film.poster} alt="" className="h-full w-full object-cover" draggable={false} />
            </div>
            {/* Matches the UN-RNKD label height so every poster shares a baseline */}
            <span className="text-[9px] leading-none text-transparent">.</span>
          </div>
        ))}
        <TierDivider tier={tier} />
        </div>
        </div>
      </div>
    </div>
  );
}

// Bookends: the tier's own boundary marks. The strip only ever holds one star
// tier, so these are the walls it runs between — and they'll read as real
// dividers once more than one tier is in play.
// Sits between the arena and the strip. Until now nothing on screen confirmed a
// tap had registered — you picked, the posters changed, and that was it. Keyed
// on the timestamp so it replays even when the same film wins twice running.
// Beaten films read in a cool silver-blue — clearly not the gold of a winner,
// but still legible rather than faded out.
const LOSER = "#9db4d6";

function LastResult({ results }: { results: { won: string; lost: string; at: number }[] }) {
  // No fixed height: with one, padding only squeezed the text inside the box and
  // the row still butted straight onto the strip's handle, so the line read as
  // that control's label.
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 pb-6 pt-2">
      {results.length === 0 ? (
        // Holds the question until the first pick answers it.
        <span className="text-[13px] leading-none text-dim">Which film do you prefer?</span>
      ) : (
        results.map((r, i) => (
          // Keyed on its own timestamp, so React moves the same element down a
          // row rather than rebuilding it — which is what lets it shrink and
          // fade on the way instead of snapping.
          <span
            key={r.at}
            className={`result-line leading-none ${i === 0 ? "result-in" : ""}`}
            style={{ fontSize: i === 0 ? 13 : 11, opacity: i === 0 ? 1 : 0.55 }}
          >
            <span className="font-semibold text-gold">{r.won}</span>
            <span className="text-dim"> beat </span>
            <span style={{ color: LOSER }}>{r.lost}</span>
          </span>
        ))
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function TierDivider({ tier }: { tier: Rating }) {
  const line = "color-mix(in srgb, var(--gold) 42%, transparent)";
  return (
    <div aria-hidden className="flex flex-shrink-0 flex-col items-center gap-1" style={{ width: 26 }}>
      <div className="relative flex w-full items-center justify-center" style={{ aspectRatio: "1 / 3" }}>
        <span
          className="absolute"
          style={{
            width: 1,
            height: "100%",
            background: `linear-gradient(to bottom, transparent, ${line} 22%, ${line} 78%, transparent)`,
          }}
        />
        {/* The stars break the line at its midpoint rather than sitting under it */}
        <span
          className="relative text-[9px] leading-none text-gold"
          style={{ padding: "3px 0", background: "var(--bg)", writingMode: "vertical-rl" }}
        >
          {starsFor(tier)}
        </span>
      </div>
      {/* Holds the label row's height so posters stay on one baseline */}
      <span className="text-[10px] leading-none text-transparent">.</span>
    </div>
  );
}
