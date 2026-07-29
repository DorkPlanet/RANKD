"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadFilms, saveFilms } from "@/lib/store";
import { startRun, getPair, choose, skipToFilm, rankedFilms } from "@/lib/ladder";
import type { Film, RankState } from "@/lib/types";

const TIER = 4 as const;
const BARS = ["#D81E26", "#DAA520", "#00A3A3", "#1E3A8A", "#6B4E9E"];

export default function DuelScreen() {
  const [state, setState] = useState<RankState | null>(null);

  // Boot: load the local library and start placing the 4★ tier.
  useEffect(() => {
    const films = loadFilms();
    try {
      setState(startRun(films, TIER));
    } catch {
      setState({ films, run: null });
    }
  }, []);

  if (!state) return null;

  const { films, run } = state;
  const pair = getPair(state);

  const decide = (winnerId: string) => {
    const next = choose(state, winnerId);
    saveFilms(next.films);
    setState(next);
  };

  // Rolodex scrub — aim the next duel at the film the player scrolled to.
  const scrub = (filmId: string) => setState((s) => (s ? skipToFilm(s, filmId) : s));

  // Overall ranks (best = 1).
  const order = rankedFilms(films);
  const rankOf = (id: string) => order.findIndex((f) => f.id === id) + 1;

  // Tier progress for the top bar.
  const pool = films.filter((f) => Math.abs(f.rating - TIER) <= (run?.maxDiff ?? 0));
  const placed = pool.filter((f) => f.rankLocked).length;
  const toGo = pool.length - placed;

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden select-none">
      {/* ── Header + tier bar ── */}
      <header className="px-6 pt-4 pb-2">
        <div className="text-center">
          <span
            className="font-display text-3xl tracking-[0.06em] text-[#f8de8d]"
            style={{ textShadow: "0 2px 20px rgba(218,165,32,0.22)" }}
          >
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
            <span className="text-[11px] text-text/55">{toGo} to go</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(Math.round((placed / Math.max(pool.length, 1)) * 100), 3)}%`,
                background: "linear-gradient(90deg, var(--accent-dk), var(--accent))",
              }}
            />
          </div>
        </div>
      </header>

      {pair ? (
        <Duel
          contender={pair.contender}
          opponent={pair.opponent}
          curRank={rankOf(pair.contender.id)}
          tgtRank={rankOf(pair.opponent.id)}
          pool={pool}
          order={order}
          onPick={decide}
          onScrub={scrub}
        />
      ) : (
        <TierComplete order={order} pool={pool} />
      )}
    </main>
  );
}

// ── The live duel: hero number, two posters, rolodex ──────────────────────
function Duel({
  contender,
  opponent,
  curRank,
  tgtRank,
  pool,
  order,
  onPick,
  onScrub,
}: {
  contender: Film;
  opponent: Film;
  curRank: number;
  tgtRank: number;
  pool: Film[];
  order: Film[];
  onPick: (id: string) => void;
  onScrub: (id: string) => void;
}) {
  return (
    <>
      {/* Hero number */}
      <div className="mt-3 flex flex-col items-center gap-0">
        <div className="flex items-center gap-2 font-sans">
          <span className="text-[10px] font-extrabold tracking-[0.12em] text-text/50">▲ NOW PLACING</span>
          <span className="text-[13px] font-bold text-text-hi">{contender.title}</span>
        </div>
        <div className="flex items-baseline gap-2.5 font-serif font-bold leading-none">
          <span className="text-[38px] text-text-hi">#{curRank}</span>
          <span className="text-2xl text-dim opacity-70">▸</span>
          <span className="text-[38px] text-dim">#{tgtRank}</span>
        </div>
      </div>

      {/* Two VS posters — tap to pick */}
      <div className="flex flex-1 items-center justify-center gap-3 px-4">
        <PosterCard film={contender} role="pick" onClick={() => onPick(contender.id)} />
        <PosterCard film={opponent} role="challenger" rank={tgtRank} onClick={() => onPick(opponent.id)} />
      </div>

      {/* Rolodex */}
      <Rolodex
        pool={pool}
        order={order}
        contenderId={contender.id}
        opponentId={opponent.id}
        onScrub={onScrub}
      />
    </>
  );
}

function PosterCard({
  film,
  role,
  rank,
  onClick,
}: {
  film: Film;
  role: "pick" | "challenger";
  rank?: number;
  onClick: () => void;
}) {
  const isPick = role === "pick";
  return (
    <button
      onClick={onClick}
      className="group relative flex w-[46%] max-w-[180px] flex-col items-center transition-transform active:scale-95"
    >
      <span className="mb-1.5 font-display text-lg tracking-wide text-text-hi">{film.title}</span>
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: "2 / 3",
          boxShadow: isPick
            ? "0 0 0 3px var(--accent), 0 10px 30px rgba(218,165,32,0.35)"
            : "0 8px 26px rgba(0,0,0,0.55)",
          transform: isPick ? "rotate(-2deg)" : "rotate(2deg)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={film.poster} alt={film.title} className="h-full w-full object-cover" />
      </div>
      <span
        className="mt-2 rounded-full px-2.5 py-1 text-[10px] font-extrabold tracking-[0.07em]"
        style={
          isPick
            ? { color: "var(--bg)", background: "var(--accent)" }
            : { color: "var(--text-hi)", background: "rgba(20,15,36,0.9)", border: "1px solid rgba(255,255,255,0.2)" }
        }
      >
        {isPick ? "YOUR PICK" : `CHALLENGER · #${rank}`}
      </span>
    </button>
  );
}

// Rolodex — the tier's ranked films low→high (worst left, best right). The
// contender rides as a fixed gold YOU marker just left of centre; finger-scroll
// the strip to aim the next duel at whichever film snaps to centre. Kept smooth
// by never reordering the strip, scaling via transform (no reflow), toggling the
// highlight imperatively, and only re-centring when the contender changes.
function Rolodex({
  pool,
  order,
  contenderId,
  opponentId,
  onScrub,
}: {
  pool: Film[];
  order: Film[];
  contenderId: string;
  opponentId: string;
  onScrub: (id: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef(0);
  const prevContender = useRef<string | null>(null);

  const contender = order.find((f) => f.id === contenderId);

  // Stable strip: the non-contender pool films, low→high. Independent of the
  // opponent, so a scrub never reorders or relayouts the strip.
  const list = useMemo(() => {
    const poolIds = new Set(pool.map((f) => f.id));
    const rankOf = (id: string) => order.findIndex((f) => f.id === id) + 1;
    return order
      .filter((f) => poolIds.has(f.id) && f.id !== contenderId)
      .reverse()
      .map((f) => ({ film: f, rank: rankOf(f.id) }));
  }, [pool, order, contenderId]);

  // Glue the "centred" highlight to whichever cell is nearest the middle —
  // imperative, so it tracks the scroll position with no React churn.
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

  // Re-centre ONLY when the contender changes (a new placement / first mount) —
  // never on a scrub, so the strip stays put under the player's thumb.
  useEffect(() => {
    if (prevContender.current === contenderId) return;
    prevContender.current = contenderId;
    requestAnimationFrame(() => {
      centerFilm(opponentId);
      syncHighlight();
    });
  }, [contenderId, opponentId]);

  // Re-apply the highlight after any re-render (React drops the imperative class
  // on reconciliation).
  useEffect(() => {
    syncHighlight();
  });

  const handleScroll = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(syncHighlight);
    if (scrubTimer.current) clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      const id = syncHighlight();
      if (id && id !== opponentId) onScrub(id);
    }, 100);
  };

  return (
    <div className="relative w-full pb-5 pt-2">
      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="flex items-end gap-2.5 overflow-x-auto px-[calc(50%-27px)] [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [scroll-snap-type:x_proximity] [&::-webkit-scrollbar]:hidden"
      >
        {list.map((c) => (
          <div
            key={c.film.id}
            data-fid={c.film.id}
            className="rol-cell flex w-[54px] flex-shrink-0 flex-col items-center gap-1 [scroll-snap-align:center]"
          >
            <div className="rol-poster w-full overflow-hidden rounded-md bg-card" style={{ aspectRatio: "2 / 3" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.film.poster} alt="" className="h-full w-full object-cover" draggable={false} />
            </div>
            <span className="font-serif text-xs font-bold text-dim">#{c.rank}</span>
          </div>
        ))}
      </div>

      {/* Fixed YOU marker — the contender, pinned just left of centre. */}
      {contender && (
        <div
          className="pointer-events-none absolute bottom-5 flex flex-col items-center gap-1"
          style={{ left: "50%", transform: "translateX(calc(-50% - 64px))", width: 54 }}
        >
          <div
            className="w-full overflow-hidden rounded-md"
            style={{ aspectRatio: "2 / 3", boxShadow: "0 0 0 2px var(--accent), 0 0 16px rgba(218,165,32,0.8)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={contender.poster} alt="" className="h-full w-full object-cover" />
          </div>
          <span className="font-serif text-xs font-extrabold tracking-wide text-accent">YOU</span>
        </div>
      )}
    </div>
  );
}

function TierComplete({ order, pool }: { order: Film[]; pool: Film[] }) {
  const poolIds = new Set(pool.map((f) => f.id));
  const ranked = order.filter((f) => poolIds.has(f.id));
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
