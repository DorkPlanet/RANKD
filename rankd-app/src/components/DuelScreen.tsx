"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFilms, saveFilms } from "@/lib/store";
import { startRun, getPair, choose, confirm, pendingConfirm, flickToTop, jumpToTop, skipToFilm } from "@/lib/ladder";
import type { Film, RankState } from "@/lib/types";

const TIER = 4 as const;
const BARS = ["#D81E26", "#DAA520", "#00A3A3", "#1E3A8A", "#6B4E9E"];

// Visual cue for a flick: a floating clone of the poster arcs up toward the top
// of the screen and shrinks away, so you can see the film get thrown to the top.
function flyPosterUp(el: HTMLElement, poster: string) {
  const r = el.getBoundingClientRect();
  const dx = window.innerWidth / 2 - (r.left + r.width / 2);
  const dy = 130 - (r.top + r.height / 2);
  const clone = document.createElement("div");
  clone.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;border-radius:12px;overflow:hidden;z-index:9999;pointer-events:none;box-shadow:0 0 0 3px #DAA520,0 16px 44px rgba(218,165,32,.5)`;
  clone.innerHTML = `<img src="${poster}" style="width:100%;height:100%;object-fit:cover;display:block"/>`;
  document.body.appendChild(clone);
  clone
    .animate(
      [
        { transform: "translate(0,0) scale(1)", opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.5}px,-70px) scale(0.92)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${dx}px,${dy}px) scale(0.3)`, opacity: 0, offset: 1 },
      ],
      { duration: 480, easing: "cubic-bezier(.34,1.1,.64,1)" },
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

  if (!state) return null;
  const { session } = state;

  const decide = (winnerId: string) => setState(choose(state, winnerId));
  const flick = (filmId: string) => setState(flickToTop(state, filmId));
  const jump = () => setState(jumpToTop(state));
  const scrub = (filmId: string) => setState((s) => (s ? skipToFilm(s, filmId) : s));
  const lockIn = () => {
    const next = confirm(state);
    saveFilms(next.films); // confirmation is the only committed data
    setState(next);
  };

  const pair = getPair(state);
  const champion = pendingConfirm(state);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      <Header placed={session?.confirmed.length ?? 0} toGo={session?.unconfirmed.length ?? 0} />

      {champion ? (
        <ConfirmView champion={champion} rank={(session?.confirmed.length ?? 0) + 1} onConfirm={lockIn} />
      ) : pair && session ? (
        <Duel
          contender={pair.contender}
          challenger={pair.opponent}
          pile={session.unconfirmed}
          films={state.films}
          onPick={decide}
          onFlick={flick}
          onJump={jump}
          onScrub={scrub}
        />
      ) : (
        <TierComplete films={state.films} />
      )}
    </main>
  );
}

function Header({ placed, toGo }: { placed: number; toGo: number }) {
  return (
    <header className="px-6 pt-4 pb-2">
      <div className="text-center">
        <span className="font-display text-3xl tracking-[0.06em] text-[#f8de8d]" style={{ textShadow: "0 2px 20px rgba(218,165,32,0.22)" }}>
          RANKD
        </span>
        <div className="mt-1.5 flex items-center justify-center gap-1">
          {BARS.map((c) => (
            <span key={c} className="h-[3px] w-6 rounded-full" style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="mx-auto mt-3 max-w-[330px]">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-xs font-extrabold tracking-[0.12em] text-accent">{TIER}★ TIER</span>
          <span className="text-[11px] text-text/55">
            <b className="text-text-hi">{placed}</b> placed · {toGo} to go
          </span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${Math.round((placed / Math.max(placed + toGo, 1)) * 100)}%`,
              background: "linear-gradient(90deg, var(--accent-dk), var(--accent))",
            }}
          />
        </div>
      </div>
    </header>
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
  onJump,
  onScrub,
}: {
  contender: Film;
  challenger: Film;
  pile: string[]; // unconfirmed, index 0 = top
  films: Film[];
  onPick: (id: string) => void;
  onFlick: (id: string) => void;
  onJump: () => void;
  onScrub: (id: string) => void;
}) {
  // Low → high for the rolodex (bottom of pile first).
  const lowToHigh = useMemo(
    () => [...pile].reverse().map((id) => films.find((f) => f.id === id)!).filter(Boolean),
    [pile, films],
  );

  return (
    <>
      <div className="mt-3 flex flex-col items-center gap-0.5">
        <span className="text-[10px] font-extrabold tracking-[0.14em] text-accent">▲ CLIMBING</span>
        <span className="font-serif text-lg font-bold text-text-hi">{contender.title}</span>
        <span className="text-[11px] text-dim">Throw a poster up ↑ to send it to the top</span>
      </div>

      <div className="flex flex-1 items-center justify-center gap-3 px-4">
        <PosterCard film={contender} badge="CLIMBING" pick onPick={onPick} onFlick={onFlick} />
        <PosterCard film={challenger} badge="UN-RNKD" onPick={onPick} onFlick={onFlick} />
      </div>

      <Rolodex lowToHigh={lowToHigh} contenderId={contender.id} challengerId={challenger.id} onScrub={onScrub} />

      <div className="flex items-center justify-center pb-4">
        <button onClick={onJump} className="rounded-full border border-accent/40 bg-accent/5 px-4 py-1.5 text-[11px] font-bold tracking-wide text-accent active:scale-95">
          ↑ Jump to top
        </button>
      </div>
    </>
  );
}

function PosterCard({
  film,
  badge,
  pick,
  onPick,
  onFlick,
}: {
  film: Film;
  badge: string;
  pick?: boolean;
  onPick: (id: string) => void;
  onFlick: (id: string) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    // Capture the pointer so an upward drag off the poster still reports its
    // release here — without this the flick is lost the moment you leave the card.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore — capture is a best-effort enhancement
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dy = e.clientY - s.y;
    const dx = e.clientX - s.x;
    if (dy < -45 && Math.abs(dy) > Math.abs(dx)) {
      // upward throw → fly the poster to the top, then commit mid-flight
      const img = e.currentTarget.querySelector("img");
      if (img) flyPosterUp(img, film.poster ?? "");
      setTimeout(() => onFlick(film.id), 170);
    } else {
      onPick(film.id); // tap = pick winner
    }
  };

  return (
    <button
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      style={{ touchAction: "none" }}
      className="group relative flex w-[46%] max-w-[180px] flex-col items-center transition-transform active:scale-95"
    >
      <span className="mb-1.5 font-display text-lg tracking-wide text-text-hi">{film.title}</span>
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: "2 / 3",
          boxShadow: pick
            ? "0 0 0 3px var(--accent), 0 10px 30px rgba(218,165,32,0.35)"
            : "0 8px 26px rgba(0,0,0,0.55)",
          transform: pick ? "rotate(-2deg)" : "rotate(2deg)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={film.poster} alt={film.title} className="h-full w-full object-cover" draggable={false} />
      </div>
      <span
        className="mt-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-[0.07em]"
        style={
          pick
            ? { color: "var(--bg)", background: "var(--accent)" }
            : { color: "var(--dim)", background: "rgba(20,15,36,0.9)", border: "1px solid rgba(255,255,255,0.15)" }
        }
      >
        {badge}
      </span>
    </button>
  );
}

// ── The confirm moment: the champion tops the pile, take a real number ─────
function ConfirmView({ champion, rank, onConfirm }: { champion: Film; rank: number; onConfirm: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
      <span className="text-[11px] font-extrabold tracking-[0.14em] text-accent">🏆 TOPS THE PILE</span>
      <div className="w-40 overflow-hidden rounded-xl" style={{ boxShadow: "0 0 0 3px var(--accent), 0 12px 36px rgba(218,165,32,0.45)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={champion.poster} alt={champion.title} className="w-full" style={{ aspectRatio: "2 / 3", objectFit: "cover" }} />
      </div>
      <div>
        <div className="font-serif text-xl font-bold text-text-hi">{champion.title}</div>
        <div className="mt-1 font-serif text-5xl font-bold text-accent">#{rank}</div>
      </div>
      <button
        onClick={onConfirm}
        className="rounded-full px-8 py-3 text-sm font-extrabold tracking-wide active:scale-95"
        style={{ color: "var(--bg)", background: "var(--accent)", boxShadow: "0 4px 20px rgba(218,165,32,0.4)" }}
      >
        Lock in as #{rank}
      </button>
    </div>
  );
}

function TierComplete({ films }: { films: Film[] }) {
  const ranked = films.filter((f) => f.rating === TIER && f.confirmed).sort((a, b) => b.score - a.score);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="font-display text-2xl tracking-wide text-accent">🏆 Tier placed</div>
      <p className="font-serif italic text-dim">Every film in this tier has found its spot.</p>
      <ol className="mt-2 w-full max-w-xs space-y-1 text-left">
        {ranked.map((f, i) => (
          <li key={f.id} className="flex gap-3 text-sm text-text">
            <span className="w-6 text-right font-serif font-bold text-accent">{i + 1}</span>
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
  const pileKey = lowToHigh.map((f) => f.id).join(",");

  const contender = lowToHigh.find((f) => f.id === contenderId);
  const others = useMemo(() => lowToHigh.filter((f) => f.id !== contenderId), [lowToHigh, contenderId]);

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

  // Re-centre the challenger only when the PILE changes (start / flick / confirm),
  // never on a plain scrub — so the strip stays put under the thumb.
  useEffect(() => {
    if (prevPileKey.current === pileKey) return;
    prevPileKey.current = pileKey;
    requestAnimationFrame(() => {
      centerFilm(challengerId);
      syncHighlight();
    });
  }, [pileKey, challengerId]);

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
      if (userScrolling.current && id && id !== challengerId) onScrub(id);
      userScrolling.current = false;
    }, 100);
  };

  return (
    <div className="relative w-full pb-2 pt-1">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        onPointerDown={markUserScroll}
        onTouchStart={markUserScroll}
        onWheel={markUserScroll}
        className="flex items-end gap-2.5 overflow-x-auto px-[calc(50%-27px)] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [scroll-snap-type:x_proximity] [&::-webkit-scrollbar]:hidden"
      >
        {others.map((f) => (
          <div key={f.id} data-fid={f.id} className="rol-cell flex w-[54px] flex-shrink-0 flex-col items-center gap-1 [scroll-snap-align:center]">
            <div className="rol-poster w-full overflow-hidden rounded-md bg-card" style={{ aspectRatio: "2 / 3" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.poster} alt="" className="h-full w-full object-cover" draggable={false} />
            </div>
            <span className="text-[9px] font-bold tracking-wide text-dim/70">UN-RNKD</span>
          </div>
        ))}
      </div>

      {contender && (
        <div className="pointer-events-none absolute bottom-2 flex flex-col items-center gap-1" style={{ left: "50%", transform: "translateX(calc(-50% - 64px))", width: 54 }}>
          <div className="w-full overflow-hidden rounded-md" style={{ aspectRatio: "2 / 3", boxShadow: "0 0 0 2px var(--accent), 0 0 16px rgba(218,165,32,0.8)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={contender.poster} alt="" className="h-full w-full object-cover" />
          </div>
          <span className="font-serif text-xs font-extrabold tracking-wide text-accent">YOU</span>
        </div>
      )}
    </div>
  );
}
