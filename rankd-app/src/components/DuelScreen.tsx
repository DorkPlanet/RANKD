"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFilms, saveFilms } from "@/lib/store";
import { startRun, getPair, choose, confirm, pendingConfirm, flickToTop, skipToFilm, stepBackFromConfirm } from "@/lib/ladder";
import { loadBrightness, saveBrightness, applyBrightness } from "@/lib/brightness";
import { fetchMeta, type FilmMeta } from "@/lib/meta";
import type { Film, RankState } from "@/lib/types";

const TIER = 4 as const;
const BARS = ["#D81E26", "#DAA520", "#00A3A3", "#1E3A8A", "#6B4E9E"];

// Spawn a copy of a poster that outlives the re-render, so a film can be seen
// leaving rather than simply being replaced.
function posterClone(r: DOMRect, poster: string, ring: string): HTMLElement {
  const clone = document.createElement("div");
  clone.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:12px;overflow:hidden;z-index:9999;pointer-events:none;box-shadow:${ring}`;
  clone.innerHTML = `<img src="${poster}" style="width:100%;height:100%;object-fit:cover;display:block"/>`;
  document.body.appendChild(clone);
  return clone;
}

// Flick: the poster carries on along the throw, so it leaves the way it was
// thrown rather than always arcing to the same spot regardless of the gesture.
function flyPosterAway(el: HTMLElement, poster: string, vx: number, vy: number) {
  const r = el.getBoundingClientRect();
  const mag = Math.hypot(vx, vy) || 1;
  const ux = vx / mag;
  const uy = vy / mag;
  const travel = Math.max(window.innerWidth, window.innerHeight);
  const spin = ux * 22; // lean into the direction of the throw
  const clone = posterClone(r, poster, "0 0 0 3px #e7b53e,0 16px 44px rgba(231,181,62,.5)");
  clone
    .animate(
      [
        { transform: "translate(0,0) rotate(0deg) scale(1)", opacity: 1, offset: 0 },
        {
          transform: `translate(${ux * travel * 0.3}px,${uy * travel * 0.3}px) rotate(${spin * 0.4}deg) scale(0.94)`,
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
  const clone = posterClone(el.getBoundingClientRect(), poster, "0 8px 26px rgba(0,0,0,0.55)");
  clone
    .animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1 },
        { transform: "translate(0,18px) scale(0.94)", opacity: 0 },
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
  const a = fromImg.getBoundingClientRect();
  const b = toImg.getBoundingClientRect();
  const clone = document.createElement("div");
  clone.style.cssText = `position:fixed;left:${a.left}px;top:${a.top}px;width:${a.width}px;height:${a.height}px;border-radius:12px;overflow:hidden;z-index:9999;pointer-events:none;box-shadow:0 0 0 3px #e7b53e,0 14px 38px rgba(0,0,0,.6)`;
  clone.innerHTML = `<img src="${poster}" style="width:100%;height:100%;object-fit:cover;display:block"/>`;
  document.body.appendChild(clone);
  clone
    .animate(
      [
        { transform: "translate(0,0) scale(1)", offset: 0 },
        { transform: `translate(${(b.left - a.left) * 0.5}px,-14px) scale(1.04)`, offset: 0.5 },
        { transform: `translate(${b.left - a.left}px,${b.top - a.top}px) scale(1)`, offset: 1 },
      ],
      { duration: 340, easing: "cubic-bezier(.4,0,.2,1)" },
    )
    .addEventListener("finish", () => clone.remove());
}

export default function DuelScreen() {
  const [state, setState] = useState<RankState | null>(null);

  useEffect(() => {
    const films = loadFilms();
    try {
      setState(startRun(films, TIER));
    } catch {
      setState({ films, session: null });
    }
  }, []);

  const [brightness, setBrightness] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [infoFilm, setInfoFilm] = useState<Film | null>(null);
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

  if (!state) return null;
  const { session } = state;

  const decide = (winnerId: string) => setState(choose(state, winnerId));
  const flick = (filmId: string) => setState(flickToTop(state, filmId));
  const scrub = (filmId: string) => setState((s) => (s ? skipToFilm(s, filmId) : s));
  const lockIn = () => {
    const next = confirm(state);
    saveFilms(next.films); // confirmation is the only committed data
    setState(next);
  };
  const backOut = () => setState(stepBackFromConfirm(state));

  const pair = getPair(state);
  const champion = pendingConfirm(state);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header />
      <TierProgress placed={session?.confirmed.length ?? 0} toGo={session?.unconfirmed.length ?? 0} />

      {champion ? (
        <ConfirmView
          champion={champion}
          rank={(session?.confirmed.length ?? 0) + 1}
          onConfirm={lockIn}
          onBack={(session?.unconfirmed.length ?? 0) > 1 ? backOut : undefined}
        />
      ) : pair && session ? (
        <Duel
          contender={pair.contender}
          challenger={pair.opponent}
          pile={session.unconfirmed}
          films={state.films}
          onPick={decide}
          onFlick={flick}
          onScrub={scrub}
          onInfo={setInfoFilm}
        />
      ) : (
        <TierComplete films={state.films} />
      )}

      <BottomNav onSettings={() => setSettingsOpen(true)} />

      {infoFilm && <FilmInfo film={infoFilm} onClose={() => setInfoFilm(null)} />}

      {settingsOpen && (
        <Settings brightness={brightness} onChange={changeBrightness} onClose={() => setSettingsOpen(false)} />
      )}
    </main>
  );
}

// Bottom nav — bookends the black header, so the play area sits between two
// dark bands. Sized to its final height now, so adding List/Stats later slots
// in without re-flowing the duel.
function BottomNav({ onSettings }: { onSettings: () => void }) {
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
      <NavItem label="End session" icon={<StopIcon />} />
      <NavItem label="Rank" active icon={<RankdMark />} />
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
function Settings({ brightness, onChange, onClose }: { brightness: number; onChange: (t: number) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl border-t border-border bg-surface px-6 pb-9 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
        <div className="mb-6 flex items-center justify-between">
          <span className="font-display text-2xl tracking-wide text-gold">Settings</span>
          <button onClick={onClose} className="text-sm font-semibold text-dim active:scale-95">
            Done
          </button>
        </div>
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
      </div>
    </div>
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
function TierProgress({ placed, toGo }: { placed: number; toGo: number }) {
  return (
    <div className="px-6">
      {/* mt-8 clears the header's 44px feather so the progress bar doesn't sit
          inside the fade. */}
      <div className="mx-auto mt-8 max-w-[330px]">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-extrabold tracking-[0.12em] text-gold">{TIER}★ TIER</span>
          <span className="text-[11px] text-text/55">
            <b className="text-text-hi">{placed}</b> placed · {toGo} to go
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
  films,
  onPick,
  onFlick,
  onScrub,
  onInfo,
}: {
  contender: Film;
  challenger: Film;
  pile: string[]; // unconfirmed, index 0 = top
  films: Film[];
  onPick: (id: string) => void;
  onFlick: (id: string) => void;
  onScrub: (id: string) => void;
  onInfo: (film: Film) => void;
}) {
  const arenaRef = useRef<HTMLDivElement>(null);

  // Intercept a win by the right-hand card so it slides into the climbing seat
  // before the state swap paints. Picking the left card needs none of this — it
  // is already where it is going to be.
  const pick = (id: string) => {
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

  return (
    <>
      <div className="mt-3 flex flex-col items-center">
        <Tips />
      </div>

      <div ref={arenaRef} className="flex flex-1 items-center justify-center gap-3 px-4">
        <PosterCard film={contender} badge="CLIMBING" pick onPick={pick} onFlick={onFlick} onInfo={onInfo} />
        <PosterCard film={challenger} badge="UN-RNKD" onPick={pick} onFlick={onFlick} onInfo={onInfo} />
      </div>

      <Rolodex lowToHigh={lowToHigh} contenderId={contender.id} challengerId={challenger.id} onScrub={onScrub} />
    </>
  );
}

// Every mechanic the duel screen understands, cycled one at a time — the screen
// carries no chrome explaining itself, so this is where the game gets taught.
const TIPS = [
  "Tap the film you like more",
  "Whichever film wins keeps climbing",
  "Flick a film up to send it straight to the top",
  "Hold a film to see who's in it and what it's about",
  "Swipe the row below to choose who you face next",
  "Pick a film below yours to move down the list",
  "Nothing's saved until you lock a film into place",
];
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
  onInfo,
}: {
  film: Film;
  badge: string;
  pick?: boolean;
  onPick: (id: string) => void;
  onFlick: (id: string) => void;
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
    if (dy < -45 && Math.abs(dy) > Math.abs(dx)) {
      // upward throw → send the poster off along the throw, commit mid-flight
      const img = e.currentTarget.querySelector("img");
      if (img) flyPosterAway(img, film.poster ?? "", dx, dy);
      setTimeout(() => onFlick(film.id), 170);
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
        style={{ rotate: pick ? "-2deg" : "2deg" }}
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
}: {
  champion: Film;
  rank: number;
  onConfirm: () => void;
  onBack?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <span className="text-[11px] font-extrabold tracking-[0.14em] text-gold">🏆 TOPS THE PILE</span>
      <div className="w-40 overflow-hidden rounded-xl" style={{ boxShadow: "0 0 0 3px var(--gold), 0 12px 36px color-mix(in srgb, var(--gold) 45%, transparent)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={champion.poster} alt={champion.title} className="w-full" style={{ aspectRatio: "2 / 3", objectFit: "cover" }} />
      </div>
      <div>
        <div className="font-serif text-xl font-bold text-text-hi">{champion.title}</div>
        <div className="mt-1 font-serif text-5xl font-bold text-gold">#{rank}</div>
      </div>
      <button
        onClick={onConfirm}
        className="rounded-full px-8 py-3 text-sm font-extrabold tracking-wide active:scale-95"
        style={{ color: "#1c1405", background: "var(--gold)", boxShadow: "0 4px 20px color-mix(in srgb, var(--gold) 40%, transparent)" }}
      >
        Lock in as #{rank}
      </button>
      {onBack && (
        <button onClick={onBack} className="-mt-2 text-xs font-semibold text-dim active:scale-95">
          Not yet — keep playing
        </button>
      )}
    </div>
  );
}

function TierComplete({ films }: { films: Film[] }) {
  const ranked = films.filter((f) => f.rating === TIER && f.confirmed).sort((a, b) => b.score - a.score);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="font-display text-2xl tracking-wide text-gold">🏆 Tier placed</div>
      <p className="font-serif italic text-dim">Every film in this tier has found its spot.</p>
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
  contenderId,
  challengerId,
  onScrub,
}: {
  lowToHigh: Film[];
  contenderId: string;
  challengerId: string;
  onScrub: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef(0);
  const userScrolling = useRef(false);
  const prevPileKey = useRef("");
  const prevContenderId = useRef("");
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
    <div className="relative w-full pb-3">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        onPointerDown={markUserScroll}
        onTouchStart={markUserScroll}
        onWheel={markUserScroll}
        // pt-4: the centred poster scales 1.16x upward from its bottom edge, and
        // overflow-x:auto forces overflow-y to auto — without headroom the track
        // slices the top off it.
        className="rol-track flex items-end gap-2.5 overflow-x-auto pb-4 pt-7 px-[calc(50%-25px)] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [scroll-snap-type:x_proximity] [&::-webkit-scrollbar]:hidden"
      >
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
      </div>
    </div>
  );
}
